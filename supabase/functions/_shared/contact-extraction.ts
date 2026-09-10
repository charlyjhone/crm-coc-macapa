// Extração de contatos cruzada entre canais:
//  - telefone/WhatsApp a partir do texto de e-mails (assinaturas, links wa.me)
//  - (a extração de e-mail a partir de WhatsApp vive no zapi-webhook)
//
// Estratégia CONSERVADORA para telefones — assinatura de e-mail é cheia de
// números que não são telefone (CNPJ, CEP, datas). Só aceitamos:
//  1. Links wa.me / api.whatsapp.com (certeza absoluta)
//  2. Formato internacional explícito com "+"
//  3. Formato BR com DDD, mas SÓ se precedido de uma dica contextual
//     (tel/cel/whats/fone/phone/mobile/contato/zap) a até ~12 caracteres

const PHONE_HINT = /(?:tel|cel|whats?app?|zap|fone|phone|mobile|m[óo]vel|contato)[^\n\d+]{0,12}(\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4})/gi;
const WA_LINK = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{10,15})/gi;
const INTL = /\+\d[\d\s().-]{8,18}\d/g;

function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/** Normaliza para dígitos com código de país (BR = 55 por padrão). */
function normalizePhone(raw: string): string | null {
  let d = onlyDigits(raw);
  if (!d) return null;
  const hasCountryCode = raw.trim().startsWith("+");
  if (hasCountryCode) {
    // Já veio com código de país — não prefixar nada
    if (d.length < 10 || d.length > 15) return null;
  } else {
    // BR local com DDD (10-11 dígitos) → prefixa 55
    if (d.length === 10 || d.length === 11) d = "55" + d;
    if (d.length < 12 || d.length > 15) return null;
  }
  // descarta sequências óbvias (tudo igual)
  if (/^(\d)\1+$/.test(d)) return null;
  return d;
}

/** Extrai telefones prováveis de um corpo de e-mail (texto puro). */
export function extractPhonesFromEmailText(text: string): string[] {
  if (!text) return [];
  const sample = text.slice(0, 8000);
  const found = new Set<string>();

  for (const m of sample.matchAll(WA_LINK)) {
    // wa.me sempre inclui o código do país
    const p = normalizePhone("+" + m[1]);
    if (p) found.add(p);
  }
  for (const m of sample.matchAll(INTL)) {
    const p = normalizePhone(m[0]);
    if (p) found.add(p);
  }
  for (const m of sample.matchAll(PHONE_HINT)) {
    const p = normalizePhone(m[1]);
    if (p) found.add(p);
  }
  return [...found];
}

/**
 * Mescla telefones novos no lead (phones[] e phone se vazio).
 * Não sobrescreve nada existente. Retorna os telefones adicionados.
 */
export async function attachPhonesToLead(
  supabase: any,
  leadId: string,
  candidatePhones: string[],
): Promise<string[]> {
  if (!candidatePhones.length) return [];
  const { data: lead } = await supabase
    .from("leads")
    .select("id, phone, phones")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return [];

  const current: string[] = (lead.phones || []).map(onlyDigits).filter(Boolean);
  const currentSet = new Set(current);
  if (lead.phone) currentSet.add(onlyDigits(lead.phone));

  // Considera duplicado também quando um número é sufixo do outro
  // (ex.: salvo sem o 9º dígito, ou com/sem código do país)
  const isDupe = (p: string) =>
    [...currentSet].some((c) => c && (c.endsWith(p.slice(-10)) || p.endsWith(c.slice(-10))));

  const fresh = candidatePhones.filter((p) => p && !isDupe(p));
  if (!fresh.length) return [];

  const update: Record<string, unknown> = { phones: [...(lead.phones || []), ...fresh] };
  if (!lead.phone) update.phone = fresh[0];

  const { error } = await supabase.from("leads").update(update).eq("id", leadId);
  if (error) {
    console.error("attachPhonesToLead error:", error);
    return [];
  }
  console.log(`Telefones extraídos do e-mail e adicionados ao lead ${leadId}:`, fresh);
  return fresh;
}

/** Conveniência: extrai do texto e anexa ao lead em um passo. */
export async function extractAndAttachPhones(
  supabase: any,
  leadId: string,
  emailText: string,
): Promise<void> {
  try {
    const phones = extractPhonesFromEmailText(emailText);
    if (phones.length) await attachPhonesToLead(supabase, leadId, phones);
  } catch (e) {
    console.error("extractAndAttachPhones (não fatal):", e);
  }
}
