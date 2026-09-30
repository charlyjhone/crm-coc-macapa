// Lista de contatos internos do COC Macapá Norte que não devem virar família/lead.
// Manter vazia até a escola fornecer uma lista oficial de números e e-mails.

export const INTERNAL_PHONES: string[] = [];

export const INTERNAL_EMAILS: string[] = [];

export const INTERNAL_EMAIL_DOMAINS: string[] = [];

export const INTERNAL_NAME_TOKENS: string[] = [];

export function isInternalPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return false;
  return INTERNAL_PHONES.some((p) => {
    const d = p.replace(/\D/g, "");
    if (!d) return false;
    if (d === digits) return true;
    const a = d.slice(-10);
    const b = digits.slice(-10);
    return a.length >= 8 && a === b;
  });
}

export function isInternalEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  if (!e) return false;
  if (INTERNAL_EMAILS.includes(e)) return true;
  return INTERNAL_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`));
}

export function isInternalName(name?: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return INTERNAL_NAME_TOKENS.some((t) => n.includes(t));
}

// Combina os três checks para uso em webhooks que recebem "from"/"contact".
export function isInternalContact(input: {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}): boolean {
  return (
    isInternalEmail(input.email) ||
    isInternalName(input.name) ||
    isInternalPhone(input.phone)
  );
}
