// Extrator heurístico de URL da resposta de ferramentas externas (Sara/Tiffany).
// Procura por chaves comuns (edit_url, admin_url, url, link, checkout_url, etc.)
// e faz fallback para qualquer string http(s) encontrada.

const PREFERRED_KEYS = [
  "edit_url",
  "admin_url",
  "dashboard_url",
  "delivery_url",
  "invoice_url",
  "payment_url",
  "checkout_url",
  "public_url",
  "share_url",
  "url",
  "link",
  "href",
];

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

export function extractExternalUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  // BFS: primeiro passe procura chaves preferidas em qualquer profundidade.
  const queue: any[] = [obj];
  const seen = new Set<any>();
  const fallback: string[] = [];

  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (const item of cur) queue.push(item);
      continue;
    }

    for (const [k, v] of Object.entries(cur)) {
      const keyLower = k.toLowerCase();
      if (isHttpUrl(v)) {
        if (PREFERRED_KEYS.includes(keyLower)) return v;
        if (/(url|link|href)$/i.test(keyLower)) fallback.unshift(v);
        else fallback.push(v);
      } else if (v && typeof v === "object") {
        queue.push(v);
      }
    }
  }

  return fallback[0] || null;
}
