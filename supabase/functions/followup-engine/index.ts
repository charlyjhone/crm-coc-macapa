// Follow-up Engine — substitui followup-publicidade.
// Regras (Jul/2026 — cadência baseada em pesquisa de benchmarks B2B):
//  - APENAS produto = 'publicidade' (Susan não automatiza palestra/consultoria/mentoria/curso/outros)
//  - Status em (em_aberto, em_negociacao), não archived, não unclassified
//  - Cadência com espaçamento CRESCENTE em dias úteis desde a "âncora":
//      em_negociacao (proposta/negociação ativa): 2, 3, 4, 5, 7  → máx 5 follow-ups
//      em_aberto (lead esfriou antes da proposta): 2, 3, 5, 7    → máx 4 follow-ups
//    Racional (Belkins 7.5M emails, Yesware 33M, Backlinko 12M):
//    follow-ups 2-6 geram ~59% das respostas; retorno marginal despenca após o 5º
//    toque; espaçar 2-5 dias no início e alargar no fim; último toque = "breakup".
//  - Cada tentativa tem um ÂNGULO diferente (retomada → valor → call/flexibilidade
//    → urgência de agenda → breakup). Nunca "só passando pra ver".
//  - TODOS os follow-ups respondem a thread anterior (Re: + In-Reply-To/References).
//  - Janela de envio: dias úteis, 08:00-17:59 BR (pesquisa: manhã de ter-qui é o pico).
//  - Âncora = última mensagem outbound OU última inbound classificada como "waiting"
//  - Se a última msg é inbound e a IA classifica como "responsive"/"declined", NÃO faz follow-up
//  - Se classifica como "waiting" (cliente disse "vou ver com o cliente", "te retorno"), segue a esteira
//  - Miguel vai SEMPRE em CC de todos os follow-ups.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getPrompt } from "../_shared/get-prompt.ts";
import { getSettings } from "../_shared/get-settings.ts";
import { setActivityContext } from "../_shared/activity-context.ts";
import { generateMessageId, buildThreadHeaders, normalizeMessageIdForDb } from "../_shared/email-threading.ts";
import { AUDIENCE_FACTS } from "../_shared/audience-facts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Gap em DIAS ÚTEIS antes da tentativa N (índice N-1). O comprimento do array
// é o número máximo de follow-ups para aquele status.
const CADENCE_BUSINESS_DAYS: Record<string, number[]> = {
  em_negociacao: [2, 3, 4, 5, 7],
  em_aberto: [2, 3, 5, 7],
};
const SEND_WINDOW_START_BR = 8; // 08:00 BR
const SEND_WINDOW_END_BR = 18; // até 17:59 BR
const MAX_CONTENT_LENGTH = 1500;
const ELIGIBLE_STATUSES = ["em_aberto", "em_negociacao"];

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3 (sem DST desde 2019)

function brNow(): Date {
  return new Date(Date.now() - BR_OFFSET_MS);
}
function isBusinessDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}
function brHour(): number {
  return brNow().getUTCHours();
}
function truncate(t: string, max: number): string {
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max) + "...";
}

// Soma N dias úteis a uma data (frame BR), preservando o horário.
// Se a âncora cair em fim de semana, ela é tratada como a sexta anterior.
function addBusinessDays(anchor: Date, businessDays: number): Date {
  const br = new Date(anchor.getTime() - BR_OFFSET_MS);
  let remaining = businessDays;
  while (remaining > 0) {
    br.setUTCDate(br.getUTCDate() + 1);
    if (isBusinessDay(br)) remaining--;
  }
  // Se ainda assim cair em fim de semana (âncora sáb/dom com 0 restante), empurra pra segunda
  while (!isBusinessDay(br)) {
    br.setUTCDate(br.getUTCDate() + 1);
  }
  return new Date(br.getTime() + BR_OFFSET_MS);
}

// Ângulo especial: cliente disse "vou verificar com a marca/time e te retorno"
// (intent waiting). A cutucada vem NO DIA ÚTIL SEGUINTE — não deixamos a
// promessa de retorno esfriar — perguntando prazo e criando urgência real.
function angleForWaitingCheck(): string {
  return `ÂNGULO DESTA TENTATIVA — CLIENTE FICOU DE RETORNAR (checagem de prazo + urgência):
- O cliente disse que vai verificar internamente (com a marca/time/diretoria) e retornar. NÃO cobre resposta — pergunte QUANTO TEMPO eles estimam para essa definição, para o Miguel se organizar.
- Crie urgência REAL e positiva: o Miguel está muito animado com essa parceria e já está pensando em como potencializá-la.
- Mencione que o Miguel faz eventos AO VIVO com a sua comunidade e adoraria apresentar o produto em um dos próximos, para promover ainda mais a campanha — mas para isso precisa conseguir encaixar na agenda de produção (por isso a pergunta de prazo).
- Reforce que o produto tem muito fit com a comunidade dele e deve gerar bastante engajamento e feedback.
- NÃO invente datas de evento nem números; mantenha genérico ("um dos próximos eventos ao vivo").
- Tom: entusiasmado e prestativo, ajudando o contato a acelerar a aprovação interna — nunca cobrando.`;
}

// Ângulo da mensagem por tentativa — nunca repetir "só passando pra confirmar".
function angleForAttempt(n: number, max: number, status: string): string {
  if (n >= max) {
    return `ÂNGULO DESTA TENTATIVA — "BREAKUP" (ÚLTIMO CONTATO):
- Este é o ÚLTIMO follow-up. Diga com elegância que, como não houve retorno, você vai assumir que a parceria não avança neste momento e vai liberar a agenda de gravação/pauta do Miguel.
- Mencione que o Miguel gostou genuinamente da marca/produto e ficou pessoalmente chateado de não ter tido resposta — a marca procurou ELE primeiro.
- Deixe a porta explicitamente aberta: se mudarem de ideia, é só responder este e-mail.
- Tom: profissional, caloroso, com leve decepção sincera. ZERO passivo-agressivo, zero culpa.
- Aversão à perda funciona: deixe claro o que eles deixam de ganhar (a audiência do Miguel adora produtos assim).`;
  }
  if (n === max - 1) {
    return `ÂNGULO DESTA TENTATIVA — URGÊNCIA DE AGENDA (REAL, NÃO INVENTADA):
- Diga que a agenda de gravações do Miguel para as próximas semanas está fechando e você precisa saber se reserva espaço para esta parceria.
- PERGUNTE diretamente: existe uma data aproximada para uma decisão? Falta alguma aprovação interna?
- Ofereça resolver pendências rápidas por uma call de 15 minutos.`;
  }
  if (n === 1) {
    return `ÂNGULO DESTA TENTATIVA — RETOMADA DO PONTO EXATO:
- Retome EXATAMENTE o ponto onde a conversa parou (releia o histórico: proposta enviada? pediram mídia kit? ficaram de responder algo?). Referencie esse ponto específico.
- Faça UMA pergunta leve e fácil de responder, e peça uma posição nos próximos 2 dias, com gentileza.
- Lembre com naturalidade que o Miguel ficou animado com a possibilidade da parceria.`;
  }
  if (n === 2) {
    return `ÂNGULO DESTA TENTATIVA — AGREGAR VALOR NOVO:
- NÃO cobre resposta diretamente. Adicione um motivo NOVO para avançar: reforce o fit entre o produto da marca e a audiência do Miguel (criadores, entusiastas de IA e tecnologia) com base no que está no histórico.
- Pergunte se existe algo travando internamente (aprovação, orçamento, timing) que você possa ajudar a destravar.
- NÃO invente números, métricas ou cases que não estejam no histórico.`;
  }
  return `ÂNGULO DESTA TENTATIVA — FLEXIBILIDADE + CALL:
- Ofereça flexibilidade: se o formato/escopo discutido não encaixou, o Miguel tem outras opções de formato de conteúdo.
- Convide para uma call rápida de 15 minutos como caminho mais fácil de destravar.
- ${status === "em_negociacao" ? "Pergunte se a proposta chegou bem e se ficou alguma dúvida sobre valores ou formato." : "Pergunte o que falta para conseguirem avançar."}`;
}

async function classifyInboundIntent(
  supabase: any,
  email: any,
  lead: any,
  LOVABLE_API_KEY: string,
): Promise<"waiting" | "responsive" | "declined"> {
  if (email.followup_intent && ["waiting", "responsive", "declined"].includes(email.followup_intent)) {
    return email.followup_intent;
  }
  const content = truncate(email.message || "", 2000);
  // Inbound vazio / sem corpo extraído → tratamos como "waiting" (otimista, seguimos esteira).
  if (!content.trim()) {
    await supabase
      .from("email_messages")
      .update({ followup_intent: "waiting", followup_intent_reason: "empty_body_default_waiting", followup_intent_at: new Date().toISOString() })
      .eq("id", email.id);
    return "waiting";
  }

  const prompt = `Você está classificando a resposta de um cliente em uma negociação comercial.

Cliente: ${lead.name}
Produto: ${lead.produto || "N/D"}
Assunto: ${email.subject || ""}
Mensagem do cliente:
"""
${content}
"""

Classifique a INTENÇÃO da resposta em UMA destas categorias:
- "waiting": cliente disse que vai verificar internamente, falar com o time/diretoria/cliente final, pediu mais tempo, "te retorno", "vou olhar e respondo", "estou aguardando aprovação", "checando agenda", auto-reply de férias/ausência. A bola continua com o cliente para nos dar uma posição.
- "responsive": cliente respondeu de fato (fez perguntas, tomou decisão, pediu próximo passo, marcou reunião, pediu proposta). A bola está conosco — NÃO devemos enviar follow-up, devemos responder.
- "declined": cliente recusou/desistiu/disse não/pediu para parar de contatar.

Retorne APENAS um JSON: {"intent":"waiting|responsive|declined","reason":"explicação curta em PT"}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você classifica intenções de respostas comerciais. Responda apenas JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      console.error("classify AI error", r.status);
      return "responsive"; // fallback seguro: não mandar follow-up
    }
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const intent = ["waiting", "responsive", "declined"].includes(parsed.intent) ? parsed.intent : "responsive";
    const reason = (parsed.reason || "").toString().slice(0, 500);
    await supabase
      .from("email_messages")
      .update({ followup_intent: intent, followup_intent_reason: reason, followup_intent_at: new Date().toISOString() })
      .eq("id", email.id);
    return intent;
  } catch (e) {
    console.error("classify failed", e);
    return "responsive";
  }
}

// Higiene da fila: cancela follow-ups pendentes de leads que não são mais elegíveis
// (perdido/ganho/entregue/produzido, arquivado, não classificado ou não-publicidade).
// Sem isso o painel de pendentes acumula lixo e mente sobre o que vai acontecer.
async function cleanupStaleQueue(supabase: any): Promise<number> {
  const { data: pending } = await supabase
    .from("scheduled_followups")
    .select("id, lead_id, leads(id, produto, status, archived, unclassified)")
    .eq("status", "pending");
  if (!pending || pending.length === 0) return 0;

  const staleIds = pending
    .filter((p: any) => {
      const l = p.leads;
      if (!l) return true; // lead apagado
      return (
        l.archived === true ||
        l.unclassified === true ||
        l.produto !== "publicidade" ||
        !ELIGIBLE_STATUSES.includes(l.status)
      );
    })
    .map((p: any) => p.id);

  if (staleIds.length === 0) return 0;
  // Em lotes de 100 para não estourar a URL do PostgREST
  for (let i = 0; i < staleIds.length; i += 100) {
    const batch = staleIds.slice(i, i + 100);
    await supabase
      .from("scheduled_followups")
      .update({ status: "cancelled", last_error: "lead_no_longer_eligible", updated_at: new Date().toISOString() })
      .in("id", batch);
  }
  console.log(`cleanupStaleQueue: ${staleIds.length} follow-ups pendentes cancelados (leads inelegíveis)`);
  return staleIds.length;
}

function buildEmailHistory(emails: any[]): string {
  return emails
    .slice(-6)
    .map((e) => {
      const dir = e.direction === "inbound" ? "Cliente" : "Miguel (nós)";
      const subj = e.subject ? `Assunto: ${e.subject}\n` : "";
      const ts = new Date(e.timestamp).toLocaleString("pt-BR");
      return `[${dir} em ${ts}]\n${subj}${truncate(e.message || "", MAX_CONTENT_LENGTH)}`;
    })
    .join("\n\n---\n\n");
}

// Idioma: prioriza lead.language (persistido), com heurística de fallback
function detectLangName(lead: any, emails: any[]): string {
  const LANG_NAMES: Record<string, string> = {
    pt: "Portuguese", en: "English", es: "Spanish", fr: "French", de: "German",
    it: "Italian", nl: "Dutch", zh: "Chinese", ja: "Japanese", ko: "Korean",
    ru: "Russian", ar: "Arabic", tr: "Turkish", pl: "Polish", sv: "Swedish",
  };
  let lang = lead.language ? (LANG_NAMES[lead.language] || "English") : "English";
  if (!lead.language) {
    const inboundText = emails
      .filter((e) => e.direction === "inbound")
      .map((e) => (e.message || "").substring(0, 500))
      .join(" ")
      .toLowerCase();
    if (/\b(obrigad|olá|você|nosso|prezad|bom dia|boa tarde|atenciosamente)\b/.test(inboundText)) lang = "Portuguese";
    else if (/\b(gracias|hola|saludos|estimad|atentamente)\b/.test(inboundText)) lang = "Spanish";
  }
  return lang;
}

// Trilha citada no padrão Gmail: cita o ÚLTIMO e-mail da thread (que por sua
// vez carrega a citação anterior — o encadeamento cresce naturalmente, como em
// qualquer cliente de e-mail). A UI do CRM esconde blocos gmail_quote, então
// isso melhora a leitura do cliente sem sujar o CRM.
function buildQuotedTrail(emails: any[]): string {
  const last = emails[emails.length - 1];
  if (!last) return "";
  let quoted = last.html_body || "";
  if (!quoted && last.message) {
    quoted = String(last.message).replace(/\n/g, "<br>");
  }
  if (!quoted) return "";
  if (quoted.length > 120_000) quoted = truncate(String(last.message || ""), 3000).replace(/\n/g, "<br>");
  const ts = new Date(last.timestamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const who = last.raw_data?.from || (last.direction === "inbound" ? "" : "");
  const attribution = who ? `Em ${ts}, ${who} escreveu:` : `Em ${ts}:`;
  return `<br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr" style="color:#666;font-size:12px;">${attribution}</div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;">${quoted}</blockquote></div>`;
}

function leadRecipients(lead: any): string[] {
  const list =
    lead.emails && lead.emails.length > 0
      ? lead.emails.filter((e: string) => e && !e.includes("@whatsapp.temp"))
      : lead.email && !lead.email.includes("@whatsapp.temp")
      ? [lead.email]
      : [];
  return Array.from(new Set(list)) as string[];
}

async function generateAndSendFollowup(
  supabase: any,
  lead: any,
  emails: any[],
  followUpNumber: number,
  maxFollowups: number,
  settings: any,
  resendApiKey: string,
  LOVABLE_API_KEY: string,
  angleOverride?: string | null,
): Promise<{ status: string; error?: string }> {
  const emailHistory = buildEmailHistory(emails);
  const lang = detectLangName(lead, emails);

  const defaultPrompt = `Você é ${settings.susan_name}, assistente executiva de ${settings.company_name} (Miguel Fernandes), criador de conteúdo e palestrante de IA.

REGRA DE IDIOMA CRÍTICA:
- Identifique o idioma do cliente nas mensagens inbound abaixo
- Escreva 100% do e-mail (assunto + corpo) NESSE MESMO idioma
- Se não houver inbound, use ${lang}
- NUNCA misture idiomas

ESTILO OBRIGATÓRIO:
- Caloroso, humanizado, fluido — não robótico, não burocrático
- Frases curtas, sem floreios excessivos
- E-mail CURTO: 3-6 frases no corpo, UMA pergunta só
- Profissional e cordial

CONTEXTO:
- Negociação de "${lead.produto || "produto/serviço"}" com {leadName}
- Esta é a tentativa de follow-up nº {followUpNumber} de no máximo {maxFollowups}
- Miguel REALMENTE quer fechar esse negócio, gostou muito da proposta/produto, está animado

CONTEÚDO OBRIGATÓRIO:
1. Resgate humanizado do histórico em 1 frase ("Voltando ao nosso papo sobre X...")
2. Siga o ÂNGULO DESTA TENTATIVA descrito abaixo — é ele que define o miolo do e-mail

PROIBIDO:
- Citar o número do follow-up
- Tom passivo-agressivo
- Copiar/colar mensagens antigas (resuma você mesma)
- Assinatura (será adicionada automaticamente)
- Citar thread anterior (já vai como Re:)
- Inventar números, métricas, cases ou fatos que não estejam no histórico
- Incluir link do Media Kit a menos que o cliente tenha pedido EXPLICITAMENTE

HISTÓRICO RECENTE:
{emailHistory}

Retorne EXATAMENTE neste formato:
Subject: [assunto curto, sem Re: — será adicionado]

[corpo do email — só a mensagem nova]`;

  // id 25 — "Follow-up Engine (Susan)". NÃO usar "12": esse id pertence à
  // "Extração de Detalhes do Evento" na UI de prompts (colisão do motor antigo).
  let prompt = await getPrompt("25", defaultPrompt, {
    leadName: lead.name,
    followUpNumber: String(followUpNumber),
    maxFollowups: String(maxFollowups),
    emailHistory,
  });

  // O ângulo entra DEPOIS do getPrompt para valer mesmo se houver prompt customizado no banco.
  prompt += `\n\n${angleOverride || angleForAttempt(followUpNumber, maxFollowups, lead.status)}`;
  prompt += AUDIENCE_FACTS;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: `Você é ${settings.susan_name} escrevendo follow-up profissional 100% em ${lang}.` },
        { role: "user", content: prompt + `\n\nCRITICAL LANGUAGE OVERRIDE: escreva 100% em ${lang}.` },
      ],
    }),
  });
  if (!aiResp.ok) {
    if (aiResp.status === 429) throw { status: 429, message: "rate_limited" };
    return { status: "error", error: `AI ${aiResp.status}` };
  }
  const aiData = await aiResp.json();
  const generated = aiData.choices[0].message.content as string;

  // Parse subject/body
  const lines = generated.split("\n");
  let body = "";
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cleaned = lines[i].replace(/\*\*/g, "").trim();
    if (cleaned.toLowerCase().startsWith("subject:") || cleaned.toLowerCase().startsWith("assunto:")) {
      body = lines.slice(i + 2).join("\n").trim();
      break;
    }
  }
  if (!body) body = generated.trim();

  // Convert markdown links to HTML
  const bodyWithLinks = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const bodyHtml = bodyWithLinks.replace(/\n/g, "<br>");

  const lastEmail = emails[emails.length - 1];
  const baseSubject = lastEmail?.subject || `Follow-up — ${lead.name}`;
  const subject = baseSubject.toLowerCase().startsWith("re:") ? baseSubject : `Re: ${baseSubject}`;

  // Threading headers via helper compartilhado (formato `<id@domínio>`).
  const threadHeaders = buildThreadHeaders(emails as any);
  const outgoingMessageId = generateMessageId(settings.susan_email);

  const fullBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;">
    ${bodyHtml}
    <br><br>
    <p style="color:#666;font-size:12px;">—<br>${settings.susan_name}<br>Executive Assistant to ${settings.company_name}<br>${settings.susan_email}</p>
    ${buildQuotedTrail(emails)}
  </div>`;

  const recipientEmails =
    lead.emails && lead.emails.length > 0
      ? lead.emails.filter((e: string) => e && !e.includes("@whatsapp.temp"))
      : lead.email && !lead.email.includes("@whatsapp.temp")
      ? [lead.email]
      : [];
  if (recipientEmails.length === 0) return { status: "skipped", error: "no_valid_email" };

  const payload: any = {
    from: `${settings.susan_name} <${settings.susan_email}>`,
    to: Array.from(new Set(recipientEmails)),
    cc: [settings.company_email],
    subject,
    html: fullBody,
    headers: { ...threadHeaders, "Message-ID": outgoingMessageId },
  };

  const sendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!sendResp.ok) {
    const t = await sendResp.text();
    return { status: "error", error: `Resend: ${t.slice(0, 200)}` };
  }
  const sendData = await sendResp.json();
  await supabase.from("email_messages").insert({
    lead_id: lead.id,
    direction: "outbound",
    subject,
    message: body,
    html_body: fullBody,
    resend_message_id: outgoingMessageId,
    internet_message_id: normalizeMessageIdForDb(outgoingMessageId),
    recipients_to: payload.to,
    recipients_cc: payload.cc,
    raw_data: {
      headers: { ...threadHeaders, "Message-ID": outgoingMessageId },
      resend_id: sendData?.id || null,
      auto_reply: "followup-engine",
      followup_number: followUpNumber,
      followup_max: maxFollowups,
      from: settings.susan_email,
      to: payload.to,
      cc: payload.cc,
    },
  });
  return { status: "sent" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, srk);
    await setActivityContext(supabase, { source: "automation:followup-engine", actor: "susan" });

    let forceAll = false;
    let leadIdFilter: string | null = null;
    try {
      const body = await req.json();
      forceAll = body?.force_all === true;
      leadIdFilter = body?.lead_id || null;
    } catch (_) {}


    const nowBr = brNow();
    if (!forceAll && !isBusinessDay(nowBr)) {
      return new Response(JSON.stringify({ message: "weekend_skip" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Higiene da fila roda sempre (mesmo fora da janela de envio)
    const cleaned = await cleanupStaleQueue(supabase);

    // Janela de envio: 08:00-17:59 BR. Fora dela só faz a limpeza e agenda.
    const hour = brHour();
    const inSendWindow = hour >= SEND_WINDOW_START_BR && hour < SEND_WINDOW_END_BR;
    if (!forceAll && !inSendWindow) {
      return new Response(JSON.stringify({ message: "outside_send_window", cleaned }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await getSettings(["susan_name", "susan_email", "company_name", "company_email"]);

    // Buscar leads elegíveis
    let q = supabase
      .from("leads")
      .select("id, name, email, emails, produto, status, archived, unclassified, language")
      .in("status", ELIGIBLE_STATUSES)
      .eq("archived", false)
      .eq("unclassified", false)
      .eq("produto", "publicidade");
    if (leadIdFilter) q = q.eq("id", leadIdFilter);
    const { data: leads, error: leadsErr } = await q;
    if (leadsErr) throw leadsErr;

    const results: any[] = [];
    let sent = 0,
      skipped = 0,
      errors = 0;

    for (const lead of leads || []) {
      try {
        const cadence = CADENCE_BUSINESS_DAYS[lead.status] || CADENCE_BUSINESS_DAYS.em_aberto;
        const maxFollowups = cadence.length;

        if (!lead.email && (!lead.emails || lead.emails.length === 0)) {
          skipped++;
          results.push({ lead: lead.name, status: "skipped", reason: "no_email" });
          continue;
        }

        const { data: emails } = await supabase
          .from("email_messages")
          .select("id, direction, subject, message, timestamp, resend_message_id, outlook_message_id, raw_data, followup_intent, followup_intent_reason")
          .eq("lead_id", lead.id)
          .order("timestamp", { ascending: true });

        if (!emails || emails.length === 0) {
          skipped++;
          results.push({ lead: lead.name, status: "skipped", reason: "no_emails" });
          continue;
        }

        const lastEmail = emails[emails.length - 1];

        // Determinar âncora + classificação
        let anchorTs: string;
        let anchorIsWaiting = false; // cliente disse "vou verificar e te retorno"
        if (lastEmail.direction === "inbound") {
          // Classifica
          const intent = await classifyInboundIntent(supabase, lastEmail, lead, LOVABLE_API_KEY);
          if (intent === "responsive" || intent === "declined") {
            // Cancela o agendamento pendente para a fila/UI não mostrarem
            // "follow-up atrasado" — a esteira está PAUSADA de propósito
            // (responsive = aguardando resposta humana; declined = cliente saiu).
            // Quando respondermos, a âncora muda e o engine reagenda sozinho.
            const reason = intent === "responsive" ? "paused_client_responsive_needs_reply" : "client_declined";
            await supabase
              .from("scheduled_followups")
              .update({ status: "cancelled", last_error: reason, updated_at: new Date().toISOString() })
              .eq("lead_id", lead.id)
              .eq("status", "pending");
            skipped++;
            results.push({ lead: lead.name, status: "skipped", reason });
            continue;
          }
          // waiting → segue, ancorado na inbound
          anchorTs = lastEmail.timestamp;
          anchorIsWaiting = true;
        } else {
          anchorTs = lastEmail.timestamp;
        }

        // Conta outbounds consecutivos sem resposta do cliente
        let unanswered = 0;
        for (let i = emails.length - 1; i >= 0; i--) {
          if (emails[i].direction === "outbound") unanswered++;
          else break;
        }
        // Se houve inbound antes desse streak, o 1º outbound é a "resposta inicial",
        // não conta como follow-up. Se nunca houve inbound (cold outreach), todo
        // outbound conta como follow-up.
        const hadInboundBefore = emails.length > unanswered;
        const realFollowupsSent = hadInboundBefore ? Math.max(0, unanswered - 1) : unanswered;
        const nextFollowupNumber = realFollowupsSent + 1;

        if (realFollowupsSent >= maxFollowups) {
          await supabase
            .from("scheduled_followups")
            .upsert(
              { lead_id: lead.id, status: "completed", attempt_number: realFollowupsSent, next_run_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              { onConflict: "lead_id" },
            );
          skipped++;
          results.push({ lead: lead.name, status: "skipped", reason: "max_followups_reached" });
          continue;
        }

        // Gating pela cadência: a tentativa N só vence após cadence[N-1] dias úteis da âncora.
        // EXCEÇÃO (regra do Miguel): se o cliente disse "vou verificar e te retorno"
        // (waiting), a checagem de prazo vai NO DIA ÚTIL SEGUINTE — 4 dias esfria.
        const isWaitingCheck = anchorIsWaiting && nextFollowupNumber === 1;
        const gapDays = isWaitingCheck ? 1 : cadence[nextFollowupNumber - 1];
        const dueAt = addBusinessDays(new Date(anchorTs), gapDays);
        if (!forceAll && Date.now() < dueAt.getTime()) {
          await supabase
            .from("scheduled_followups")
            .upsert(
              { lead_id: lead.id, status: "pending", attempt_number: nextFollowupNumber, next_run_at: dueAt.toISOString(), updated_at: new Date().toISOString() },
              { onConflict: "lead_id" },
            );
          skipped++;
          const hoursLeft = Math.max(0, Math.round((dueAt.getTime() - Date.now()) / 36e5));
          results.push({ lead: lead.name, status: "skipped", reason: `wait_${hoursLeft}h_fu${nextFollowupNumber}_gap${gapDays}d` });
          continue;
        }

        let fr: { status: string; error?: string };
        let sentVia = "susan_resend";
        if (isWaitingCheck) {
          // Checagem de prazo (cliente ficou de retornar): pergunta quanto tempo
          // a marca precisa + urgência positiva (evento ao vivo, fit com a comunidade)
          fr = await generateAndSendFollowup(
            supabase, lead, emails, nextFollowupNumber, maxFollowups, settings, resendApiKey, LOVABLE_API_KEY,
            angleForWaitingCheck(),
          );
        } else {

          fr = await generateAndSendFollowup(
            supabase, lead, emails, nextFollowupNumber, maxFollowups, settings, resendApiKey, LOVABLE_API_KEY,
          );
        }
        if (fr.status === "sent") {
          sent++;
          const isLast = nextFollowupNumber >= maxFollowups;
          if (isLast) {
            await supabase.from("scheduled_followups").upsert(
              {
                lead_id: lead.id,
                status: "completed",
                attempt_number: nextFollowupNumber,
                next_run_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_error: null,
              },
              { onConflict: "lead_id" },
            );
          } else {
            const nextGap = cadence[nextFollowupNumber]; // gap antes da próxima tentativa
            const nr = addBusinessDays(new Date(), nextGap);
            await supabase.from("scheduled_followups").upsert(
              {
                lead_id: lead.id,
                status: "pending",
                attempt_number: nextFollowupNumber + 1,
                next_run_at: nr.toISOString(),
                updated_at: new Date().toISOString(),
                last_error: null,
              },
              { onConflict: "lead_id" },
            );
          }
          results.push({ lead: lead.name, status: "sent", followup_number: nextFollowupNumber, of_max: maxFollowups, breakup: nextFollowupNumber >= maxFollowups, via: sentVia, waiting_check: isWaitingCheck });
        } else if (fr.status === "error") {
          errors++;
          await supabase
            .from("scheduled_followups")
            .upsert(
              { lead_id: lead.id, status: "pending", attempt_number: nextFollowupNumber, next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), last_error: fr.error, updated_at: new Date().toISOString() },
              { onConflict: "lead_id" },
            );
          results.push({ lead: lead.name, status: "error", error: fr.error });
        } else {
          skipped++;
          results.push({ lead: lead.name, status: "skipped", reason: fr.error || "skipped" });
        }
      } catch (err: any) {
        if (err?.status === 429) {
          errors++;
          results.push({ lead: lead.name, status: "error", error: "rate_limited" });
          break;
        }
        errors++;
        console.error("lead error", lead.id, err);
        results.push({ lead: lead.name, status: "error", error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, sent, skipped, errors, cleaned, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("engine error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
