// Modo demonstração: base fictícia só na memória do navegador.
// Liga automaticamente no endereço de prévio (host com "preview") ou com ?demo=1.
// Nada é gravado no Supabase e nenhuma mensagem é enviada ao WhatsApp.
import type { Atendimento, MensagemAtendimento } from "@/hooks/useAtendimentos";
import { currentAcademicYear, campaignDays, todayKey } from "@/lib/enrollmentCalendar";

function detectDemo() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_DEMO_MODE === "1") return true;
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "0") { try { sessionStorage.removeItem("crm-demo"); } catch { /* sem storage */ } return false; }
  if (params.get("demo") === "1") { try { sessionStorage.setItem("crm-demo", "1"); } catch { /* sem storage */ } }
  let remembered = false;
  try { remembered = sessionStorage.getItem("crm-demo") === "1"; } catch { /* sem storage */ }
  return host.includes("preview") || remembered;
}

export const DEMO_MODE = detectDemo();
export const DEMO_NOTICE = "Modo demonstração: nada foi salvo nem enviado.";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

// Horário de hoje no fuso da escola (aproximação: UTC-3).
function todayAt(hour: number, minute = 0) {
  const now = new Date(Date.now() - 3 * HOUR);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour + 3, minute)).toISOString();
}

const AGENT = "Atendente virtual";
const STAFF = "Secretaria";

function lead(partial: Partial<Atendimento> & Pick<Atendimento, "id" | "name">): Atendimento {
  return {
    email: null, phone: null, source: null, assunto: "matricula", interesse: null, triage_status: "respondido_agente",
    status: "em_atendimento", triage_summary: null, attention_level: "normal", attention_reason: null,
    agent_replied_at: null, handoff_at: null, handoff_reason: null, resolved_at: null,
    last_inbound_message: null, last_inbound_message_at: null, last_outbound_message_at: null, created_at: ago(3 * DAY),
    ...partial,
  };
}

function msg(id: string, direction: "inbound" | "outbound", message: string, at: string, senderName: string | null = null): MensagemAtendimento {
  return { id, channel: "whatsapp", direction, message, at, mediaType: null, mediaName: null, mediaCaption: null,
    mediaDurationSeconds: null, mediaUrl: null, mediaStoragePath: null, mediaMimeType: null, isAudio: false, senderName };
}

type DemoVisit = { id: string; scheduled_at: string; status: string; created_at: string; completed_at: string | null;
  family_impression: string | null; objections: string | null; follow_up_notes: string | null };
export type DemoOpportunity = {
  id: string; stage: string; legacy_lead_id: string | null; desired_grade: string; desired_shift: string | null;
  source_channel: string | null; next_action: string | null; next_action_at: string | null; created_at: string; updated_at: string;
  status_updated_at: string | null; loss_reason: string | null; lost_at: string | null; probability_score: number;
  enrolled_at: string | null; academic_year: number;
  students: { full_name: string } | null; guardians: { full_name: string; phone: string | null } | null;
  school_visits: DemoVisit[];
};

function build() {
  const leads: Atendimento[] = [
    lead({ id: "demo-1", name: "Mariana Souza", phone: "(96) 99100-0001", source: "Indicação", interesse: "6º ano", triage_status: "aguardando_secretaria",
      attention_level: "urgente", attention_reason: "Documento de transferência com prazo amanhã", handoff_at: ago(12 * MIN), handoff_reason: "Documento de transferência com prazo amanhã",
      last_inbound_message: "Preciso do documento até amanhã, é possível?", last_inbound_message_at: ago(12 * MIN), last_outbound_message_at: ago(13 * MIN),
      triage_summary: "Responsável pede documento de transferência com prazo de um dia. Encaminhado à secretaria como urgente.", assunto: "documento_declaracao" as Atendimento["assunto"] }),
    lead({ id: "demo-2", name: "Carlos Lima", phone: "(96) 99100-0002", source: "Instagram", interesse: "8º ano", triage_status: "aguardando_secretaria", attention_level: "atencao",
      handoff_at: ago(35 * MIN), handoff_reason: "Pergunta sobre vaga no 8º ano", last_inbound_message: "Tem vaga no 8º ano para o ano que vem?", last_inbound_message_at: ago(35 * MIN),
      last_outbound_message_at: ago(36 * MIN), triage_summary: "Família interessada em vaga no 8º ano, turno da manhã." }),
    lead({ id: "demo-3", name: "Paula Reis", phone: "(96) 99100-0003", source: "Redes sociais", interesse: "Maternal", triage_status: "aguardando_secretaria", attention_level: "atencao",
      handoff_at: ago(65 * MIN), handoff_reason: "Pediu para falar com a secretaria", last_inbound_message: "Quero falar com a secretaria, por favor.", last_inbound_message_at: ago(65 * MIN),
      last_outbound_message_at: ago(66 * MIN), triage_summary: "Mãe pediu atendimento humano sobre o Maternal." }),
    lead({ id: "demo-4", name: "Roberto Alves", phone: "(96) 99100-0004", source: "Indicação", interesse: "1º ano", triage_status: "aguardando_secretaria", attention_level: "atencao",
      handoff_at: ago(2 * HOUR), handoff_reason: "Quer remarcar a visita", last_inbound_message: "Podemos remarcar a visita para sexta?", last_inbound_message_at: ago(2 * HOUR),
      last_outbound_message_at: ago(2 * HOUR + MIN), triage_summary: "Pai quer remarcar a visita para sexta-feira." }),
    lead({ id: "demo-5", name: "Fernanda Castro", phone: "(96) 99100-0005", source: "Site", interesse: "3º ano", triage_status: "respondido_agente", attention_level: "normal",
      last_inbound_message: "Obrigada! Vou ver com meu marido.", last_inbound_message_at: ago(3 * HOUR), last_outbound_message_at: ago(3 * HOUR - MIN),
      triage_summary: "Recebeu informações sobre o 3º ano e vai conversar em casa." }),
    lead({ id: "demo-6", name: "Júlia Moreira", phone: "(96) 99100-0006", source: "Panfletagem", interesse: "5º ano", triage_status: "respondido_agente", status: "em_negociacao",
      last_inbound_message: "Certo, aguardo a proposta.", last_inbound_message_at: ago(4 * DAY), last_outbound_message_at: ago(4 * DAY - HOUR),
      triage_summary: "Visitou a escola e aguarda condições para o 5º ano." }),
    lead({ id: "demo-7", name: "Eduardo Nunes", phone: "(96) 99100-0007", source: "Indicação", interesse: "2º ano", triage_status: "resolvido", status: "resolvido",
      last_inbound_message: "Perfeito, muito obrigado!", last_inbound_message_at: ago(DAY), last_outbound_message_at: ago(DAY - 10 * MIN), resolved_at: ago(DAY - 5 * MIN),
      triage_summary: "Dúvida sobre uniforme resolvida." }),
    lead({ id: "demo-8", name: "Beatriz Oliveira", phone: "(96) 99100-0008", source: "Instagram", interesse: "4º ano", triage_status: "novo", status: "novo", created_at: ago(20 * MIN),
      last_inbound_message: "Boa noite! Vocês têm período integral?", last_inbound_message_at: ago(20 * MIN), last_outbound_message_at: ago(19 * MIN),
      triage_summary: "Novo contato perguntando sobre período integral." }),
  ];

  const messages: Record<string, MensagemAtendimento[]> = {};
  const add = (leadId: string, list: [("inbound" | "outbound"), string, number, string?][]) => {
    messages[leadId] = list.map(([dir, text, msAgo, sender], i) => msg(`${leadId}-m${i}`, dir, text, ago(msAgo), sender ?? (dir === "outbound" ? AGENT : null)));
  };
  add("demo-1", [["inbound", "Bom dia! Preciso do documento de transferência até amanhã, é possível?", 14 * MIN],
    ["outbound", "Entendi que o prazo é curto. Vou pedir para a secretaria avaliar e continuar o atendimento por aqui.", 13 * MIN],
    ["inbound", "Tudo bem, fico aguardando.", 12 * MIN]]);
  add("demo-2", [["inbound", "Olá! Tem vaga no 8º ano para o ano que vem?", 37 * MIN],
    ["outbound", "Olá, Carlos! Vou confirmar a disponibilidade com a secretaria e já retorno.", 36 * MIN],
    ["inbound", "Tem vaga no 8º ano para o ano que vem?", 35 * MIN]]);
  add("demo-3", [["inbound", "Boa tarde, quero falar com a secretaria, por favor.", 66 * MIN],
    ["outbound", "Claro! Já avisei a secretaria, que continua o atendimento por aqui em instantes.", 65 * MIN]]);
  add("demo-4", [["inbound", "Oi, a visita está marcada para quinta, mas podemos remarcar para sexta?", 2 * HOUR + 2 * MIN],
    ["outbound", "Vou verificar a agenda com a secretaria e te confirmo.", 2 * HOUR + MIN],
    ["inbound", "Podemos remarcar a visita para sexta?", 2 * HOUR]]);
  add("demo-5", [["inbound", "Como funciona o 3º ano? Qual o horário?", 3 * HOUR + 5 * MIN],
    ["outbound", "O 3º ano funciona pela manhã, das 7h às 12h. Posso agendar uma visita para vocês conhecerem a escola?", 3 * HOUR + 4 * MIN],
    ["inbound", "Obrigada! Vou ver com meu marido.", 3 * HOUR]]);
  add("demo-6", [["outbound", "Júlia, foi um prazer receber vocês! Segue um resumo do que conversamos.", 4 * DAY, STAFF],
    ["inbound", "Certo, aguardo a proposta.", 4 * DAY - HOUR]]);
  add("demo-7", [["inbound", "Onde compro o uniforme?", DAY + 20 * MIN], ["outbound", "Na loja parceira, no centro. Te mando o endereço.", DAY + 10 * MIN, STAFF], ["inbound", "Perfeito, muito obrigado!", DAY]]);
  add("demo-8", [["inbound", "Boa noite! Vocês têm período integral?", 20 * MIN], ["outbound", "Boa noite! Temos sim. Para qual série seria?", 19 * MIN]]);

  const visit = (id: string, scheduled_at: string, status = "agendada"): DemoVisit => ({ id, scheduled_at, status, created_at: ago(5 * DAY),
    completed_at: status === "realizada" ? scheduled_at : null, family_impression: null, objections: null, follow_up_notes: null });
  const opp = (o: Partial<DemoOpportunity> & Pick<DemoOpportunity, "id" | "stage" | "desired_grade">, guardian: string, student: string): DemoOpportunity => ({
    legacy_lead_id: null, desired_shift: "Manhã", source_channel: "indicacao", next_action: null, next_action_at: null, created_at: ago(10 * DAY),
    updated_at: ago(DAY), status_updated_at: ago(DAY), loss_reason: null, lost_at: null, probability_score: 50,
    enrolled_at: null, academic_year: currentAcademicYear(),
    students: { full_name: student }, guardians: { full_name: guardian, phone: "(96) 99100-0000" }, school_visits: [], ...o,
  });

  const opportunities: DemoOpportunity[] = [
    opp({ id: "op-1", stage: "novo_interessado", desired_grade: "6º ano", legacy_lead_id: "demo-1", next_action: "Retornar sobre documento", next_action_at: ago(2 * DAY) }, "Mariana Souza", "Pedro Souza"),
    opp({ id: "op-2", stage: "contato_realizado", desired_grade: "8º ano", legacy_lead_id: "demo-2", source_channel: "instagram", next_action: "Confirmar vaga", next_action_at: todayAt(17) }, "Carlos Lima", "Lia Lima"),
    opp({ id: "op-3", stage: "novo_interessado", desired_grade: "Maternal", legacy_lead_id: "demo-3", source_channel: "redes_sociais", updated_at: ago(2 * HOUR) }, "Paula Reis", "Teo Reis"),
    opp({ id: "op-4", stage: "visita_agendada", desired_grade: "1º ano", legacy_lead_id: "demo-4", next_action: "Receber a família", next_action_at: todayAt(9),
      school_visits: [visit("v-1", todayAt(9))] }, "Roberto Alves", "Lara Alves"),
    opp({ id: "op-5", stage: "visita_agendada", desired_grade: "6º ano", source_channel: "site", next_action: "Visita", next_action_at: todayAt(10, 30),
      school_visits: [visit("v-2", todayAt(10, 30), "confirmada")] }, "Família Lima", "Davi Lima"),
    opp({ id: "op-6", stage: "visita_agendada", desired_grade: "Maternal", source_channel: "panfletagem_outdoor", next_action: "Visita", next_action_at: todayAt(15),
      school_visits: [visit("v-3", todayAt(15))] }, "Família Barros", "Nina Barros"),
    opp({ id: "op-7", stage: "visita_realizada", desired_grade: "5º ano", legacy_lead_id: "demo-6", source_channel: "panfletagem_outdoor", updated_at: ago(4 * DAY),
      next_action: "Enviar condições", next_action_at: ago(4 * DAY), school_visits: [visit("v-4", ago(4 * DAY), "realizada")] }, "Júlia Moreira", "Caio Moreira"),
    opp({ id: "op-8", stage: "condicoes_apresentadas", desired_grade: "3º ano", legacy_lead_id: "demo-5", source_channel: "site", next_action: "Retorno da família", next_action_at: ahead(2 * DAY),
      school_visits: [visit("v-5", ago(6 * DAY), "realizada")] }, "Fernanda Castro", "Bento Castro"),
    opp({ id: "op-9", stage: "documentacao_pendente", desired_grade: "2º ano", source_channel: "indicacao", next_action: "Receber documentos", next_action_at: ahead(DAY),
      school_visits: [visit("v-6", ago(8 * DAY), "realizada")] }, "Eduardo Nunes", "Alice Nunes"),
    opp({ id: "op-10", stage: "matricula_em_conclusao", desired_grade: "4º ano", source_channel: "redes_sociais", next_action: "Assinar contrato", next_action_at: ahead(3 * DAY),
      school_visits: [visit("v-7", ago(9 * DAY), "realizada")] }, "Família Prado", "Luísa Prado"),
  ];

  return { leads, messages, opportunities };
}

// Histórico fictício para a tela Direção (gerado de forma estável).
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function demoDirecaoData() {
  const rnd = seeded(42);
  const leads: { created_at: string }[] = [];
  const visits: { status: string; scheduled_at: string; completed_at: string | null; created_at: string }[] = [];
  const opportunities: { stage: string; source_channel: string | null; loss_reason: string | null; lost_at: string | null; status_updated_at: string | null; updated_at: string }[] = [];
  const origins: { lead_id: string; metadata: unknown; created_at: string }[] = [];
  const ratings: { lead_id: string; metadata: unknown; created_at: string }[] = [];
  const channels = ["indicacao", "indicacao", "indicacao", "instagram", "redes_sociais", "instagram", "panfletagem_outdoor", "panfletagem_outdoor", "site", "outro"];
  const reasons = ["Valor", "Valor", "Valor", "Outra escola", "Outra escola", "Localização", "Horário", "Outro"];
  for (let d = 180; d >= 0; d--) {
    const count = Math.round(rnd() * 2.6 + (d < 60 ? 0.6 : 0));
    for (let i = 0; i < count; i++) {
      const created = ago(d * DAY + rnd() * DAY);
      const id = `dl-${d}-${i}`;
      leads.push({ created_at: created });
      const ch = channels[Math.floor(rnd() * channels.length)];
      if (rnd() < 0.7) origins.push({ lead_id: id, metadata: { survey: "origin", source_channel: ch }, created_at: created });
      if (rnd() < 0.45) ratings.push({ lead_id: id, metadata: { survey: "rating", rating: rnd() < 0.78 ? 5 : rnd() < 0.85 ? 4 : 3 }, created_at: created });
      const r = rnd();
      if (r < 0.55) {
        const at = ago(Math.max(0, d - 3) * DAY);
        visits.push({ status: r < 0.42 ? "realizada" : "agendada", scheduled_at: at, completed_at: r < 0.42 ? at : null, created_at: created });
      }
      const stage = r < 0.2 ? "documentacao_pendente" : r < 0.27 ? "matriculado" : r < 0.4 ? "perdido" : r < 0.6 ? "visita_realizada" : "novo_interessado";
      const upd = ago(Math.max(0, d - 4) * DAY);
      opportunities.push({ stage, source_channel: ch, loss_reason: stage === "perdido" ? reasons[Math.floor(rnd() * reasons.length)] : null,
        lost_at: stage === "perdido" ? upd : null, status_updated_at: upd, updated_at: upd });
    }
  }
  return { leads, visits, opportunities, origins, ratings };
}

// Base mutável enquanto a página estiver aberta.
const store = DEMO_MODE ? build() : { leads: [], messages: {}, opportunities: [] } as ReturnType<typeof build>;
let manualEntries: { academic_year: number; day: string; count: number }[] | null = null;
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export const demo = {
  async leads() { await wait(150); return store.leads.map((l) => ({ ...l })); },
  async messages(leadId: string) { await wait(120); return [...(store.messages[leadId] || [])]; },
  async send(leadId: string, text: string) {
    await wait();
    const now = new Date().toISOString();
    (store.messages[leadId] ||= []).push(msg(`${leadId}-s${Date.now()}`, "outbound", text, now, STAFF));
    const l = store.leads.find((item) => item.id === leadId);
    if (l) { l.last_outbound_message_at = now; if (l.triage_status === "aguardando_secretaria") { l.triage_status = "respondido_agente"; l.attention_level = "normal"; } }
  },
  async resolve(leadId: string) {
    await wait();
    const l = store.leads.find((item) => item.id === leadId);
    if (l) { l.triage_status = "resolvido"; l.status = "resolvido"; l.resolved_at = new Date().toISOString(); l.attention_level = "normal"; }
    return { success: true, survey: "sent" };
  },
  async setLeadStatus(leadId: string, status: Atendimento["status"]) {
    await wait();
    const l = store.leads.find((item) => item.id === leadId);
    if (l) { l.status = status; if (l.triage_status === "resolvido" && status !== "resolvido") l.triage_status = "aguardando_secretaria"; }
  },
  async opportunities() { await wait(150); return store.opportunities.map((o) => ({ ...o, school_visits: o.school_visits.map((v) => ({ ...v })) })); },
  async moveOpportunity(id: string, stage: string) {
    await wait();
    const o = store.opportunities.find((item) => item.id === id);
    if (o) { o.stage = stage; o.updated_at = new Date().toISOString(); o.status_updated_at = o.updated_at; o.next_action_at = null; if (stage === "perdido") o.lost_at = o.updated_at; o.enrolled_at = stage === "matriculado" ? o.enrolled_at || o.updated_at : null; }
  },
  /** Matrículas por dia (lançamento manual da secretaria). */
  enrollmentEntries() { return (manualEntries ||= demoEnrollmentHistory().filter((r) => r.day <= todayKey())).map((r) => ({ ...r })); },
  async saveEnrollmentEntries(entries: { academic_year: number; day: string; count: number }[]) {
    await wait();
    const list = (manualEntries ||= demoEnrollmentHistory().filter((r) => r.day <= todayKey()));
    for (const e of entries) {
      const i = list.findIndex((r) => r.day === e.day);
      if (i >= 0) list[i] = { ...e }; else list.push({ ...e });
    }
  },
  /** Matrículas confirmadas na sessão (somam ao histórico fictício do ano atual). */
  enrolledThisSession() { return store.opportunities.filter((o) => o.enrolled_at).map((o) => ({ enrolled_at: o.enrolled_at as string, academic_year: o.academic_year })); },
  async setVisitStatus(visitId: string, status: string) {
    await wait();
    for (const o of store.opportunities) {
      const v = o.school_visits.find((item) => item.id === visitId);
      if (v) { v.status = status; if (status === "realizada") { v.completed_at = new Date().toISOString(); if (o.stage === "visita_agendada") o.stage = "visita_realizada"; } o.updated_at = new Date().toISOString(); }
    }
  },
};

// Histórico fictício de matrículas por dia para três anos letivos (comparativo).
export function demoEnrollmentHistory(): { academic_year: number; day: string; count: number }[] {
  const year = currentAcademicYear();
  const rows: { academic_year: number; day: string; count: number }[] = [];
  const totals: Record<number, number> = { [year - 2]: 300, [year - 1]: 330, [year]: 360 };
  for (const ay of [year - 2, year - 1, year]) {
    const rnd = seeded(ay);
    const days = campaignDays(ay);
    // Curva da campanha: devagar em ago/set, sobe em out–dez, pico em jan, cauda em fev/mar.
    const weights = days.map((d) => {
      const m = Number(d.slice(5, 7));
      const base = m === 8 ? 0.3 : m === 9 ? 0.5 : m === 10 ? 1 : m === 11 ? 1.4 : m === 12 ? 1.2 : m === 1 ? 2.2 : m === 2 ? 1.3 : 0.4;
      const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
      return weekday === 0 ? 0 : base * (weekday === 6 ? 0.4 : 1) * (0.6 + rnd() * 0.8);
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let carry = 0;
    days.forEach((day, i) => {
      const exact = (weights[i] / sum) * totals[ay] + carry;
      const count = Math.floor(exact);
      carry = exact - count;
      if (count) rows.push({ academic_year: ay, day, count });
    });
  }
  return rows;
}
