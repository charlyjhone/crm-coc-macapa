// Funil escolar simplificado (layout "Proposta 2"): etapas, origens, séries e temperatura.
// As etapas detalhadas continuam no banco (enrollment_opportunities.stage); aqui só agrupamos.

export const ACTIVE_EXCLUDED = ["matriculado", "perdido", "nutricao"] as const;

export const FUNNEL_COLUMNS = [
  { key: "novo", label: "Novo contato", stages: ["novo_interessado", "tentativa_contato"] },
  { key: "conversa", label: "Em conversa", stages: ["contato_realizado", "qualificado"] },
  { key: "visita", label: "Visita agendada", stages: ["visita_agendada"] },
  { key: "visitou", label: "Visitou", stages: ["visita_realizada", "condicoes_apresentadas"] },
  // O CRM vai no máximo até "Quer matricular": a matrícula é confirmada no sistema da escola.
  { key: "matricular", label: "Quer matricular", stages: ["documentacao_pendente", "matricula_em_conclusao"] },
] as const;

export type FunnelKey = (typeof FUNNEL_COLUMNS)[number]["key"];

export function funnelKeyOf(stage: string): FunnelKey | null {
  return FUNNEL_COLUMNS.find((column) => (column.stages as readonly string[]).includes(stage))?.key ?? null;
}

/** Etapa do banco usada quando a secretaria move a família para uma coluna. */
export const STAGE_FOR_COLUMN: Record<FunnelKey, string> = {
  novo: "novo_interessado",
  conversa: "contato_realizado",
  visita: "visita_agendada",
  visitou: "visita_realizada",
  matricular: "documentacao_pendente",
};

export const NEXT_ACTION_FOR_COLUMN: Record<FunnelKey, string> = {
  novo: "Fazer o primeiro contato",
  conversa: "Agendar visita",
  visita: "Receber a família na visita",
  visitou: "Retornar à família após a visita",
  matricular: "Encaminhar à matrícula",
};

export const STAGE_LABEL: Record<string, string> = {
  novo_interessado: "Novo contato", tentativa_contato: "Tentativa de contato", contato_realizado: "Em conversa",
  qualificado: "Em conversa", visita_agendada: "Visita agendada", visita_realizada: "Visitou",
  condicoes_apresentadas: "Visitou · pensando", documentacao_pendente: "Quer matricular", matricula_em_conclusao: "Quer matricular",
  matriculado: "Matriculado", nutricao: "Nutrição", perdido: "Sem interesse",
};

// ---- Origem ---------------------------------------------------------------

export type SourceOption = { value: string; label: string; short: string; paid?: boolean };

export const PAID_SOURCES: SourceOption[] = [
  { value: "anuncio_instagram", label: "Anúncio no Instagram", short: "Anúncio · Instagram", paid: true },
  { value: "anuncio_facebook", label: "Anúncio no Facebook", short: "Anúncio · Facebook", paid: true },
];

export const FREE_SOURCES: SourceOption[] = [
  { value: "whatsapp", label: "WhatsApp", short: "WhatsApp" },
  { value: "instagram", label: "Instagram orgânico", short: "Instagram orgânico" },
  { value: "indicacao", label: "Indicação", short: "Indicação" },
  { value: "passou_na_frente", label: "Passou na frente", short: "Passou na frente" },
  { value: "outro", label: "Outro", short: "Outro" },
];

const LEGACY_SOURCE_LABEL: Record<string, string> = {
  ana_whatsapp: "WhatsApp", cadastro_manual: "Cadastro manual", facebook: "Facebook", google: "Google",
  evento: "Evento", site: "Site", telefone: "Telefone", ja_conhecia: "Já conhecia",
  redes_sociais: "Redes sociais", panfletagem_outdoor: "Panfletagem/outdoor", outros: "Outros",
};

export function sourceLabel(value: string | null | undefined) {
  if (!value) return null;
  const known = [...PAID_SOURCES, ...FREE_SOURCES].find((option) => option.value === value);
  return known?.short || LEGACY_SOURCE_LABEL[value] || value;
}

export const isPaidSource = (value: string | null | undefined) => !!value && value.startsWith("anuncio_");

/** Categoria usada nos relatórios (junta valores antigos com os novos). */
export function sourceCategory(value: string | null | undefined): string {
  const v = (value || "").toLowerCase();
  if (v === "anuncio_instagram") return "anuncio_instagram";
  if (v === "anuncio_facebook") return "anuncio_facebook";
  if (["instagram", "facebook", "redes_sociais"].includes(v)) return "instagram";
  if (["whatsapp", "ana_whatsapp"].includes(v)) return "whatsapp";
  if (v === "indicacao") return "indicacao";
  if (v === "panfletagem_outdoor") return "panfletagem_outdoor";
  if (v === "passou_na_frente") return "passou_na_frente";
  return "outros";
}

export const SOURCE_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "anuncio_instagram", label: "Anúncio Instagram", color: "#B4235F" },
  { key: "anuncio_facebook", label: "Anúncio Facebook", color: "#3B6FD8" },
  { key: "instagram", label: "Instagram/redes (orgânico)", color: "#E58DB4" },
  { key: "whatsapp", label: "WhatsApp", color: "#1F8A50" },
  { key: "indicacao", label: "Indicação", color: "#7A5300" },
  { key: "panfletagem_outdoor", label: "Panfletagem/outdoor", color: "#F2A93B" },
  { key: "passou_na_frente", label: "Passou na frente", color: "#5B6675" },
  { key: "outros", label: "Outros", color: "#A8AFBA" },
];

// ---- Séries (COC: por idade) ---------------------------------------------

export const GRADE_GROUPS: { label: string; grades: { name: string; age: number }[] }[] = [
  { label: "Educação Infantil", grades: [{ name: "Maternal 2", age: 2 }, { name: "Maternal 3", age: 3 }, { name: "1º Período", age: 4 }, { name: "2º Período", age: 5 }] },
  { label: "Fundamental I", grades: [1, 2, 3, 4, 5].map((n) => ({ name: `${n}º ano`, age: n + 5 })) },
  { label: "Fundamental II", grades: [6, 7, 8, 9].map((n) => ({ name: `${n}º ano`, age: n + 5 })) },
  { label: "Ensino Médio", grades: [1, 2, 3].map((n) => ({ name: `${n}ª série`, age: n + 14 })) },
];

export type GradeGroup = (typeof GRADE_GROUPS)[number];

export function gradeForAge(age: number | null, groups: GradeGroup[] = GRADE_GROUPS) {
  if (!age || !Number.isFinite(age)) return null;
  for (const group of groups) for (const grade of group.grades) if (grade.age === age) return grade.name;
  return null;
}

/** Lê a configuração da escola "Série=idade; ..." (system_settings.escola_series_idades) e agrupa por segmento. */
export function gradeGroupsFromSetting(raw: string | null | undefined): GradeGroup[] | null {
  const items = (raw || "").split(/[;\n]+/).map((part) => part.match(/^\s*(.{2,40}?)\s*=\s*(\d{1,2})\s*$/))
    .filter((m): m is RegExpMatchArray => !!m).map((m) => ({ name: m[1].trim(), age: Number(m[2]) }));
  if (!items.length) return null;
  const order = ["Educação Infantil", "Fundamental I", "Fundamental II", "Ensino Médio", "Outras"];
  const map = new Map<string, { name: string; age: number }[]>();
  for (const item of items) {
    const seg = segmentOf(item.name) || (item.age <= 5 ? "Educação Infantil" : item.age <= 10 ? "Fundamental I" : item.age <= 14 ? "Fundamental II" : "Ensino Médio");
    map.set(seg, [...(map.get(seg) || []), item]);
  }
  return order.filter((label) => map.has(label)).map((label) => ({ label, grades: map.get(label)! }));
}

export function segmentOf(grade: string | null | undefined) {
  const g = (grade || "").toLowerCase();
  if (!g) return null;
  if (/maternal|período|periodo|jardim|infantil/.test(g)) return "Educação Infantil";
  if (/série|serie|médio|medio/.test(g)) return "Ensino Médio";
  const n = Number(g.match(/(\d)/)?.[1]);
  if (n >= 1 && n <= 5) return "Fundamental I";
  if (n >= 6 && n <= 9) return "Fundamental II";
  return null;
}

// ---- Temperatura (pela pontuação calculada no banco) ----------------------

export type Temperature = { key: "quente" | "morno" | "frio"; label: string; className: string };

export function temperatureOf(score: number | null | undefined): Temperature {
  const s = score ?? 0;
  if (s >= 60) return { key: "quente", label: "Quente", className: "bg-[#FDECE2] text-[#A63E0C]" };
  if (s >= 30) return { key: "morno", label: "Morno", className: "bg-[#FFF6D9] text-[#7A5300]" };
  return { key: "frio", label: "Frio", className: "bg-[#E9EEF4] text-[#3D4C61]" };
}

// ---- Motivos de desistência ------------------------------------------------

export const LOSS_REASONS = ["Valor", "Outra escola", "Localização", "Turno / horário", "Outro"];
