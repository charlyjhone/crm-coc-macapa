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
const GREETING_GAP_MS = 8 * 60 * 60 * 1000;

function timeOfDayGreeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem", hour: "numeric", hourCycle: "h23",
  }).format(now));
  return hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
}

function withGreeting(reply: string, name: string | null, now = new Date()) {
  const firstName = name?.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") || "";
  const greeting = `${timeOfDayGreeting(now)}${firstName ? `, ${firstName}` : ""}!`;
  const withoutOldGreeting = reply.replace(/^(?:(?:olá|oi|bom dia|boa tarde|boa noite)(?:,\s*[\p{L}'-]+)?[!.]?\s*)/iu, "").trim();
  return `${greeting}\n${withoutOldGreeting || reply}`;
}

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

function isConversationClosing(text: string, offeredHelp = false): boolean {
  const normalized = text.toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[.!?,;]+/g, " ").trim().replace(/\s+/g, " ");
  if (/^(?:(?:no momento|por enquanto|agora) (?:e )?so isso|(?:era|e|foi|somente|apenas) so isso|so isso|obrigad[oa] (?:era|e|foi) so isso|nao preciso de mais nada|outro dia (?:eu )?entro em contato(?: para .*)?|(?:depois|mais tarde) (?:eu )?entro em contato(?: para .*)?|(?:deixo|deixamos) para outro dia|nao quero mais nada(?: por enquanto)?|podemos encerrar|encerramos por aqui)$/.test(normalized)) return true;
  return offeredHelp && /^(?:nao|nao obrigado|obrigad[oa](?: mesmo)?|muito obrigad[oa]|valeu|ok|okay|ta bom|beleza|perfeito|resolvido|👍|🙏)$/.test(normalized);
}

function removeRepeatedHelpOffer(reply: string): string {
  return reply
    .replace(/(?:\s*\n*)?(?:enquanto isso,?\s*)?(?:posso|podemos) (?:te |lhe )?ajudar em algo mais\??/gi, "")
    .trim();
}

const SURVEY_ORIGINS = [
  { id: "redes_sociais", title: "Redes sociais" },
  { id: "indicacao", title: "Indicação" },
  { id: "panfletagem_outdoor", title: "Panfletagem/outdoor" },
  { id: "outros", title: "Outros" },
];

// Aceita uma resposta de uma lista enviada antes desta atualização.
const LEGACY_SURVEY_ORIGINS = [
  { id: "instagram", title: "Instagram" },
  { id: "facebook", title: "Facebook" },
  { id: "google", title: "Google" },
  { id: "site", title: "Site da escola" },
  { id: "ja_conhecia", title: "Já conhecia" },
  { id: "outro", title: "Outro" },
];

function surveySelection(text: string, choices: { id: string; title: string }[]) {
  const normalized = text.toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
  return choices.find((choice) => [choice.id, choice.title].some((value) =>
    value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalized))?.id || null;
}

async function sendSurveyList(url: string, key: string, phone: string, leadId: string,
  agentName: string, step: "origin" | "rating") {
  const isOrigin = step === "origin";
  const endpoint = `${url}/functions/v1/send-whatsapp-message`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  const message = `*[Atendente ${agentName}]*\n${isOrigin
    ? "Antes de ir, como você conheceu a escola? Sua resposta nos ajuda a melhorar nossa comunicação. É só escolher uma opção abaixo. 😊"
    : "E como você avalia este atendimento? Escolha uma nota de 1 a 5, sendo 5 excelente."}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, leadId, senderType: "ana", surveyStep: step,
      message,
      optionList: { title: isOrigin ? "Como conheceu a escola?" : "Avaliação do atendimento",
        buttonLabel: "Escolher opção", options: isOrigin
          ? SURVEY_ORIGINS.map((item) => ({ ...item, description: "" }))
          : [1, 2, 3, 4, 5].map((n) => ({ id: String(n), title: String(n), description: "" })) },
    }),
  });
  if (res.ok) return true;
  console.error(`Falha ao enviar lista ${step}:`, (await res.text()).slice(0, 300));
  // Algumas versões do WhatsApp não exibem listas. Mantém a pesquisa na conversa.
  const fallback = await fetch(endpoint, { method: "POST", headers,
    body: JSON.stringify({ phone, leadId, senderType: "ana", surveyStep: step,
      message: `${message}\n${isOrigin
        ? SURVEY_ORIGINS.map((item) => item.title).join(" · ")
        : "Responda com 1, 2, 3, 4 ou 5."}` }),
  });
  if (!fallback.ok) console.error(`Falha no texto da pesquisa ${step}:`, (await fallback.text()).slice(0, 300));
  return fallback.ok;
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

    // A resposta à pesquisa não reabre um atendimento já concluído nem passa pela IA.
    if (channel === "whatsapp" && phone && lead?.triage_status === "resolvido" && !previewOnly) {
      const { data: lastSurvey, error: surveyError } = await supabase.from("whatsapp_messages")
        .select("id, raw_data, created_at").eq("phone", phone).eq("direction", "outbound")
        .not("raw_data->>survey_step", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (surveyError) throw new Error("survey_lookup_failed");
      const recent = lastSurvey && Date.now() - new Date(lastSurvey.created_at).getTime() < 7 * 86400000;
      const { data: latestOutbound } = await supabase.from("whatsapp_messages")
        .select("id").eq("phone", phone).eq("direction", "outbound")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const step = recent && latestOutbound?.id === lastSurvey.id ? lastSurvey.raw_data?.survey_step : null;
      if (step === "origin") {
        const origin = surveySelection(text, [...SURVEY_ORIGINS, ...LEGACY_SURVEY_ORIGINS]);
        if (origin) {
          const { error: logError } = await supabase.from("activity_log").insert({ lead_id: leadId,
            activity_type: "agent_triage", description: "Pesquisa: origem informada pela família",
            source: "school-triage", actor: "agente", metadata: { survey: "origin", source_channel: origin },
          });
          if (logError) throw new Error("survey_origin_log_failed");
          // Atualiza somente a origem técnica, nunca uma origem informada manualmente.
          const { error: originError } = await supabase.from("enrollment_opportunities")
            .update({ source_channel: origin }).eq("legacy_lead_id", leadId!).eq("source_channel", "ana_whatsapp");
          if (originError) throw new Error("survey_origin_update_failed");
          const sent = await sendSurveyList(supabaseUrl, serviceKey, phone, leadId!, agentName, "rating");
          return json({ success: true, survey: "origin", rating_requested: sent });
        }
      } else if (step === "rating") {
        const rating = surveySelection(text, [1, 2, 3, 4, 5].map((n) => ({ id: String(n), title: String(n) })));
        if (rating) {
          const { error: logError } = await supabase.from("activity_log").insert({ lead_id: leadId,
            activity_type: "agent_triage", description: `Pesquisa: atendimento avaliado com nota ${rating}/5`,
            source: "school-triage", actor: "agente", metadata: { survey: "rating", rating: Number(rating) },
          });
          if (logError) throw new Error("survey_rating_log_failed");
          const sent = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ phone, leadId, senderType: "ana", message: `*[Atendente ${agentName}]*\nObrigada pela resposta! Ela nos ajuda a melhorar. 😊` }),
          });
          if (!sent.ok) throw new Error("survey_thanks_send_failed");
          return json({ success: true, survey: "completed" });
        }
      }
    }

    // A equipe tem prioridade durante quatro horas. A Ana observa apenas um
    // encerramento explícito da família para enviar a pesquisa, sem se intrometer.
    if (channel === "whatsapp" && phone) {
      const { data: saidasRecentes, error: saidasError } = await supabase
        .from("whatsapp_messages")
        .select("message, raw_data, created_at")
        .eq("phone", phone).eq("direction", "outbound")
        .order("created_at", { ascending: false }).limit(50);
      if (saidasError) throw new Error("human_handoff_check_failed");
      const ultimaSaidaHumana = (saidasRecentes || []).find((m: any) => !isAnaOutbound(m));
      const humanConversationActive = !!ultimaSaidaHumana &&
        Date.now() - new Date(ultimaSaidaHumana.created_at).getTime() < HANDOFF_COOLDOWN_MS;
      if (humanConversationActive) {
        if (!previewOnly && leadId && isConversationClosing(text, false)) {
          // Só uma mensagem posterior à resposta da secretaria pode encerrá-la.
          const { data: inbound } = messageId ? await supabase.from("whatsapp_messages")
            .select("created_at").eq("id", messageId).eq("direction", "inbound").maybeSingle()
            : { data: null };
          const afterHuman = inbound?.created_at &&
            new Date(inbound.created_at).getTime() > new Date(ultimaSaidaHumana.created_at).getTime();
          if (afterHuman) {
            // Evita enviar a mesma pesquisa novamente em retries do webhook.
            const alreadySent = (saidasRecentes || []).some((m: any) =>
              m.raw_data?.survey_step && new Date(m.created_at).getTime() > new Date(ultimaSaidaHumana.created_at).getTime());
            if (alreadySent) return json({ skipped: "survey_already_sent", lead_id: leadId });
            const sent = await sendSurveyList(supabaseUrl, serviceKey, phone, leadId, agentName, "origin");
            if (sent) {
              const { error: closeError } = await supabase.from("leads").update({
                status: "resolvido", triage_status: "resolvido", resolved_at: new Date().toISOString(),
                handoff_at: null, handoff_reason: null,
              }).eq("id", leadId);
              if (closeError) throw new Error("human_closing_status_failed");
              await supabase.from("ana_followups").update({ status: "cancelled", cancel_reason: "conversation_closed" })
                .eq("lead_id", leadId).eq("status", "pending");
              await supabase.from("activity_log").insert({ lead_id: leadId, activity_type: "agent_triage",
                description: "Família encerrou atendimento humano; pesquisa enviada no WhatsApp",
                source: "school-triage", actor: "agente", metadata: { canal: channel, pesquisa_enviada: true, atendimento: "humano" },
              });
            }
            return json({ success: sent, lead_id: leadId, pesquisa_enviada: sent, atendimento: "humano" });
          }
        }
        return json({ skipped: "human_conversation_active", lead_id: leadId });
      }
    }

    // ---- Lógica de handoff ----
    // Um handoff pendente não bloqueia dúvidas autônomas. A Ana continua
    // respondendo FAQs enquanto a secretaria trata o assunto encaminhado.
    let handoffPendente = lead?.triage_status === "aguardando_secretaria";
    const candidateClosing = isConversationClosing(text, true);

    // Se a última pergunta da Ana foi se poderia ajudar em algo mais, uma resposta
    // curta de encerramento deve ficar silenciosa mesmo que o estado do handoff
    // tenha mudado entre as mensagens.
    let anaAcabouDeOferecerAjuda = false;
    if (channel === "whatsapp" && phone && candidateClosing) {
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

    if (isConversationClosing(text, anaAcabouDeOferecerAjuda)) {
      if (lead?.triage_status === "resolvido") return json({ skipped: "already_closed", lead_id: leadId });
      const firstName = !isPlaceholderName(lead?.name)
        ? `, ${lead!.name.trim().split(/\s+/)[0]}` : "";
      const closingReply = `Combinado${firstName}! Agradeço pela conversa. Quando quiser retomar, estarei por aqui. 😊`;
      if (previewOnly) return json({ preview: true, resposta: closingReply, encerramento: true, pesquisa_whatsapp: channel === "whatsapp" });
      if (channel === "whatsapp" && phone) {
        const sent = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ phone, message: `*[Atendente ${agentName}]*\n${closingReply}`, leadId, senderType: "ana" }),
        });
        if (!sent.ok) throw new Error("closing_reply_send_failed");
      } else if (channel === "email" && lead?.email) {
        const sent = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ leadId, to: lead.email, subject: `Re: contato com ${escolaNome}`, body: closingReply }),
        });
        if (!sent.ok) throw new Error("closing_email_send_failed");
      } else {
        throw new Error("closing_channel_unavailable");
      }
      await supabase.from("ana_followups").update({ status: "cancelled", cancel_reason: "conversation_closed" })
        .eq("lead_id", leadId!).eq("status", "pending");
      const { error: closeError } = await supabase.from("leads").update({
        status: "resolvido", triage_status: "resolvido", resolved_at: new Date().toISOString(),
        handoff_at: null, handoff_reason: null,
      }).eq("id", leadId!);
      if (closeError) throw new Error("closing_status_update_failed");
      const surveySent = channel === "whatsapp" && phone && leadId
        ? await sendSurveyList(supabaseUrl, serviceKey, phone, leadId, agentName, "origin")
        : false;
      await supabase.from("activity_log").insert({ lead_id: leadId, activity_type: "agent_triage",
        description: surveySent ? "Agente encerrou o atendimento e enviou pesquisa no WhatsApp" : "Agente encerrou o atendimento",
        source: "school-triage", actor: "agente", metadata: { canal: channel, pesquisa_enviada: surveySent },
      });
      return json({ success: true, lead_id: leadId, triage_status: "resolvido", pesquisa_enviada: surveySent });
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
    let lastSchoolMessageAt: string | null = null;
    if (phone) {
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("direction, message, timestamp, created_at")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(12);
      lastSchoolMessageAt = (msgs || []).find((m: { direction: string; created_at: string }) => m.direction === "outbound")?.created_at || null;
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
      lastSchoolMessageAt = (msgs || []).find((m: { direction: string; created_at: string }) => m.direction === "outbound")?.created_at || null;
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
    const deveSaudar = !lastSchoolMessageAt || Date.now() - new Date(lastSchoolMessageAt).getTime() >= GREETING_GAP_MS;

    // ---- Chamada de IA ----
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("ai_not_configured");

    const saudacaoInstrucao = nomeReal
      ? `O nome desta pessoa é "${nomeReal}". Use o primeiro nome com naturalidade quando fizer sentido, sem repeti-lo em cada frase.`
      : devePerguntar
      ? `Você ainda não sabe o nome desta pessoa. Pergunte o nome de forma natural enquanto responde a dúvida que ela já trouxe. Coloque o nome extraído em "nome_extraido" caso a pessoa tenha se apresentado nesta mensagem; caso contrário, deixe null.`
      : `Você ainda não sabe o nome desta pessoa. Não invente um nome.`;

    const systemPrompt = `Você é ${agentName}, atendente virtual de ${escolaNome}. Responda em português do Brasil pelo canal ${channel === "whatsapp" ? "WhatsApp" : "e-mail"}, com acolhimento e clareza. Escreva como uma atendente atenciosa conversaria: reconheça a dúvida, responda de forma útil e faça no máximo uma pergunta por vez. Prefira frases naturais e curtas, sem tom robótico, formulário ou respostas telegráficas. Um emoji discreto pode caber quando combinar com o contexto, sem repetir em toda mensagem. Não finja ser uma pessoa humana se perguntarem; apresente-se como atendente virtual. Evite repetir a mesma abertura ou despedida a cada resposta.

${deveSaudar ? "O sistema adicionará a saudação apropriada ao horário local no início desta resposta. Não escreva outra saudação em resposta." : "Esta é a continuação da conversa; não recomece com bom dia, boa tarde ou boa noite."}

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
    if (assunto === "matricula" && !shouldRegister && !draft &&
        /\b(?:vou registrar|vou cadastrar|j[aá] (?:registrei|cadastrei)|interesse (?:registrado|cadastrado)|anotei seu interesse)\b/i.test(resposta)) {
      if (precisaHumano) {
        resposta = "Entendi seu interesse. Ainda não concluí o cadastro; a secretaria vai conferir os dados com você e continuar o atendimento.";
      } else {
        const cadastro = triagem.cadastro;
        const missing = !cadastro?.responsavel || cadastro.responsavel.trim().split(/\s+/).length < 2
          ? "Qual é o nome completo do responsável?"
          : !cadastro.aluno ? "Qual é o nome do aluno?"
          : !cadastro.ano ? "Para qual ano letivo você procura matrícula?"
          : "Qual é a série pretendida?";
        resposta = `Posso ajudar a cadastrar seu interesse. ${missing}`;
      }
    }
    if (handoffPendente) resposta = removeRepeatedHelpOffer(resposta);
    if (precisaHumano && !handoffPendente && resposta && !/posso ajudar em algo mais/i.test(resposta)) {
      resposta += "\n\nEnquanto isso, posso ajudar em algo mais?";
    }
    if (deveSaudar && resposta) resposta = withGreeting(resposta, nomeReal);

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
        const { data: previousOrigin } = await supabase.from("activity_log")
          .select("metadata").eq("lead_id", leadId).eq("metadata->>survey", "origin")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const sourceChannel = previousOrigin?.metadata?.source_channel;
        if (sourceChannel && SURVEY_ORIGINS.some((item) => item.id === sourceChannel)) {
          const { error: attributionError } = await supabase.from("enrollment_opportunities")
            .update({ source_channel: sourceChannel }).eq("id", registration.opportunity_id)
            .eq("source_channel", "ana_whatsapp");
          if (attributionError) console.error("Falha ao vincular origem à oportunidade:", attributionError.message);
        }
        resposta = "Seu interesse foi cadastrado para a secretaria acompanhar. A matrícula ainda não está confirmada; nossa equipe vai orientar os próximos passos.";
      }
      precisaHumano = true;
      if (deveSaudar) resposta = withGreeting(resposta, nomeReal);
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
