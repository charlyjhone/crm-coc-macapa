// Agente de triagem da escola.
//
// Recebe TODA mensagem inbound (WhatsApp via trigger, e-mail via trigger),
// classifica o assunto, responde sozinho os assuntos simples (currículo,
// horário, localização) e também matrícula até o nível de valores.
// Quando a conversa aprofunda ou a família pede atendimento humano,
// marca o contato como "aguardando secretaria" e avisa a família.
//
// Comportamentos especiais:
//   - Se o lead não tem nome real (começa com "Contato"), Ana pergunta o nome.
//   - Se o lead está em handoff há mais de 4h sem resposta humana, Ana retoma.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-school-triage-secret",
};

const DEFAULT_INFO = "Informações oficiais não cadastradas. Encaminhe dúvidas específicas à secretaria sem inventar dados.";

const ASSUNTOS = ["matricula", "financeiro", "curriculo", "horario", "localizacao", "outros"] as const;
type Assunto = typeof ASSUNTOS[number];

// Assuntos que o agente resolve por completo sozinho.
const AUTO_RESOLVE: Assunto[] = ["financeiro", "curriculo", "horario", "localizacao"];

// Handoff esfria após 4 horas sem resposta humana → Ana retoma.
const HANDOFF_COOLDOWN_MS = 4 * 60 * 60 * 1000;

interface Triagem {
  assunto: Assunto;
  interesse: "alto" | "medio" | "baixo" | "indefinido";
  precisa_humano: boolean;
  motivo_humano: string | null;
  resumo: string;
  resposta: string;
  nome_extraido: string | null;
  cadastro: {
    responsavel: string | null;
    aluno: string | null;
    ano: number | null;
    serie: string | null;
    turno: string | null;
  };
}

const SERIES = ["Maternal", "Jardim I", "Jardim II", "1º ano", "2º ano", "3º ano",
  "4º ano", "5º ano", "6º ano", "7º ano", "8º ano", "9º ano",
  "1ª série", "2ª série", "3ª série"];

function enrollmentDraft(c: Triagem["cadastro"]) {
  if (!c || !c.responsavel || !c.aluno || !c.ano || !c.serie ||
      !Number.isInteger(c.ano) || c.ano < 2026 || c.ano > 2100 ||
      !SERIES.includes(c.serie)) return null;
  const responsible = c.responsavel.trim();
  const student = c.aluno.trim();
  const shift = c.turno?.trim() || null;
  if (responsible.length < 3 || responsible.length > 160 ||
      student.length < 3 || student.length > 160 ||
      /[\r\n:]/.test(responsible + student) ||
      (shift && !["manhã", "tarde", "integral"].includes(shift))) return null;
  return { responsible, student, year: c.ano, grade: c.serie, shift };
}

function confirmationText(c: NonNullable<ReturnType<typeof enrollmentDraft>>) {
  return `Para cadastrar o interesse, confirme estes dados:\nResponsável: ${c.responsible}\nAluno: ${c.student}\nAno letivo: ${c.year}\nSérie: ${c.grade}\nTurno: ${c.shift || "não informado"}\nPosso cadastrar esse interesse no CRM?`;
}

function confirmedDraftFromReply(message: string) {
  const match = message.match(/Para cadastrar o interesse, confirme estes dados:\nResponsável: ([^\r\n]+)\nAluno: ([^\r\n]+)\nAno letivo: (\d{4})\nSérie: ([^\r\n]+)\nTurno: ([^\r\n]+)\nPosso cadastrar esse interesse no CRM\?/);
  if (!match) return null;
  const draft = enrollmentDraft({ responsavel: match[1], aluno: match[2],
    ano: Number(match[3]), serie: match[4], turno: match[5] === "não informado" ? null : match[5] });
  return draft && message.includes(confirmationText(draft)) ? draft : null;
}

function isExplicitConfirmation(text: string) {
  return /^(?:sim|sim,? pode cadastrar|pode|pode sim|confirmo|confirmado|correto|isso mesmo|está correto|ta correto|pode cadastrar)[.!\s]*$/i.test(text.trim());
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Retorna true se o nome é um placeholder gerado automaticamente. */
function isPlaceholderName(name: string | null): boolean {
  if (!name) return true;
  return name.startsWith("Contato ") || name.startsWith("Contato por");
}

function isAnaOutbound(message: { message?: string | null; raw_data?: Record<string, unknown> | null }): boolean {
  return message.raw_data?.sender_type === "ana" ||
    message.raw_data?.source === "school-triage" ||
    /^\*\[Atendente [^\]\r\n]+\]\*/.test(message.message || "");
}

function isConversationClosing(text: string): boolean {
  const normalized = text.toLocaleLowerCase("pt-BR").trim().replace(/[.!?]+$/g, "");
  return /^(?:não|nao|não obrigado|nao obrigado|obrigad[oa](?: mesmo)?|muito obrigad[oa]|valeu|ok|okay|tá bom|ta bom|beleza|só isso|so isso|somente isso|apenas isso|era só|era so|era isso(?: mesmo)?|é só isso|e so isso|só queria saber isso|so queria saber isso|não preciso de mais nada|nao preciso de mais nada|por enquanto (?:é|e) só isso|por enquanto (?:é|e) so isso|perfeito|resolvido|👍|🙏)$/.test(normalized);
}

function removeRepeatedHelpOffer(reply: string): string {
  return reply
    .replace(/(?:\s*\n*)?(?:enquanto isso,?\s*)?(?:posso|podemos) (?:te |lhe )?ajudar em algo mais\??/gi, "")
    .trim();
}

async function processDueFollowups(supabase: any, supabaseUrl: string, serviceKey: string, agentName: string) {
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("ana_followups")
    .select("id, lead_id, phone, handoff_at")
    .eq("status", "pending")
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(20);
  if (error) throw error;

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const item of due || []) {
    const { data: claimed } = await supabase
      .from("ana_followups")
      .update({ status: "processing", processed_at: now })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("triage_status, handoff_at")
      .eq("id", item.lead_id)
      .maybeSingle();

    if (leadError) throw leadError;
    const sameHandoff = lead?.triage_status === "aguardando_secretaria" &&
      lead?.handoff_at && new Date(lead.handoff_at).getTime() === new Date(item.handoff_at).getTime();
    if (!sameHandoff) {
      await supabase.from("ana_followups").update({ status: "cancelled", cancel_reason: "handoff_changed" }).eq("id", item.id);
      cancelled++;
      continue;
    }

    const { data: messages, error: messagesError } = await supabase
      .from("whatsapp_messages")
      .select("direction, message, raw_data, created_at")
      .eq("phone", item.phone)
      .gt("created_at", item.handoff_at)
      .order("created_at", { ascending: true })
      .limit(50);

    if (messagesError) throw messagesError;
    const userContinued = (messages || []).some((m: any) => m.direction === "inbound");
    const humanReplied = (messages || []).some((m: any) => m.direction === "outbound" && !isAnaOutbound(m));
    if (userContinued || humanReplied) {
      await supabase.from("ana_followups").update({
        status: "cancelled",
        cancel_reason: humanReplied ? "human_replied" : "user_continued",
      }).eq("id", item.id);
      cancelled++;
      continue;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        phone: item.phone,
        leadId: item.lead_id,
        senderType: "ana",
        message: `*[Atendente ${agentName}]*\nEnquanto você aguarda a Secretaria, posso ajudar em algo mais?`,
      }),
    });

    await supabase.from("ana_followups").update({
      status: response.ok ? "sent" : "failed",
      sent_at: response.ok ? new Date().toISOString() : null,
      error_message: response.ok ? null : (await response.text()).slice(0, 500),
    }).eq("id", item.id).eq("status", "processing");
    if (response.ok) sent++; else failed++;
    } catch {
      await supabase.from("ana_followups").update({ status: "failed", error_message: "followup_processing_failed" }).eq("id", item.id).eq("status", "processing");
      failed++;
    }
  }

  return { processed: (due || []).length, sent, cancelled, failed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let failureLeadId: string | null = null;
  let previewOnly = false;
  try {
    const internalSecret = req.headers.get("x-school-triage-secret") || "";
    if (!internalSecret) return json({ error: "unauthorized" }, 401);

    const { data: secretIsValid, error: secretError } = await supabase.rpc(
      "verify_school_triage_secret",
      { p_secret: internalSecret },
    );
    if (secretError || secretIsValid !== true) {
      if (secretError) console.error("Falha ao validar a chamada interna:", secretError.message);
      return json({ error: "unauthorized" }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    previewOnly = payload.action === "preview";

    const channel: "whatsapp" | "email" = payload.channel === "email" ? "email" : "whatsapp";
    const text: string = (payload.text || "").toString().trim();
    const phone: string | null = payload.phone || null;
    const messageId: string | null = payload.message_id || null;
    let leadId: string | null = payload.lead_id || null;

    if (!text && payload.action !== "process_followups") return json({ skipped: "empty_text" });

    // ---- Configurações da escola ----
    const { data: settingsRows, error: settingsError } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["escola_agente_ativo", "escola_info", "escola_valores", "escola_nome", "escola_agente_nome"]);
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { if (r.value) settings[r.key] = r.value; });

    if (settingsError) throw new Error("school_settings_unavailable");
    if (settings.escola_agente_ativo !== "true") {
      return json({ skipped: "agent_disabled" });
    }

    const agentName = (settings.escola_agente_nome || "Ana").trim().slice(0, 40).replace(/[\r\n\[\]*<>]/g, "") || "Ana";

    if (payload.action === "process_followups") {
      return json({ success: true, ...(await processDueFollowups(supabase, supabaseUrl, serviceKey, agentName)) });
    }

    const escolaNome = settings.escola_nome || "a escola";
    const escolaInfo = settings.escola_info || DEFAULT_INFO;
    const escolaValores = settings.escola_valores || "";

    // ---- Resolver ou criar o contato ----
    if (!leadId && phone) {
      const { data: ids } = await supabase.rpc("resolve_lead_ids_by_phone", { p_phone: phone });
      const first = Array.isArray(ids) ? ids[0] : null;
      leadId = typeof first === "string" ? first : (first?.resolve_lead_ids_by_phone ?? null);
    }

    if (!leadId && !previewOnly) {
      const { data: created, error: createErr } = await supabase
        .from("leads")
        .insert({
          name: phone ? `Contato ${phone}` : "Contato por e-mail",
          phone,
          source: channel,
          status: "novo",
          unclassified: false,
          triage_status: "novo",
        })
        .select("id")
        .single();
      if (createErr) {
        console.error("Falha ao criar contato:", createErr);
        return json({ error: "create_lead_failed" }, 500);
      }
      leadId = created.id;
    }

    failureLeadId = leadId;
    const { data: lead, error: leadError } = leadId ? await supabase
      .from("leads")
      .select("id, name, email, phone, triage_status, assunto, handoff_at")
      .eq("id", leadId!)
      .maybeSingle() : { data: null, error: null };
    if (leadError || (!lead && !previewOnly)) throw new Error("contact_unavailable");

    // Quando um funcionário assumiu a conversa recentemente, a Ana não deve
    // atravessar o atendimento humano. Após o mesmo cooldown do handoff, ela
    // pode voltar a atender uma nova conversa normalmente.
    if (channel === "whatsapp" && phone) {
      const { data: saidasRecentes, error: saidasError } = await supabase
        .from("whatsapp_messages")
        .select("message, raw_data, created_at")
        .eq("phone", phone)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(50);
      if (saidasError) throw new Error("human_handoff_check_failed");
      const ultimaSaida = (saidasRecentes || []).find((m: any) => !isAnaOutbound(m));
      const humanConversationActive = !!ultimaSaida &&
        !isAnaOutbound(ultimaSaida) &&
        Date.now() - new Date(ultimaSaida.created_at).getTime() < HANDOFF_COOLDOWN_MS;
      if (humanConversationActive) {
        return json({ skipped: "human_conversation_active", lead_id: leadId });
      }
    }

    // ---- Lógica de handoff ----
    // Um handoff pendente não bloqueia dúvidas autônomas. A Ana continua
    // respondendo FAQs enquanto a secretaria trata o assunto encaminhado.
    let handoffPendente = lead?.triage_status === "aguardando_secretaria";
    const apenasEncerramento = isConversationClosing(text);

    // Se a última pergunta da Ana foi se poderia ajudar em algo mais, uma resposta
    // curta de encerramento deve ficar silenciosa mesmo que o estado do handoff
    // tenha mudado entre as mensagens.
    let anaAcabouDeOferecerAjuda = false;
    if (channel === "whatsapp" && phone && apenasEncerramento) {
      const { data: ultimaSaida } = await supabase
        .from("whatsapp_messages")
        .select("message, raw_data")
        .eq("phone", phone)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      anaAcabouDeOferecerAjuda = !!ultimaSaida && isAnaOutbound(ultimaSaida) &&
        /posso ajudar em algo mais/i.test(ultimaSaida.message || "");
    }

    if (apenasEncerramento && (handoffPendente || anaAcabouDeOferecerAjuda)) {
      if (!previewOnly) await supabase
        .from("ana_followups")
        .update({ status: "cancelled", cancel_reason: "conversation_closed" })
        .eq("lead_id", leadId!)
        .eq("status", "pending");
      return json({ skipped: "conversation_closed", lead_id: leadId });
    }

    if (handoffPendente) {
      const handoffAt = lead?.handoff_at ? new Date(lead.handoff_at).getTime() : 0;
      const agora = Date.now();
      const esfriou = (agora - handoffAt) >= HANDOFF_COOLDOWN_MS;

      if (esfriou) {
        if (phone) {
          const { data: saidasAposHandoff } = await supabase
            .from("whatsapp_messages")
            .select("id, message, raw_data")
            .eq("phone", phone)
            .eq("direction", "outbound")
            .gt("created_at", lead?.handoff_at)
            .limit(20);

          if ((saidasAposHandoff || []).some((m: any) => !isAnaOutbound(m))) {
            return json({ skipped: "human_replied_after_handoff", lead_id: leadId });
          }
        }

        if (!previewOnly) await supabase
          .from("leads")
          .update({ triage_status: "respondido_agente", resolved_at: null, handoff_at: null, handoff_reason: null })
          .eq("id", leadId!);

        handoffPendente = false;
        console.log(`Handoff esfriou para lead ${leadId} — Ana retomando atendimento.`);
      }
    }

    // ---- Detectar se funcionário assumiu durante o processamento ----
    let inboundCreatedAt: string | null = null;
    if (channel === "whatsapp" && messageId) {
      const { data: inboundMessage } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("id", messageId)
        .eq("direction", "inbound")
        .maybeSingle();
      inboundCreatedAt = inboundMessage?.created_at || null;
    }

    const employeeAlreadyReplied = async () => {
      if (channel !== "whatsapp" || !phone || !inboundCreatedAt) return false;
      const { data: outbound } = await supabase
        .from("whatsapp_messages")
        .select("id, message, raw_data")
        .eq("phone", phone)
        .eq("direction", "outbound")
        .gt("created_at", inboundCreatedAt)
        .limit(20);
      return (outbound || []).some((m: any) => !isAnaOutbound(m));
    };

    if (await employeeAlreadyReplied()) {
      return json({ skipped: "employee_already_replied", lead_id: leadId });
    }

    // Falha de transcrição não deve ser interpretada pela IA nem gerar handoff.
    if (/^\[(Mensagem de )?[ÁA]udio (não transcrito|[-–] erro (na transcrição|ao processar))\]$/i.test(text)) {
      if (channel === "whatsapp" && phone) {
        const audioReply = `*[Atendente ${agentName}]*\nNão consegui entender o áudio. Pode reenviar ou escrever sua dúvida, por favor?`;
        if (previewOnly) return json({ preview: true, resposta: audioReply, skipped: "audio_transcription_failed" });
        const r = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ phone, message: audioReply, leadId, senderType: "ana" }),
        });
        if (!r.ok) throw new Error("audio_reply_send_failed");
        return json({ success: r.ok, skipped: "audio_transcription_failed", lead_id: leadId, enviado: r.ok });
      }
      return json({ skipped: "audio_transcription_failed", lead_id: leadId });
    }

    // ---- Histórico curto para dar contexto ao agente ----
    let historico = "";
    if (phone) {
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("direction, message, timestamp, created_at")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(12);
      historico = (msgs || [])
        .reverse()
        .map((m: any) => `${m.direction === "inbound" ? "Família" : "Escola"}: ${(m.message || "").slice(0, 400)}`)
        .join("\n");
    } else if (leadId) {
      const { data: msgs } = await supabase
        .from("email_messages")
        .select("direction, subject, message, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(8);
      historico = (msgs || [])
        .reverse()
        .map((m: any) => `${m.direction === "inbound" ? "Família" : "Escola"}: ${(m.message || m.subject || "").slice(0, 400)}`)
        .join("\n");
    }

    // ---- Contexto do contato para personalização ----
    const nomeReal = !isPlaceholderName(lead?.name) ? lead!.name : null;
    const primeiroContato = !historico || historico.split("\n").filter(l => l.startsWith("Família")).length <= 1;
    const pedidosDeNome = (historico.match(/(?:dizer|informar|qual (?:é|e)) (?:o )?seu nome/gi) || []).length;
    const devePerguntar = isPlaceholderName(lead?.name) && (primeiroContato || pedidosDeNome < 2);

    // ---- Chamada de IA ----
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("ai_not_configured");

    const saudacaoInstrucao = nomeReal
      ? `O nome desta pessoa é "${nomeReal}". Use o nome para cumprimentá-la quando fizer sentido (ex: "Bom dia, ${nomeReal}!").`
      : devePerguntar
      ? `Você ainda não sabe o nome desta pessoa. No início da sua resposta, cumprimente e pergunte o nome de forma natural (ex: "Olá! Para te atender melhor, pode me dizer seu nome?"). Depois responda a dúvida normalmente se já houver uma. Coloque o nome extraído em "nome_extraido" caso a pessoa tenha se apresentado nesta mensagem; caso contrário, deixe null.`
      : `Você ainda não sabe o nome desta pessoa. Cumprimente cordialmente sem usar nome.`;

    const systemPrompt = `Você é ${agentName}, atendente virtual de ${escolaNome}. Responde em português do Brasil, de forma curta, cordial e objetiva (no máximo 5 linhas), pelo canal ${channel === "whatsapp" ? "WhatsApp" : "e-mail"}.

${saudacaoInstrucao}

INFORMAÇÕES OFICIAIS DA ESCOLA:
${escolaInfo}

${escolaValores ? `VALORES DE MATRÍCULA E MENSALIDADE:\n${escolaValores}` : "VALORES: ainda não cadastrados. Para perguntas gerais sobre os valores de 2027, informe que estarão disponíveis a partir de novembro, convide para conhecer a escola nesse período e pergunte se deseja registrar interesse para contato. Não informe preços nem prometa agendamento automático. Para pedidos de preço exato ou valores de outros anos, marque precisa_humano = true e encaminhe à secretaria."}

REGRAS:
- Assuntos "curriculo", "horario" e "localizacao": responda com a informação oficial e encerre com cordialidade. precisa_humano = false.
- Assunto "matricula": você pode explicar o processo e informar os valores acima. Se a família pedir falar com uma pessoa, negociar, pedir desconto, tratar de caso específico da criança, documentos, vaga em turma específica, ou fizer qualquer pergunta que não esteja nas informações oficiais → precisa_humano = true.
- Quando perguntarem pelos valores de 2027 ainda não cadastrados, use como referência: "Os valores para 2027 estarão disponíveis a partir de novembro. 😊 Se você quiser, será um prazer receber sua família para uma visita! Assim, vocês poderão conhecer nossa estrutura, as ferramentas que utilizamos e as novidades que estamos preparando para o próximo ano. Posso anotar seu interesse para entrarmos em contato quando os valores forem divulgados?" Para a informação geral, precisa_humano = false. Se a família aceitar o contato posterior ou pedir agendamento, precisa_humano = true para a secretaria registrar e acompanhar.\n- REGRA DE SETOR: dúvidas de interessados sobre valores de matrícula ou mensalidade, descontos para uma nova matrícula e condições comerciais são da SECRETARIA, com exceção da previsão geral de divulgação de 2027 acima. Nunca encaminhe interessados ou responsáveis em fase de matrícula ao Financeiro.
- O FINANCEIRO atende somente famílias que já são clientes/alunos matriculados, e apenas em assuntos posteriores à matrícula, como mensalidade vencida, segunda via, pagamento não identificado ou negociação de débito existente. Só forneça o contato do Financeiro nesses casos.
- Quando a pessoa confirmar que já é cliente e trouxer um desses assuntos posteriores à matrícula, classifique como "financeiro", informe a orientação oficial e use precisa_humano = false se a dúvida estiver totalmente respondida.
- Se não estiver claro se a pessoa já é cliente, pergunte antes de indicar o Financeiro: "O aluno já está matriculado conosco?".
- Nunca invente informação que não esteja acima. Se não souber → precisa_humano = true.
- Se a pessoa fizer um pedido amplo, como "quero mais informações da escola", não encaminhe imediatamente. Faça uma pergunta curta para identificar série, turno ou assunto, classifique como "matricula" quando houver interesse escolar e use precisa_humano = false enquanto estiver qualificando.
- Para um interesse de matrícula, pergunte naturalmente nome completo do responsável, nome do aluno, ano letivo e série pretendida. O turno é opcional. Preencha cadastro com dados ditos pela família no histórico, sem deduzir nomes, ano ou série. Se faltar algum campo, pergunte apenas o que falta. Nunca diga que já cadastrou: o sistema pedirá confirmação e informará o resultado. O cadastro é de interesse, não matrícula confirmada. Se houver negociação, vaga específica ou pedido de pessoa, encaminhe à secretaria sem tentar cadastrar automaticamente.
- Se a mensagem atual for "sim" em resposta ao resumo de cadastro enviado por você, classifique como matrícula e mantenha o contexto. O sistema confere os dados no resumo anterior antes de cadastrar.
- Se precisa_humano = true, a "resposta" deve avisar de forma gentil que a secretaria vai continuar o atendimento em breve.
- Ao encaminhar pela primeira vez, finalize com "Enquanto isso, posso ajudar em algo mais?".
- Se já houver atendimento da secretaria pendente, continue respondendo normalmente dúvidas autônomas presentes nas informações oficiais, como endereço, horário, localização, currículo e etapas de ensino. Não cancele o handoff existente.
- Se já houver atendimento da secretaria pendente, nunca repita "Posso ajudar em algo mais?" e não anuncie novamente o mesmo encaminhamento. Apenas responda a nova dúvida ou confirme brevemente que a informação adicional será considerada pela equipe.
- Nunca prometa prazos que não estejam nas informações oficiais.
- IMPORTANTE: Se você acabou de perguntar o nome e a pessoa ainda não trouxe um assunto específico, use assunto="outros" e precisa_humano=false (apenas aguardando apresentação).

Responda SOMENTE com JSON válido:
{"assunto":"matricula|financeiro|curriculo|horario|localizacao|outros","interesse":"alto|medio|baixo|indefinido","precisa_humano":true|false,"motivo_humano":"texto curto ou null","resumo":"1 frase sobre o que a pessoa quer","resposta":"mensagem a enviar","nome_extraido":"nome real se a pessoa se apresentou nesta mensagem, ou null","cadastro":{"responsavel":"nome completo ou null","aluno":"nome ou null","ano":2027,"serie":"série ou null","turno":"manhã|tarde|integral ou null"}}`;

    const userPrompt = `Histórico recente da conversa:\n${historico || "(sem histórico)"}\n\nÚltima mensagem recebida:\n${text}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: AbortSignal.timeout(25000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "triagem_escolar",
            strict: true,
            schema: {
              type: "object",
              properties: {
                assunto: { type: "string", enum: [...ASSUNTOS] },
                interesse: { type: "string", enum: ["alto", "medio", "baixo", "indefinido"] },
                precisa_humano: { type: "boolean" },
                motivo_humano: { type: ["string", "null"] },
                resumo: { type: "string" },
                resposta: { type: "string" },
                nome_extraido: { type: ["string", "null"] },
                cadastro: {
                  type: "object",
                  properties: {
                    responsavel: { type: ["string", "null"] },
                    aluno: { type: ["string", "null"] },
                    ano: { type: ["integer", "null"] },
                    serie: { type: ["string", "null"] },
                    turno: { type: ["string", "null"] },
                  },
                  required: ["responsavel", "aluno", "ano", "serie", "turno"],
                  additionalProperties: false,
                },
              },
              required: ["assunto", "interesse", "precisa_humano", "motivo_humano", "resumo", "resposta", "nome_extraido", "cadastro"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("Erro no gateway de IA:", aiRes.status, detail);
      if (!previewOnly) await supabase.from("leads").update({ triage_status: "aguardando_secretaria", resolved_at: null, handoff_at: new Date().toISOString(), handoff_reason: "Falha do agente de IA" }).eq("id", leadId!);
      return json({ error: "ai_gateway_error", status: aiRes.status, detail }, aiRes.status === 429 || aiRes.status >= 500 ? 503 : 500);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    let triagem: Triagem;
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      triagem = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    } catch (e) {
      console.error("Resposta da IA não é JSON válido");
      if (!previewOnly) await supabase.from("leads").update({ triage_status: "aguardando_secretaria", resolved_at: null, handoff_at: new Date().toISOString(), handoff_reason: "Resposta do agente ilegível" }).eq("id", leadId!);
      return json({ error: "ai_parse_error" }, 500);
    }

    if (typeof triagem.resposta !== "string" || !triagem.resposta.trim() ||
        typeof triagem.precisa_humano !== "boolean" ||
        !ASSUNTOS.includes(triagem.assunto) ||
        !["alto", "medio", "baixo", "indefinido"].includes(triagem.interesse)) {
      throw new Error("invalid_triage_response");
    }

    let assunto: Assunto = ASSUNTOS.includes(triagem.assunto) ? triagem.assunto : "outros";
    // Se ainda estamos coletando o nome e a pessoa ainda não trouxe assunto definido,
    // não forçar handoff — Ana está apenas aguardando apresentação.
    const apenasColetandoNome = devePerguntar && assunto === "outros" && !triagem.precisa_humano;
    let precisaHumano = !apenasColetandoNome && !!triagem.precisa_humano;
    let resposta = (triagem.resposta || "").trim();
    let draft = assunto === "matricula" && !precisaHumano && !handoffPendente && channel === "whatsapp"
      ? enrollmentDraft(triagem.cadastro) : null;
    let shouldRegister = false;
    if (phone && !handoffPendente && channel === "whatsapp") {
      const { data: previous } = await supabase.from("whatsapp_messages")
        .select("message, raw_data").eq("phone", phone).eq("direction", "outbound")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const confirmedDraft = previous && isAnaOutbound(previous)
        ? confirmedDraftFromReply(previous.message || "") : null;
      if (confirmedDraft && isExplicitConfirmation(text)) {
        draft = confirmedDraft;
        shouldRegister = true;
        precisaHumano = false;
        assunto = "matricula";
      } else if (draft) {
        resposta = confirmationText(draft);
      }
    }
    if (handoffPendente) resposta = removeRepeatedHelpOffer(resposta);
    if (precisaHumano && !handoffPendente && resposta && !/posso ajudar em algo mais/i.test(resposta)) {
      resposta += "\n\nEnquanto isso, posso ajudar em algo mais?";
    }

    if (previewOnly) {
      return json({
        preview: true,
        assunto,
        precisa_humano: precisaHumano,
        resposta,
        nome_extraido: triagem.nome_extraido,
        cadastro_pronto: !!draft,
        cadastro_confirmado: shouldRegister,
      });
    }

    // ---- Salvar nome extraído pela IA ----
    if (triagem.nome_extraido && isPlaceholderName(lead?.name)) {
      const nomeExtraido = triagem.nome_extraido.trim();
      if (nomeExtraido.length > 1) {
        await supabase.from("leads").update({ name: nomeExtraido }).eq("id", leadId!);
        console.log(`Nome extraído e salvo para lead ${leadId}: "${nomeExtraido}"`);
      }
    }

    // ---- Enviar resposta ----
    let enviado = false;
    let registration: { opportunity_id: string; created: boolean } | null = null;
    if (shouldRegister && draft && leadId) {
      if (await employeeAlreadyReplied()) return json({ skipped: "employee_replied_during_registration", lead_id: leadId });
      const { data, error } = await supabase.rpc("register_ana_enrollment", {
        p_lead_id: leadId, p_guardian_name: draft.responsible,
        p_student_name: draft.student, p_academic_year: draft.year,
        p_desired_grade: draft.grade, p_desired_shift: draft.shift,
      });
      if (error) {
        console.error("Falha no cadastro escolar pela Ana:", error.message);
        resposta = "Não consegui concluir o cadastro automaticamente. Encaminhei seus dados à secretaria para conferir e continuar o atendimento.";
      } else {
        registration = data;
        resposta = "Seu interesse foi cadastrado para a secretaria acompanhar. A matrícula ainda não está confirmada; nossa equipe vai orientar os próximos passos.";
      }
      precisaHumano = true;
    }
    if (resposta) {
      try {
        if (channel === "whatsapp" && phone) {
          if (await employeeAlreadyReplied()) {
            return json({ skipped: "employee_replied_during_generation", lead_id: leadId });
          }
          const respostaComIdentificacao = `*[Atendente ${agentName}]*\n${resposta.replace(/^\*\[Atendente [^\]\r\n]+\]\*\s*/, "")}`;
          const r = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ phone, message: respostaComIdentificacao, leadId, senderType: "ana" }),
          });
          enviado = r.ok;
          if (!r.ok) console.error("Falha ao enviar WhatsApp:", await r.text());
        } else if (channel === "email" && lead?.email) {
          const r = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              leadId,
              to: lead.email,
              subject: `Re: contato com ${escolaNome}`,
              body: resposta,
            }),
          });
          enviado = r.ok;
          if (!r.ok) console.error("Falha ao enviar e-mail:", await r.text());
        }
      } catch (e) {
        console.error("Erro no envio da resposta:", e);
      }
    }

    // ---- Atualizar situação do contato ----
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      assunto,
      interesse: triagem.interesse || "indefinido",
      triage_summary: triagem.resumo || null,
    };

    const falhaEnvio = !enviado;

    if (falhaEnvio) {
      update.triage_status = "aguardando_secretaria";
      update.resolved_at = null;
      update.handoff_at = now;
      update.handoff_reason = "Falha no envio automático da resposta";
    } else if (precisaHumano) {
      update.triage_status = "aguardando_secretaria";
      update.resolved_at = null;
      if (!handoffPendente) {
        update.handoff_at = now;
        update.handoff_reason = shouldRegister
          ? registration ? "Interesse cadastrado pela Ana para acompanhamento" : "Cadastro automático precisa de revisão"
          : triagem.motivo_humano || "Pergunta fora das informações padrão";
      }
    } else if (handoffPendente) {
      // Respondeu uma FAQ, mas preserva a fila humana do assunto anterior.
      update.triage_status = "aguardando_secretaria";
    } else if (AUTO_RESOLVE.includes(assunto)) {
      update.triage_status = "resolvido";
      update.resolved_at = now;
    } else {
      update.resolved_at = null;
      update.triage_status = "respondido_agente";
    }
    if (enviado) update.agent_replied_at = now;

    const { error: updateError } = await supabase.from("leads").update(update).eq("id", leadId!);
    if (updateError) throw new Error("triage_update_failed");

    if (channel === "whatsapp" && phone && precisaHumano && !handoffPendente && enviado) {
      await supabase.from("ana_followups").insert({
        lead_id: leadId,
        phone,
        handoff_at: now,
        due_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        status: "pending",
      });
    }

    await supabase.from("activity_log").insert({
      lead_id: leadId,
      activity_type: "agent_triage",
      description: precisaHumano
        ? `Agente encaminhou para a secretaria (${assunto}): ${update.handoff_reason}`
        : `Agente respondeu sozinho (${assunto})`,
      source: "school-triage",
      actor: "agente",
      metadata: { assunto, canal: channel, enviado, interesse: triagem.interesse, resumo: triagem.resumo, opportunity_id: registration?.opportunity_id },
    });

    return json({ success: true, lead_id: leadId, assunto, precisa_humano: precisaHumano, enviado, triage_status: update.triage_status });
  } catch (error: any) {
    if (failureLeadId && !previewOnly) {
      await supabase.from("leads").update({
        triage_status: "aguardando_secretaria", resolved_at: null,
        handoff_at: new Date().toISOString(), handoff_reason: "Falha técnica no atendimento automático",
      }).eq("id", failureLeadId);
    }
    console.error("Erro no school-triage:", error);
    return json({ error: error?.message || "unknown" }, 500);
  }
});
