// Shared: quando Susan recebe um email e Miguel NÃO está em To/CC,
// responde "reply-all" com Miguel em cópia (ack curto no idioma correto).

import { generateMessageId, normalizeMessageIdForDb } from "./email-threading.ts";

const MIGUEL_EMAILS = [
  "miguel@inventormiguel.com",
  "miguel@inventosdigitais.com.br",
  "mi@inventosdigitais.com.br",
  "tito@inventosdigitais.com.br",
  "tito@inventormiguel.com",
];

// Domínios internos cuja presença em To/CC já significa que não precisamos
// disparar "loop-in". IMPORTANTE: NÃO usar match por localpart em qualquer
// domínio — um lead real chamado miguel@empresa.com seria tratado como o
// Miguel e nunca receberia o loop-in (bug apontado pelo scanner do Lovable).
const MIGUEL_DOMAINS = ["inventormiguel.com", "inventormiguel.link"];

const ASSISTANT_HINTS = ["susan@", "sara@", "@cloudmailin.net"];

function cleanAddr(raw: string): string {
  if (!raw) return "";
  const m = String(raw).match(/<([^>]+)>/);
  return (m ? m[1] : String(raw)).trim().toLowerCase();
}

function isMiguel(addr: string): boolean {
  const a = cleanAddr(addr);
  if (!a) return false;
  if (MIGUEL_EMAILS.some((m) => a === m)) return true;
  const [local, domain] = a.split("@");
  if (!local || !domain) return false;
  if (MIGUEL_DOMAINS.includes(domain)) return true;
  return false;
}

function isAssistantOrInternal(addr: string, systemEmails: string[]): boolean {
  const a = cleanAddr(addr);
  if (!a) return true;
  if (ASSISTANT_HINTS.some((h) => a.includes(h))) return true;
  if (systemEmails.includes(a)) return true;
  return false;
}

type Lang = "pt" | "en" | "es" | "fr" | "it" | "de";

function detectLanguage(sample: string, leadLanguage?: string | null): Lang {
  const lang = (leadLanguage || "").toLowerCase().slice(0, 2);
  if (["pt", "en", "es", "fr", "it", "de"].includes(lang)) return lang as Lang;
  const s = (sample || "").toLowerCase();
  if (/\b(the|and|thanks|regards|hello|hi|please)\b/.test(s)) return "en";
  if (/\b(hola|gracias|saludos|buenos|por favor)\b/.test(s)) return "es";
  if (/\b(bonjour|merci|cordialement|salutations)\b/.test(s)) return "fr";
  if (/\b(ciao|grazie|cordiali|saluti|buongiorno)\b/.test(s)) return "it";
  if (/\b(hallo|danke|gr(ü|u)(ss|ß)e|bitte)\b/.test(s)) return "de";
  return "pt";
}

function ackMessage(lang: Lang, companyName: string): { body: string; subjectPrefix: string } {
  const map: Record<Lang, { body: string; subjectPrefix: string }> = {
    pt: {
      body: `Olá,\n\nColocando ${companyName} em cópia para dar seguimento a esta conversa.\nRespondemos em breve.`,
      subjectPrefix: "Re:",
    },
    en: {
      body: `Hi there,\n\nAdding ${companyName} in copy so he can follow along.\nWe'll get back to you shortly.`,
      subjectPrefix: "Re:",
    },
    es: {
      body: `Hola,\n\nAñado a ${companyName} en copia para dar seguimiento a esta conversación.\nResponderemos en breve.`,
      subjectPrefix: "Re:",
    },
    fr: {
      body: `Bonjour,\n\nJ'ajoute ${companyName} en copie afin d'assurer le suivi de cette conversation.\nNous revenons vers vous très vite.`,
      subjectPrefix: "Re:",
    },
    it: {
      body: `Salve,\n\nAggiungo ${companyName} in copia per dare seguito a questa conversazione.\nTorneremo da voi a breve.`,
      subjectPrefix: "Re:",
    },
    de: {
      body: `Hallo,\n\nIch setze ${companyName} in Kopie, damit er den Vorgang verfolgen kann.\nWir melden uns in Kürze.`,
      subjectPrefix: "Re:",
    },
  };
  return map[lang];
}

export interface LoopInMiguelInput {
  supabase: any;
  lead: { id: string; name?: string | null; language?: string | null };
  originalFrom: string;
  originalTo: string[];
  originalCc: string[];
  subject: string;
  bodySample: string; // texto do email inbound, para detecção de idioma se lead.language vazio
  inboundMessageId?: string | null;
  priorMessageIds?: string[]; // para References
  resendApiKey: string;
  susanEmail: string;
  susanName: string;
  companyName: string;
  companyEmail: string; // ex: miguel@inventormiguel.com
  systemUserEmails: string[];
}

export async function maybeLoopInMiguel(input: LoopInMiguelInput): Promise<
  { skipped: true; reason: string } | { skipped: false; resendId?: string | null }
> {
  try {
    const {
      supabase, lead,
      originalFrom, originalTo, originalCc,
      subject, bodySample, inboundMessageId, priorMessageIds,
      resendApiKey, susanEmail, susanName, companyName, companyEmail,
      systemUserEmails,
    } = input;

    const allRecipients = [...(originalTo || []), ...(originalCc || [])].map(cleanAddr).filter(Boolean);

    if (allRecipients.some(isMiguel)) {
      return { skipped: true, reason: "miguel_already_in_recipients" };
    }
    if (isMiguel(originalFrom)) {
      return { skipped: true, reason: "from_miguel" };
    }

    // Idempotência: nunca respondemos duas vezes ao mesmo inbound, nem mais
    // de uma vez por thread numa janela de 6h.
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("email_messages")
      .select("id, subject, timestamp, raw_data")
      .eq("lead_id", lead.id)
      .eq("direction", "outbound")
      .gte("timestamp", sixHoursAgo)
      .order("timestamp", { ascending: false })
      .limit(20);
    const recentLoops = (recent || []).filter((m: any) => m?.raw_data?.loop_in_miguel === true);
    if (inboundMessageId && recentLoops.some((m: any) => m?.raw_data?.in_reply_to_inbound === inboundMessageId)) {
      return { skipped: true, reason: "already_replied_to_this_inbound" };
    }
    if (recentLoops.length > 0) {
      return { skipped: true, reason: "already_looped_in_recent_6h" };
    }

    // Monta lista de destinatários (reply-all)
    const fromClean = cleanAddr(originalFrom);
    const toList = Array.from(new Set([
      fromClean,
      ...originalTo.map(cleanAddr),
    ].filter((a) => a && !isAssistantOrInternal(a, systemUserEmails))));

    const ccList = Array.from(new Set([
      ...originalCc.map(cleanAddr).filter((a) => a && !isAssistantOrInternal(a, systemUserEmails)),
      companyEmail.toLowerCase(),
    ]));

    if (toList.length === 0) toList.push(fromClean);

    const lang = detectLanguage(bodySample, lead.language);
    const { body, subjectPrefix } = ackMessage(lang, companyName);
    const replySubject = subject && /^re:/i.test(subject) ? subject : `${subjectPrefix} ${subject || ""}`.trim();

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#333;">${body.replace(/\n/g, "<br>")}<br><br>—<br>${susanName}<br>Executive Assistant to ${companyName}<br>${susanEmail}</div>`;

    const headers: Record<string, string> = {};
    const refs = [...(priorMessageIds || []), inboundMessageId].filter(Boolean) as string[];
    if (refs.length > 0) {
      headers["In-Reply-To"] = refs[refs.length - 1];
      headers["References"] = refs.join(" ");
    }
    const outgoingMessageId = generateMessageId(susanEmail);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${susanName} - ${companyName} <${susanEmail}>`,
        to: toList,
        cc: ccList,
        subject: replySubject,
        html,
        text: body,
        headers: { ...headers, "Message-ID": outgoingMessageId },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[loop-in-miguel] Resend error:", err);
      return { skipped: false, resendId: null };
    }

    const sent = await resp.json();
    const resendId = sent?.id || null;

    await supabase.from("email_messages").insert({
      lead_id: lead.id,
      direction: "outbound",
      subject: replySubject,
      message: body,
      html_body: html,
      timestamp: new Date().toISOString(),
      resend_message_id: outgoingMessageId,
      internet_message_id: normalizeMessageIdForDb(outgoingMessageId),
      recipients_to: toList,
      recipients_cc: ccList,
      raw_data: {
        loop_in_miguel: true,
        in_reply_to_inbound: inboundMessageId || null,
        language: lang,
        resend_id: resendId,
        headers: { "Message-ID": outgoingMessageId, ...headers },
        from: susanEmail,
        to: toList,
        cc: ccList,
      },
    });

    console.log(`[loop-in-miguel] Reply enviado para lead ${lead.id} (${lang}), Miguel em CC.`);
    return { skipped: false, resendId };
  } catch (e) {
    console.error("[loop-in-miguel] falhou:", e);
    return { skipped: true, reason: "error" };
  }
}
