/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas escolares ainda não estão nos tipos gerados do Supabase. */
// Definições dos relatórios da aba "Relatórios". Cada um lê o banco desta escola e devolve uma tabela pronta para CSV/PDF.
import { supabase } from "@/integrations/supabase/client";
import { getPhoneVariants } from "@/lib/whatsappPhone";
import { SCHOOL_TIME_ZONE } from "@/lib/schoolDateTime";
import type { ReportCell, ReportTable } from "@/lib/reportExport";

export type ReportRange = { from: string; to: string }; // datas "AAAA-MM-DD" no fuso da escola, inclusivas

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  usesPeriod: boolean;
  load: (range: ReportRange) => Promise<ReportTable>;
};

const client = supabase as any;
const PAGE = 1000;

/** Lê todas as linhas, de mil em mil (o Supabase limita cada resposta). */
async function readAll<T = any>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
    if (from > 200_000) break;
  }
  return rows;
}

/** Início e fim do período em ISO, considerando o fuso da escola (UTC-3, sem horário de verão). */
function bounds({ from, to }: ReportRange) {
  return { start: `${from}T00:00:00-03:00`, end: `${to}T23:59:59.999-03:00` };
}

const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: SCHOOL_TIME_ZONE }) : "";
const fmtDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { timeZone: SCHOOL_TIME_ZONE, dateStyle: "short", timeStyle: "short" }) : "";
const fmtDay = (day?: string | null) => (day ? day.slice(0, 10).split("-").reverse().join("/") : "");
export const periodLabel = ({ from, to }: ReportRange) => `Período: ${fmtDay(from)} a ${fmtDay(to)}`;

export function formatPhone(value?: string | null) {
  const d = (value || "").replace(/\D/g, "");
  const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || "";
}

const label = (map: Record<string, string>, value?: string | null) => (value ? map[value] || value.replace(/_/g, " ") : "");

export const STAGE_LABELS: Record<string, string> = {
  novo_interessado: "Novo interessado", tentativa_contato: "Tentativa de contato", contato_realizado: "Contato realizado",
  qualificado: "Qualificado", visita_agendada: "Visita agendada", visita_realizada: "Visita realizada",
  condicoes_apresentadas: "Condições apresentadas", documentacao_pendente: "Documentação pendente",
  matricula_em_conclusao: "Matrícula em conclusão", matriculado: "Matriculado", nutricao: "Nutrição", perdido: "Perdido",
};
const VISIT_LABELS: Record<string, string> = {
  agendada: "Agendada", confirmada: "Confirmada", realizada: "Realizada", cancelada: "Cancelada",
  reagendada: "Reagendada", nao_compareceu: "Não compareceu",
};
const TRIAGE_LABELS: Record<string, string> = {
  novo: "Novo", respondido_agente: "Respondido pela atendente virtual", aguardando_secretaria: "Aguardando a secretaria", resolvido: "Resolvido",
};
const INTEREST_LABELS: Record<string, string> = { alto: "Alto", medio: "Médio", baixo: "Baixo", indefinido: "Indefinido" };
const ORIGIN_LABELS: Record<string, string> = {
  indicacao: "Indicação", redes_sociais: "Redes sociais", instagram: "Redes sociais", facebook: "Redes sociais",
  panfletagem_outdoor: "Panfletagem / outdoor", outros: "Outros", cadastro_manual: "Cadastro manual", ana_whatsapp: "WhatsApp",
};
const RELATION_LABELS: Record<string, string> = {
  mae: "Mãe", pai: "Pai", responsavel: "Responsável", avo: "Avó/Avô", tio: "Tia/Tio", outro: "Outro",
};
const SUBJECT_LABELS: Record<string, string> = {
  matricula: "Matrícula", rematricula: "Rematrícula", boletim: "Boletim e notas", financeiro: "Financeiro", uniforme: "Uniforme",
  transporte: "Transporte", vaga_emprego: "Vaga de emprego", visita: "Visita", outros: "Outros",
};
const yesNo = (v: unknown) => (v ? "Sim" : "");

// ---------------------------------------------------------------------------------------------
// Famílias da escola: responsáveis ligados a alunos. Um aluno sem oportunidade de matrícula no funil
// é tratado como aluno atual (é assim que entram os alunos importados do sistema da escola).
type FamilyIndex = { currentPhones: Set<string>; prospectPhones: Set<string>; studentsByPhone: Map<string, string[]> };

async function loadFamilyIndex(): Promise<FamilyIndex> {
  const [links, opps] = await Promise.all([
    readAll(() => client.from("student_guardians").select("student_id,guardians(phone),students(full_name)").order("student_id")),
    readAll(() => client.from("enrollment_opportunities").select("id,student_id").order("id")),
  ]);
  const prospectStudents = new Set(opps.map((o: any) => o.student_id).filter(Boolean));
  const index: FamilyIndex = { currentPhones: new Set(), prospectPhones: new Set(), studentsByPhone: new Map() };
  for (const link of links as any[]) {
    const phone = link.guardians?.phone;
    if (!phone) continue;
    const current = !prospectStudents.has(link.student_id);
    for (const v of getPhoneVariants(phone)) {
      (current ? index.currentPhones : index.prospectPhones).add(v);
      if (current && link.students?.full_name) {
        const list = index.studentsByPhone.get(v) || [];
        if (!list.includes(link.students.full_name)) list.push(link.students.full_name);
        index.studentsByPhone.set(v, list);
      }
    }
  }
  return index;
}

function classify(phones: (string | null | undefined)[], index: FamilyIndex, hasOpportunity: boolean) {
  const variants = phones.flatMap((p) => getPhoneVariants(p));
  const current = variants.some((v) => index.currentPhones.has(v));
  const prospect = hasOpportunity || variants.some((v) => index.prospectPhones.has(v));
  const students = [...new Set(variants.flatMap((v) => index.studentsByPhone.get(v) || []))];
  if (current && prospect) return { tipo: "Família atual com interesse em nova matrícula", students };
  if (current) return { tipo: "Família atual", students };
  if (prospect) return { tipo: "Interessado (captação)", students };
  return { tipo: "Não identificado", students };
}

// ---------------------------------------------------------------------------------------------

const contatos: ReportDefinition = {
  id: "contatos",
  title: "Contatos do WhatsApp",
  description: "Todas as conversas que chegaram no período, separando família atual, interessado e não identificado.",
  usesPeriod: true,
  async load(range) {
    const { start, end } = bounds(range);
    const [leads, index, opps] = await Promise.all([
      readAll(() => client.from("leads")
        .select("id,name,phone,phones,created_at,assunto,interesse,triage_status,last_inbound_message_at,archived")
        .eq("archived", false).gte("created_at", start).lte("created_at", end).order("created_at", { ascending: true })),
      loadFamilyIndex(),
      readAll(() => client.from("enrollment_opportunities").select("legacy_lead_id").not("legacy_lead_id", "is", null).order("legacy_lead_id")),
    ]);
    const withOpportunity = new Set(opps.map((o: any) => o.legacy_lead_id));
    const counts = new Map<string, number>();
    const rows = leads.map((l: any) => {
      const c = classify([l.phone, ...(l.phones || [])], index, withOpportunity.has(l.id));
      counts.set(c.tipo, (counts.get(c.tipo) || 0) + 1);
      return {
        nome: l.name, telefone: formatPhone(l.phone || l.phones?.[0]), primeiro: fmtDateTime(l.created_at), tipo: c.tipo,
        alunos: c.students.join(", "), assunto: label(SUBJECT_LABELS, l.assunto), interesse: label(INTEREST_LABELS, l.interesse),
        situacao: label(TRIAGE_LABELS, l.triage_status), ultima: fmtDateTime(l.last_inbound_message_at),
      };
    });
    const familias = (counts.get("Família atual") || 0) + (counts.get("Família atual com interesse em nova matrícula") || 0);
    return {
      title: "Contatos do WhatsApp", subtitle: periodLabel(range),
      columns: [
        { key: "nome", label: "Nome no WhatsApp" }, { key: "telefone", label: "Telefone", nowrap: true }, { key: "primeiro", label: "Primeiro contato", nowrap: true },
        { key: "tipo", label: "Classificação" }, { key: "alunos", label: "Aluno(s) da família" }, { key: "assunto", label: "Assunto" },
        { key: "interesse", label: "Interesse" }, { key: "situacao", label: "Situação" }, { key: "ultima", label: "Última mensagem", nowrap: true },
      ],
      rows,
      summary: [
        { label: "Contatos no período", value: rows.length },
        { label: "Famílias atuais", value: familias },
        { label: "Interessados (captação)", value: counts.get("Interessado (captação)") || 0 },
        { label: "Não identificados", value: counts.get("Não identificado") || 0 },
      ],
      notice: index.currentPhones.size ? undefined
        : "Ainda não há alunos atuais cadastrados. Depois da importação da lista de alunos, os contatos de famílias atuais passam a ser identificados aqui.",
    };
  },
};

const familias: ReportDefinition = {
  id: "familias",
  title: "Famílias e alunos",
  description: "Cadastro geral: cada aluno com seus responsáveis, vínculo, telefones e quem é o responsável financeiro.",
  usesPeriod: false,
  async load() {
    const [links, opps] = await Promise.all([
      readAll(() => client.from("student_guardians")
        .select("student_id,relationship,is_primary,is_financially_responsible,students(*),guardians(full_name,phone,email)")
        .order("student_id")),
      readAll(() => client.from("enrollment_opportunities").select("student_id").order("student_id")),
    ]);
    const prospect = new Set(opps.map((o: any) => o.student_id));
    const students = new Set<string>();
    const rows = (links as any[])
      .map((l) => {
        const s = l.students || {};
        students.add(l.student_id);
        return {
          aluno: s.full_name || "", situacao: prospect.has(l.student_id) ? "Interessado (captação)" : "Aluno da escola",
          turma: s.current_class || s.turma || s.class_name || "", nascimento: fmtDay(s.birth_date),
          responsavel: l.guardians?.full_name || "", vinculo: label(RELATION_LABELS, l.relationship),
          principal: yesNo(l.is_primary), financeiro: yesNo(l.is_financially_responsible),
          telefone: formatPhone(l.guardians?.phone), email: l.guardians?.email || "",
        };
      })
      .sort((a, b) => a.situacao.localeCompare(b.situacao) || a.turma.localeCompare(b.turma) || a.aluno.localeCompare(b.aluno));
    const current = new Set((links as any[]).filter((l) => !prospect.has(l.student_id)).map((l) => l.student_id));
    return {
      title: "Famílias e alunos", subtitle: "Cadastro geral (não depende do período)",
      columns: [
        { key: "aluno", label: "Aluno" }, { key: "situacao", label: "Situação" }, { key: "turma", label: "Turma" },
        { key: "nascimento", label: "Nascimento", nowrap: true }, { key: "responsavel", label: "Responsável" }, { key: "vinculo", label: "Vínculo" },
        { key: "principal", label: "Principal" }, { key: "financeiro", label: "Financeiro" },
        { key: "telefone", label: "Telefone", nowrap: true }, { key: "email", label: "E-mail" },
      ],
      rows,
      summary: [
        { label: "Alunos", value: students.size },
        { label: "Alunos da escola", value: current.size },
        { label: "Interessados", value: students.size - current.size },
        { label: "Vínculos de responsáveis", value: rows.length },
      ],
      notice: current.size ? undefined : "A lista de alunos da escola ainda não foi importada. Por enquanto aparecem só as famílias interessadas cadastradas no atendimento.",
    };
  },
};

const funil: ReportDefinition = {
  id: "funil",
  title: "Funil de matrículas",
  description: "Interessados que entraram ou mudaram de etapa no período: série desejada, etapa, origem e próxima ação.",
  usesPeriod: true,
  async load(range) {
    const { start, end } = bounds(range);
    const rows = await readAll(() => client.from("enrollment_opportunities")
      .select("id,stage,desired_grade,desired_shift,source_channel,next_action,next_action_at,created_at,updated_at,loss_reason,students(full_name),guardians:primary_guardian_id(full_name,phone)")
      .gte("updated_at", start).lte("updated_at", end).order("updated_at", { ascending: false }));
    const byStage = new Map<string, number>();
    const out = (rows as any[]).map((o) => {
      byStage.set(o.stage, (byStage.get(o.stage) || 0) + 1);
      return {
        familia: o.guardians?.full_name || "", telefone: formatPhone(o.guardians?.phone), aluno: o.students?.full_name || "",
        serie: o.desired_grade || "", turno: o.desired_shift || "", etapa: label(STAGE_LABELS, o.stage),
        origem: label(ORIGIN_LABELS, o.source_channel), proxima: o.next_action || "", quando: fmtDateTime(o.next_action_at),
        entrada: fmtDate(o.created_at), atualizado: fmtDateTime(o.updated_at), perda: o.loss_reason || "",
      };
    });
    const want = ["documentacao_pendente", "matricula_em_conclusao", "matriculado"].reduce((n, s) => n + (byStage.get(s) || 0), 0);
    return {
      title: "Funil de matrículas", subtitle: periodLabel(range),
      columns: [
        { key: "familia", label: "Responsável" }, { key: "telefone", label: "Telefone", nowrap: true }, { key: "aluno", label: "Aluno" },
        { key: "serie", label: "Série desejada" }, { key: "turno", label: "Turno" }, { key: "etapa", label: "Etapa" },
        { key: "origem", label: "Origem" }, { key: "proxima", label: "Próxima ação" }, { key: "quando", label: "Data da ação", nowrap: true },
        { key: "entrada", label: "Entrou em", nowrap: true }, { key: "atualizado", label: "Atualizado em", nowrap: true }, { key: "perda", label: "Motivo da perda" },
      ],
      rows: out,
      summary: [
        { label: "Interessados no período", value: out.length },
        { label: "Querem matricular", value: want },
        { label: "Visitas realizadas", value: byStage.get("visita_realizada") || 0 },
        { label: "Perdidos", value: byStage.get("perdido") || 0 },
      ],
    };
  },
};

const visitas: ReportDefinition = {
  id: "visitas",
  title: "Visitas à escola",
  description: "Visitas marcadas para o período, com situação, família e anotações da visita.",
  usesPeriod: true,
  async load(range) {
    const { start, end } = bounds(range);
    const rows = await readAll(() => client.from("school_visits")
      .select("id,scheduled_at,status,family_impression,objections,follow_up_notes,enrollment_opportunities(desired_grade,students(full_name),guardians:primary_guardian_id(full_name,phone))")
      .gte("scheduled_at", start).lte("scheduled_at", end).order("scheduled_at", { ascending: true }));
    const count = (s: string) => (rows as any[]).filter((v) => v.status === s).length;
    return {
      title: "Visitas à escola", subtitle: periodLabel(range),
      columns: [
        { key: "data", label: "Data e hora", nowrap: true }, { key: "status", label: "Situação" }, { key: "familia", label: "Responsável" },
        { key: "telefone", label: "Telefone", nowrap: true }, { key: "aluno", label: "Aluno" }, { key: "serie", label: "Série desejada" },
        { key: "impressao", label: "Impressão da família" }, { key: "objecoes", label: "Objeções" }, { key: "proximos", label: "Próximos passos" },
      ],
      rows: (rows as any[]).map((v) => {
        const o = v.enrollment_opportunities || {};
        return {
          data: fmtDateTime(v.scheduled_at), status: label(VISIT_LABELS, v.status), familia: o.guardians?.full_name || "",
          telefone: formatPhone(o.guardians?.phone), aluno: o.students?.full_name || "", serie: o.desired_grade || "",
          impressao: v.family_impression || "", objecoes: v.objections || "", proximos: v.follow_up_notes || "",
        };
      }),
      summary: [
        { label: "Visitas no período", value: rows.length },
        { label: "Realizadas", value: count("realizada") },
        { label: "Canceladas", value: count("cancelada") },
        { label: "Não compareceram", value: count("nao_compareceu") },
      ],
    };
  },
};

const pesquisas: ReportDefinition = {
  id: "pesquisas",
  title: "Pesquisa de origem e satisfação",
  description: "Respostas das famílias novas: como conheceram a escola e a nota do atendimento.",
  usesPeriod: true,
  async load(range) {
    const { start, end } = bounds(range);
    const rows = await readAll(() => client.from("activity_log").select("lead_id,metadata,created_at")
      .in("metadata->>survey", ["origin", "rating"]).gte("created_at", start).lte("created_at", end).order("created_at", { ascending: true }));
    const ids = [...new Set((rows as any[]).map((r) => r.lead_id).filter(Boolean))];
    const names = new Map<string, { name: string; phone: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await client.from("leads").select("id,name,phone").in("id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const l of data || []) names.set(l.id, { name: l.name, phone: l.phone });
    }
    // Uma linha por família: origem e nota mais recentes.
    type SurveyEntry = { origem?: string; nota?: number; data: string };
    const byLead = new Map<string, SurveyEntry>();
    for (const r of rows as any[]) {
      const entry: SurveyEntry = byLead.get(r.lead_id) || { data: r.created_at };
      if (r.metadata?.survey === "origin" && r.metadata?.source_channel) entry.origem = r.metadata.source_channel;
      if (r.metadata?.survey === "rating" && Number.isFinite(Number(r.metadata?.rating))) entry.nota = Number(r.metadata.rating);
      entry.data = r.created_at;
      byLead.set(r.lead_id, entry);
    }
    const out = [...byLead.entries()].map(([id, e]) => ({
      familia: names.get(id)?.name || "", telefone: formatPhone(names.get(id)?.phone), data: fmtDateTime(e.data),
      origem: label(ORIGIN_LABELS, e.origem), nota: e.nota ?? "",
    }));
    const notas = out.map((r) => r.nota).filter((n): n is number => typeof n === "number");
    const media = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—";
    const origemTop = Object.entries(out.reduce<Record<string, number>>((acc, r) => { if (r.origem) acc[r.origem] = (acc[r.origem] || 0) + 1; return acc; }, {}))
      .sort((a, b) => b[1] - a[1])[0];
    return {
      title: "Pesquisa de origem e satisfação", subtitle: periodLabel(range),
      columns: [
        { key: "familia", label: "Família" }, { key: "telefone", label: "Telefone", nowrap: true }, { key: "data", label: "Respondeu em", nowrap: true },
        { key: "origem", label: "Como conheceu a escola" }, { key: "nota", label: "Nota (1 a 5)" },
      ],
      rows: out,
      summary: [
        { label: "Famílias que responderam", value: out.length },
        { label: "Notas recebidas", value: notas.length },
        { label: "Nota média", value: media },
        { label: "Origem mais citada", value: origemTop ? `${origemTop[0]} (${origemTop[1]})` : "—" },
      ],
    };
  },
};

const matriculas: ReportDefinition = {
  id: "matriculas",
  title: "Matrículas lançadas",
  description: "Quantidade de matrículas por dia, lançada pela secretaria, para comparar com anos anteriores.",
  usesPeriod: true,
  async load(range) {
    const { data, error } = await client.from("enrollment_history").select("academic_year,day,count")
      .gte("day", range.from).lte("day", range.to).order("day", { ascending: true }).limit(5000);
    const missing = error && (error.code === "42P01" || error.code === "PGRST205" || /enrollment_history/.test(error.message || ""));
    if (error && !missing) throw error;
    const rows = (data || []).map((r: any) => ({ dia: fmtDay(r.day), ano: r.academic_year, quantidade: r.count }));
    return {
      title: "Matrículas lançadas", subtitle: periodLabel(range),
      columns: [{ key: "dia", label: "Dia", nowrap: true }, { key: "ano", label: "Ano letivo" }, { key: "quantidade", label: "Matrículas no dia" }],
      rows,
      summary: [{ label: "Total no período", value: rows.reduce((n: number, r: any) => n + (Number(r.quantidade) || 0), 0) }],
      notice: missing ? "O lançamento de matrículas ainda não está ativado no banco desta escola." : undefined,
    };
  },
};

const resumo: ReportDefinition = {
  id: "resumo",
  title: "Resumo do período",
  description: "Uma página com os números principais: contatos, famílias atuais, funil, visitas e satisfação.",
  usesPeriod: true,
  async load(range) {
    const [c, f, v, p] = await Promise.all([contatos.load(range), funil.load(range), visitas.load(range), pesquisas.load(range)]);
    const pick = (t: ReportTable, labelText: string) => t.summary?.find((s) => s.label === labelText)?.value ?? 0;
    const rows: Record<string, ReportCell>[] = [
      { grupo: "Atendimento", item: "Contatos que chegaram pelo WhatsApp", valor: pick(c, "Contatos no período") },
      { grupo: "Atendimento", item: "…de famílias atuais", valor: pick(c, "Famílias atuais") },
      { grupo: "Atendimento", item: "…de interessados (captação)", valor: pick(c, "Interessados (captação)") },
      { grupo: "Atendimento", item: "…não identificados", valor: pick(c, "Não identificados") },
      { grupo: "Captação", item: "Interessados no funil", valor: pick(f, "Interessados no período") },
      { grupo: "Captação", item: "Querem matricular", valor: pick(f, "Querem matricular") },
      { grupo: "Captação", item: "Perdidos", valor: pick(f, "Perdidos") },
      { grupo: "Visitas", item: "Visitas marcadas", valor: pick(v, "Visitas no período") },
      { grupo: "Visitas", item: "Visitas realizadas", valor: pick(v, "Realizadas") },
      { grupo: "Satisfação", item: "Famílias que responderam a pesquisa", valor: pick(p, "Famílias que responderam") },
      { grupo: "Satisfação", item: "Nota média do atendimento (1 a 5)", valor: pick(p, "Nota média") },
      { grupo: "Satisfação", item: "Origem mais citada", valor: pick(p, "Origem mais citada") },
    ];
    return {
      title: "Resumo do período", subtitle: periodLabel(range),
      columns: [{ key: "grupo", label: "Área" }, { key: "item", label: "Indicador" }, { key: "valor", label: "Valor" }],
      rows, notice: c.notice,
    };
  },
};

export const REPORTS: ReportDefinition[] = [resumo, contatos, familias, funil, visitas, pesquisas, matriculas];
