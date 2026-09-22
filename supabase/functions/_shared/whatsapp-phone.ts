// Normalização canônica de telefones usados pelo WhatsApp/Z-API.
// Para celulares brasileiros antigos com oito dígitos, reinsere o nono dígito.

export function normalizeWhatsAppPhone(value?: string | null): string {
  const digits = (value || "").toString().replace(/@.*$/, "").replace(/\D/g, "");
  if (!digits) return "";

  if (!digits.startsWith("55")) {
    // Números internacionais conhecidos permanecem inalterados.
    const looksInternational =
      digits.startsWith("351") || digits.startsWith("1") || digits.startsWith("44") ||
      digits.startsWith("33") || digits.startsWith("34") || digits.startsWith("39") ||
      digits.startsWith("49") || digits.length > 11;
    if (looksInternational) return digits;
  }

  let local = digits.startsWith("55") ? digits.slice(2) : digits;

  // DDD (2) + celular antigo (8). Não altera telefone fixo iniciado por 2–5.
  if (local.length === 10 && /^[6-9]/.test(local.slice(2, 3))) {
    local = `${local.slice(0, 2)}9${local.slice(2)}`;
  }

  return local.length === 10 || local.length === 11 ? `55${local}` : digits;
}

export function phoneVariants(value?: string | null): string[] {
  const canonical = normalizeWhatsAppPhone(value);
  if (!canonical) return [];
  const local = canonical.startsWith("55") ? canonical.slice(2) : canonical;
  const values = new Set<string>([canonical, local]);
  if (local.length === 11 && local[2] === "9") {
    const legacy = `${local.slice(0, 2)}${local.slice(3)}`;
    values.add(legacy);
    values.add(`55${legacy}`);
  }
  return [...values];
}
