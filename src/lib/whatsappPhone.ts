// Helpers compartilhados de telefone WhatsApp.
// Mensagens são associadas a um número (phone), não a um lead.
// O lead "vê" as mensagens cujo phone bate com alguma variante dos seus telefones.

export function getPhoneVariants(phone?: string | null): string[] {
  const digits = (phone || '').toString().replace(/\D/g, '');
  if (!digits) return [];

  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  const variants = new Set<string>([digits, local, `55${local}`]);

  const withoutNinthDigit =
    local.length === 11 && local[2] === '9' ? `${local.slice(0, 2)}${local.slice(3)}` : null;
  const withNinthDigit =
    local.length === 10 && local[2] !== '9' ? `${local.slice(0, 2)}9${local.slice(2)}` : null;

  [withoutNinthDigit, withNinthDigit].filter(Boolean).forEach((variant) => {
    variants.add(variant as string);
    variants.add(`55${variant}`);
  });

  return Array.from(variants);
}

export function getLeadPhoneVariants(
  input?:
    | { phone?: string | null; phones?: string[] | null; whatsapp_chat_lids?: string[] | null }
    | string[]
    | null
): string[] {
  let list: string[] = [];
  let chatLids: string[] = [];
  if (Array.isArray(input)) {
    list = input.filter(Boolean) as string[];
  } else if (input) {
    list = [input.phone, ...(input.phones || [])].filter(Boolean) as string[];
    chatLids = (input.whatsapp_chat_lids || []).filter(Boolean) as string[];
  }
  const variants = new Set<string>(list.flatMap(getPhoneVariants));
  // Identificadores @lid do WhatsApp são tratados como variantes de "telefone"
  // porque mensagens outbound do Z-API às vezes chegam com phone = "<id>@lid".
  for (const lid of chatLids) {
    if (!lid) continue;
    variants.add(lid);
    variants.add(lid.replace('@lid', ''));
  }
  return Array.from(variants);
}

export function whatsappMessageMatchesPhone(
  message: { phone?: string | null },
  phone?: string | null
): boolean {
  const phoneVariants = new Set(getPhoneVariants(phone));
  return getPhoneVariants(message.phone).some((v) => phoneVariants.has(v));
}

export function whatsappMessageMatchesLead(
  message: { phone?: string | null },
  lead?: { phone?: string | null; phones?: string[] | null } | null
): boolean {
  if (!lead) return false;
  const leadVariants = new Set(getLeadPhoneVariants(lead));
  return getPhoneVariants(message.phone).some((v) => leadVariants.has(v));
}
