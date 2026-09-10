export interface TiffanyLeadInput {
  name?: string | null;
  email?: string | null;
  emails?: string[] | null;
  valor?: number | string | null;
  moeda?: string | null;
  produto?: string | null;
  language?: string | null;
  delivered_at?: string | null;
  data_proximo_pagamento?: string | null;
  proposal_url?: string | null;
  description?: string | null;
}

export interface TiffanyExportPayload {
  nome_pessoa: string | null;
  nome_empresa: string | null;
  emails: string[];
  valor: string | null;
  moeda: "BRL" | "USD" | "EUR" | "GBP";
  produto: "Publicidade" | "Treinamento" | "Palestra" | "Consultoria";
  idioma: "Português" | "English" | "Español" | "Français" | "Deutsch" | "Italiano";
  expected_payment_date: string | null;
  delivery_date: string | null;
  invoice_url: string | null;
  invoice_notes: string | null;
}

const PRODUCT_MAP: Record<string, TiffanyExportPayload["produto"]> = {
  publicidade: "Publicidade",
  treinamento: "Treinamento",
  palestra: "Palestra",
  consultoria: "Consultoria",
  mentoria: "Consultoria",
  documentario: "Publicidade",
  "documentário": "Publicidade",
};

const LANGUAGE_MAP: Record<string, TiffanyExportPayload["idioma"]> = {
  pt: "Português",
  "pt-br": "Português",
  portugues: "Português",
  "português": "Português",
  en: "English",
  "en-us": "English",
  "en-gb": "English",
  english: "English",
  ingles: "English",
  "inglês": "English",
  es: "Español",
  espanol: "Español",
  "español": "Español",
  espanhol: "Español",
  fr: "Français",
  francais: "Français",
  "français": "Français",
  frances: "Français",
  "francês": "Français",
  de: "Deutsch",
  deutsch: "Deutsch",
  alemao: "Deutsch",
  "alemão": "Deutsch",
  it: "Italiano",
  italiano: "Italiano",
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && !["n/a", "null", "undefined", "não definido"].includes(cleaned.toLowerCase())
    ? cleaned
    : null;
}

function contextValue(context: string, label: string): string | null {
  const line = context.split(/\r?\n/).find((item) =>
    item.toLowerCase().startsWith(`${label.toLowerCase()}:`)
  );
  return line ? cleanText(line.slice(line.indexOf(":") + 1)) : null;
}

function normalizeEmails(values: unknown[]): string[] {
  return [...new Set(values
    .flatMap((value) => typeof value === "string" ? value.split(",") : [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith("@whatsapp.temp"))
  )];
}

function contactNameFromEmail(email: string | undefined): string | null {
  if (!email) return null;
  const localPart = email.split("@")[0];
  const parts = localPart.split(/[._-]+/).filter((part) => /^[a-zÀ-ÿ]+$/i.test(part));
  if (parts.length < 2) return null;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeMoney(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? String(value) : null;
  const text = cleanText(value);
  if (!text) return null;

  let normalized = text.replace(/[^\d,.-]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? String(amount) : null;
}

function normalizeDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return brMatch ? `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}` : null;
}

function normalizeCurrency(value: unknown): TiffanyExportPayload["moeda"] {
  const currency = cleanText(value)?.toUpperCase();
  return currency === "USD" || currency === "EUR" || currency === "GBP" ? currency : "BRL";
}

function normalizeProduct(value: unknown): TiffanyExportPayload["produto"] {
  const product = cleanText(value)?.toLowerCase();
  return product ? PRODUCT_MAP[product] || "Consultoria" : "Consultoria";
}

function normalizeLanguage(value: unknown): TiffanyExportPayload["idioma"] {
  const language = cleanText(value)?.toLowerCase();
  return language ? LANGUAGE_MAP[language] || "Português" : "Português";
}

export function buildTiffanyPayload(
  lead: TiffanyLeadInput | null | undefined,
  context = "",
  leadName?: string | null,
): TiffanyExportPayload {
  const name = cleanText(lead?.name) || cleanText(leadName) || contextValue(context, "Lead");
  const contextEmails = contextValue(context, "Emails");
  const emails = normalizeEmails([
    ...(Array.isArray(lead?.emails) ? lead.emails : []),
    lead?.email,
    contextEmails,
  ]);

  // O CRM possui um único campo de nome. Para empresas, o e-mail frequentemente
  // contém o nome do contato (ex.: giovanna.prado@exame.com); se não contiver,
  // repetir o nome continua sendo o fallback aceito para PF e empresas.
  const contactName = contactNameFromEmail(emails[0]) || name;
  return {
    nome_pessoa: contactName,
    nome_empresa: name,
    emails,
    valor: normalizeMoney(lead?.valor ?? contextValue(context, "Valor")),
    moeda: normalizeCurrency(lead?.moeda ?? contextValue(context, "Moeda")),
    produto: normalizeProduct(lead?.produto ?? contextValue(context, "Produto")),
    idioma: normalizeLanguage(lead?.language ?? contextValue(context, "Idioma")),
    expected_payment_date: normalizeDate(
      lead?.data_proximo_pagamento ?? contextValue(context, "expected_payment_date")
    ),
    delivery_date: normalizeDate(lead?.delivered_at ?? contextValue(context, "delivery_date")),
    invoice_url: cleanText(lead?.proposal_url),
    invoice_notes: cleanText(lead?.description ?? contextValue(context, "Descrição")),
  };
}

export function getTiffanyMissingFields(payload: TiffanyExportPayload): string[] {
  const missing: string[] = [];
  if (!payload.valor) missing.push("valor (preço do serviço)");
  if (payload.emails.length === 0) missing.push("email do cliente");
  if (!payload.nome_pessoa && !payload.nome_empresa) missing.push("nome do cliente ou empresa");
  return missing;
}

export function externalErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "details"]) {
      if (typeof record[key] === "string" && record[key]) return record[key] as string;
    }
  }
  return `O sistema financeiro recusou o envio (HTTP ${status}).`;
}
