// Lista de contatos INTERNOS (funcionários, equipe, alter-egos do Miguel) que
// NUNCA devem virar lead/cliente nem serem associados como e-mail de oportunidade.
//
// Regra do Miguel: qualquer endereço em @inventormiguel.link, @inventormiguel.com
// ou @inventosdigitais.com.br, ou qualquer nome contendo "inventormiguel"/
// "inventos digitais" é INTERNO e deve ser bloqueado nos webhooks de entrada.

export const INTERNAL_PHONES: string[] = [
  "558898028762", // Yuri Kimoro (editor)
];

export const INTERNAL_EMAILS: string[] = [
  "yurikimoro@gmail.com", // Yuri Kimoro (editor)
  "jota@contentize.ai",   // Jota (Contentize)
];

export const INTERNAL_EMAIL_DOMAINS: string[] = [
  "inventormiguel.link",
  "inventormiguel.com",
  "inventosdigitais.com.br",
];

export const INTERNAL_NAME_TOKENS: string[] = [
  "inventormiguel",
  "inventor miguel",
  "inventos digitais",
];

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
