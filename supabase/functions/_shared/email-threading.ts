// Helpers para garantir threading correto (RFC 5322) em emails enviados via Resend.
//
// Bug histórico: salvávamos `resend_message_id = emailData.id` (UUID interno
// do Resend) e usávamos esse UUID cru como `In-Reply-To`. Clientes de email
// exigem o formato `<id@dominio>` e o Message-ID real do envio era diferente
// do `id` retornado pela API. Resultado: replies não casavam com a thread
// original e a conversa "se perdia" na caixa do destinatário.
//
// Solução: geramos NÓS o Message-ID, enviamos via header `Message-ID`,
// salvamos exatamente o mesmo valor em `resend_message_id` e usamos o
// formato canônico (`<...>`) nos headers de threading.

/** Extrai o domínio de um endereço (ou retorna fallback). */
export function domainFromEmail(email: string, fallback = "mail.local"): string {
  const at = (email || "").lastIndexOf("@");
  if (at === -1) return fallback;
  const dom = email.slice(at + 1).trim().toLowerCase();
  return dom || fallback;
}

/** Gera um RFC Message-ID novo no formato `<uuid@domínio>`. */
export function generateMessageId(senderEmail: string): string {
  const domain = domainFromEmail(senderEmail);
  // crypto.randomUUID disponível no Deno runtime
  const uuid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `<${uuid}@${domain}>`;
}

/** Garante que um id está no formato `<...>`. */
export function ensureAngleBrackets(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  // Se vier vários separados por espaço/vírgula, formata cada um.
  if (/\s|,/.test(trimmed)) {
    return trimmed
      .split(/[\s,]+/)
      .map((p) => ensureAngleBrackets(p))
      .filter(Boolean)
      .join(" ");
  }
  return `<${trimmed.replace(/^<|>$/g, "")}>`;
}

/** Normaliza para armazenamento/deduplicação no banco: sem <>, lowercase. */
export function normalizeMessageIdForDb(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = String(id).trim();
  if (!trimmed) return null;
  return trimmed.replace(/[<>]/g, "").trim().toLowerCase() || null;
}

export interface ThreadEmail {
  direction: "inbound" | "outbound" | string;
  resend_message_id?: string | null;
  timestamp?: string | null;
  created_at?: string | null;
  raw_data?: any;
}

/** Constrói headers In-Reply-To / References a partir do histórico do lead.
 *  - In-Reply-To = último INBOUND (a mensagem que estamos respondendo); se
 *    não houver inbound, cai no email mais recente.
 *  - References  = cadeia cronológica (mais antigo → mais recente).
 *  Todos os ids saem entre `< >`.
 */
export function buildThreadHeaders(emails: ThreadEmail[]): Record<string, string> {
  if (!emails || emails.length === 0) return {};

  const extractRawHeaderId = (e: ThreadEmail): string | null => {
    const h = e.raw_data?.headers;
    return (
      h?.["Message-ID"] ||
      h?.["Message-Id"] ||
      h?.["message-id"] ||
      e.raw_data?.messageId ||
      e.raw_data?.message_id ||
      null
    );
  };

  // Ordena do mais antigo para o mais recente
  const sorted = [...emails].sort((a, b) => {
    const ta = new Date(a.timestamp || a.created_at || 0).getTime();
    const tb = new Date(b.timestamp || b.created_at || 0).getTime();
    return ta - tb;
  });

  const refs: string[] = [];
  for (const e of sorted) {
    const id = e.resend_message_id || extractRawHeaderId(e);
    const norm = ensureAngleBrackets(id);
    if (norm && !refs.includes(norm)) refs.push(norm);
  }
  if (refs.length === 0) return {};

  // SEMPRE responde o último e-mail da thread (inbound OU outbound).
  // Importante para follow-ups: quando o cliente não respondeu, o último
  // e-mail é da própria Susan e ainda assim queremos empilhar a resposta
  // nessa mesma thread no Gmail/Outlook.
  const inReplyTo = refs[refs.length - 1];

  return {
    "In-Reply-To": inReplyTo,
    "References": refs.join(" "),
  };
}
