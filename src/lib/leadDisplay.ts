// Como mostrar nome, origem e última mensagem de um contato nas listas do CRM.

/** "5596981156439" → "(96) 98115-6439". */
export function formatPhone(raw: string | null | undefined) {
  const d = (raw || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || "";
}

/** Nome para mostrar: troca "Contato 5596…" pelo telefone formatado. */
export function displayName(lead: { name?: string | null; phone?: string | null }) {
  const name = (lead.name || "").trim();
  const placeholder = /^contato\s*\+?\d{8,}$/i.test(name);
  if (name && !placeholder) return name;
  const phone = formatPhone(lead.phone || name.replace(/\D/g, ""));
  return phone || name || "Sem nome";
}

/** Origem do contato com escrita padronizada. */
export function displaySource(source: string | null | undefined) {
  const s = (source || "").trim();
  if (!s) return null;
  const v = s.toLowerCase();
  if (v === "instagram direct") return "Instagram";
  if (v === "facebook messenger") return "Facebook";
  if (v === "whatsapp" || v === "ana_whatsapp") return "WhatsApp";
  if (v === "email" || v === "e-mail") return "E-mail";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Prévia da última mensagem sem marcadores técnicos da atendente virtual. */
export function displayPreview(text: string | null | undefined) {
  const t = (text || "").trim();
  if (!t) return "";
  const media = /^\[MÍDIA_PARA_SECRETARIA:\s*([^;\]]*)/i.exec(t)?.[1]?.toLowerCase() || "";
  if (/^\[MÍDIA_PARA_SECRETARIA/i.test(t)) {
    if (media.includes("imagem")) return "Enviou uma imagem";
    if (media.includes("vídeo") || media.includes("video")) return "Enviou um vídeo";
    if (media.includes("pdf") || media.includes("documento")) return "Enviou um documento";
    return "Enviou um arquivo";
  }
  if (/^\[FIGURINHA_RECEBIDA\]/i.test(t)) return "Enviou uma figurinha";
  return t.replace(/\[(ANÁLISE_DA_IMAGEM|MÍDIA_PARA_SECRETARIA|FIGURINHA_RECEBIDA)[^\]]*\]\s*/gi, "").trim() || "Enviou um arquivo";
}
