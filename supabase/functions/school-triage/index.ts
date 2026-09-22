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

const DEFAULT_INFO = `Horário de funcionamento: 7h30 às 18h, de segunda a sexta.
Endereço: R. Adílson José Pinto Pereira, 1089 - Infraero, Macapá - AP, CEP 68908-530.
Currículos devem ser enviados para o e-mail rh.cocmacapanorte@gmail.com.`;

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
    (message.message || "").startsWith("*[Atendente Ana]*");
}

async function processDueFollowups(supabase: any, supabaseUrl: string, serviceKey: string) {
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

    const { data: lead } = await supabase
      .from("leads")
      .select("triage_status, handoff_at")
      .eq("id", item.lead_id)
      .maybeSingle();

    const sameHandoff = lead?.triage_status === "aguardando_secretaria" &&
      lead?.handoff_at && new Date(lead.handoff_at).getTime() === new Date(item.handoff_at).getTime();
    if (!sameHandoff) {
      await supabase.from("ana_followups").update({ status: "cancelled", cancel_reason: "handoff_changed" }).eq("id", item.id);
      cancelled++;
      continue;
    }

    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("direction, message, raw_data, created_at")
      .eq("phone", item.phone)
      .gt("created_at", item.handoff_at)
      .order("created_at", { ascending: true })
      .limit(50);

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
        message: "*[Atendente Ana]*\nEnquanto você aguarda a Secretaria, posso ajudar em algo mais?",
      }),
    });

    await supabase.from("ana_followups").update({
      status: response.ok ? "sent" : "failed",
      sent_at: response.ok ? new Date().toISOString() : null,
      error_message: response.ok ? null : (await response.text()).slice(0, 500),
    }).eq("id", item.id);
    if (response.ok) sent++; else failed++;
  }

  return { processed: (due || []).length, sent, cancelled, failed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

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
    if (payload.action === "process_followups") {
      return json({ success: true, ...(await processDueFollowups(supabase, supabaseUrl, serviceKey)) });
    }

    const channel: "whatsapp" | "email" = payload.channel === "email" ? "email" : "whatsapp";
    const text: string = (payload.text || "").toString().trim();
    const phone: string | null = payload.phone || null;
    const messageId: string | null = payload.message_id || null;
    let leadId: string | null = payload.lead_id || null;

    if (!text) return json({ skipped: "empty_text" });

    // ---- Configurações da escola ----
    const { data: settingsRows } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["escola_agente_ativo", "escola_info", "escola_valores", "escola_nome"]);
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { if (r.value) settings[r.key] = r.value; });

    if ((settings.escola_agente_ativo || "true") !== "true") {
      return json({ skipped: "agent_disabled" });
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

    if (!leadId) {
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

    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, email, phone, triage_status, assunto, handoff_at")
      .eq("id", leadId!)
      .maybeSingle();

    // ---- Lógica de handoff ----
    // Um handoff pendente não bloqueia dúvidas autônomas. A Ana continua
    // respondendo FAQs enquanto a secretaria trata o assunto encaminhado.
    let handoffPendente = lead?.triage_status === "aguardando_secretaria";
    const textoNormalizado = text.toLocaleLowerCase("pt-BR").trim().replace(/[.!?]+$/g, "");
    const apenasEncerramento = /^(não|nao|não obrigado|nao obrigado|obrigad[oa]|muito obrigad[oa]|ok|okay|tá bom|ta bom|beleza|só isso|so isso|somente isso|apenas isso|era só|era so|é só isso|e so isso|perfeito|resolvido)$/.test(textoNormalizado);

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
      await supabase
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

        await supabase
          .from("leads")
          .update({ triage_status: "retomado_agente", handoff_at: null, handoff_reason: null })
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
        const audioReply = "*[Atendente Ana]*\nNão consegui entender o áudio. Pode reenviar ou escrever sua dúvida, por favor?";
        const r = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ phone, message: audioReply, leadId, senderType: "ana" }),
        });
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
    const devePerguntar = isPlaceholderName(lead?.name) && primeiroContato;

    // ---- Chamada de IA ----
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY ausente" }, 500);

    const saudacaoInstrucao = nomeReal
      ? `O nome desta pessoa é "${nomeReal}". Use o nome para cumprimentá-la quando fizer sentido (ex: "Bom dia, ${nomeReal}!").`
      : devePerguntar
      ? `Você ainda não sabe o nome desta pessoa. No início da sua resposta, cumprimente e pergunte o nome de forma natural (ex: "Olá! Para te atender melhor, pode me dizer seu nome?"). Depois responda a dúvida normalmente se já houver uma. Coloque o nome extraído em "nome_extraido" caso a pessoa tenha se apresentado nesta mensagem; caso contrário, deixe null.`
      : `Você ainda não sabe o nome desta pessoa. Cumprimente cordialmente sem usar nome.`;

    const systemPrompt = `Você é o atendente virtual de ${escolaNome}. Responde em português do Brasil, de forma curta, cordial e objetiva (no máximo 5 linhas), pelo canal ${channel === "whatsapp" ? "WhatsApp" : "e-mail"}.

${saudacaoInstrucao}

INFORMAÇÕES OFICIAIS DA ESCOLA:
${escolaInfo}

${escolaValores ? `VALORES DE MATRÍCULA E MENSALIDADE:\n${escolaValores}` : "VALORES: ainda não cadastrados. Se perguntarem valores, diga que a secretaria vai passar os valores e marque precisa_humano = true."}

REGRAS:
- Assuntos "curriculo", "horario" e "localizacao": responda com a informação oficial e encerre com cordialidade. precisa_humano = false.
- Assunto "matricula": você pode explicar o processo e informar os valores acima. Se a família pedir falar com uma pessoa, negociar, pedir desconto, tratar de caso específico da criança, documentos, vaga em turma específica, ou fizer qualquer pergunta que não esteja nas informações oficiais → precisa_humano = true.
- REGRA DE SETOR: dúvidas de interessados sobre valores de matrícula ou mensalidade, descontos para uma nova matrícula e condições comerciais são sempre da SECRETARIA. Nunca encaminhe interessados ou responsáveis em fase de matrícula ao Financeiro.
- O FINANCEIRO atende somente famílias que já são clientes/alunos matriculados, e apenas em assuntos posteriores à matrícula, como mensalidade vencida, segunda via, pagamento não identificado ou negociação de débito existente. Só forneça o contato do Financeiro nesses casos.
- Quando a pessoa confirmar que já é cliente e trouxer um desses assuntos posteriores à matrícula, classifique como "financeiro", informe a orientação oficial e use precisa_humano = false se a dúvida estiver totalmente respondida.
- Se não estiver claro se a pessoa já é cliente, pergunte antes de indicar o Financeiro: "O aluno já está matriculado conosco?".
- Nunca invente informação que não esteja acima. Se não souber → precisa_humano = true.
- Se a pessoa fizer um pedido amplo, como "quero mais informações da escola", não encaminhe imediatamente. Faça uma pergunta curta para identificar série, turno ou assunto, classifique como "matricula" quando houver interesse escolar e use precisa_humano = false enquanto estiver qualificando.
- Se precisa_humano = true, a "resposta" deve avisar de forma gentil que a secretaria vai continuar o atendimento em breve.
- Ao encaminhar pela primeira vez, finalize com "Enquanto isso, posso ajudar em algo mais?".
- Se já houver atendimento da secretaria pendente, continue respondendo normalmente dúvidas autônomas presentes nas informações oficiais, como endereço, horário, localização, currículo e etapas de ensino. Não cancele o handoff existente.
- Nunca prometa prazos que não estejam nas informações oficiais.
- IMPORTANTE: Se você acabou de perguntar o nome e a pessoa ainda não trouxe um assunto específico, use assunto="outros" e precisa_humano=false (apenas aguardando apresentação).

Responda SOMENTE com JSON válido:
{"assunto":"matricula|financeiro|curriculo|horario|localizacao|outros","interesse":"alto|medio|baixo|indefinido","precisa_humano":true|false,"motivo_humano":"texto curto ou null","resumo":"1 frase sobre o que a pessoa quer","resposta":"mensagem a enviar","nome_extraido":"nome real se a pessoa se apresentou nesta mensagem, ou null"}`;

    const userPrompt = `Histórico recente da conversa:\n${historico || "(sem histórico)"}\n\nÚltima mensagem recebida:\n${text}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("Erro no gateway de IA:", aiRes.status, detail);
      await supabase.from("leads").update({ triage_status: "aguardando_secretaria", handoff_at: new Date().toISOString(), handoff_reason: "Falha do agente de IA" }).eq("id", leadId!);
      return json({ error: "ai_gateway_error", status: aiRes.status, detail }, aiRes.status === 429 || aiRes.status >= 500 ? 503 : 500);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    let triagem: Triagem;
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      triagem = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    } catch (e) {
      console.error("Resposta da IA não é JSON:", raw);
      await supabase.from("leads").update({ triage_status: "aguardando_secretaria", handoff_at: new Date().toISOString(), handoff_reason: "Resposta do agente ilegível" }).eq("id", leadId!);
      return json({ error: "ai_parse_error" }, 500);
    }

    const assunto: Assunto = ASSUNTOS.includes(triagem.assunto) ? triagem.assunto : "outros";
    // Se ainda estamos coletando o nome e a pessoa ainda não trouxe assunto definido,
    // não forçar handoff — Ana está apenas aguardando apresentação.
    const apenasColetandoNome = devePerguntar && assunto === "outros" && !triagem.precisa_humano;
    const precisaHumano = !apenasColetandoNome && !!triagem.precisa_humano;
    let resposta = (triagem.resposta || "").trim();
    if (precisaHumano && !handoffPendente && resposta && !/posso ajudar em algo mais/i.test(resposta)) {
      resposta += "\n\nEnquanto isso, posso ajudar em algo mais?";
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
    if (resposta) {
      try {
        if (channel === "whatsapp" && phone) {
          if (await employeeAlreadyReplied()) {
            return json({ skipped: "employee_replied_during_generation", lead_id: leadId });
          }
          const respostaComIdentificacao = resposta.startsWith("*[Atendente Ana]*")
            ? resposta
            : `*[Atendente Ana]*\n${resposta}`;
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

    const falhaEnvio = !!resposta && !enviado;

    if (falhaEnvio) {
      update.triage_status = "aguardando_secretaria";
      update.handoff_at = now;
      update.handoff_reason = "Falha no envio automático da resposta";
    } else if (precisaHumano) {
      update.triage_status = "aguardando_secretaria";
      if (!handoffPendente) {
        update.handoff_at = now;
        update.handoff_reason = triagem.motivo_humano || "Pergunta fora das informações padrão";
      }
    } else if (handoffPendente) {
      // Respondeu uma FAQ, mas preserva a fila humana do assunto anterior.
      update.triage_status = "aguardando_secretaria";
    } else if (AUTO_RESOLVE.includes(assunto)) {
      update.triage_status = "resolvido";
      update.resolved_at = now;
    } else {
      update.triage_status = "respondido_agente";
    }
    if (enviado) update.agent_replied_at = now;

    await supabase.from("leads").update(update).eq("id", leadId!);

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
      metadata: { assunto, canal: channel, enviado, interesse: triagem.interesse, resumo: triagem.resumo },
    });

    return json({ success: true, lead_id: leadId, assunto, precisa_humano: precisaHumano, enviado, triage_status: update.triage_status });
  } catch (error: any) {
    console.error("Erro no school-triage:", error);
    return json({ error: error?.message || "unknown" }, 500);
  }
});
