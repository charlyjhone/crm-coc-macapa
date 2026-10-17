import type { Atendimento } from "@/hooks/useAtendimentos";

const safetyWords = /\b(urgente|emergencia|acidente|machucad[oa]|hospital|socorro|violencia|ameaca|abuso|desaparecid[oa]|agressao|risco|perigo)\b/i;
const schoolTopics = /matricul|document|declarac|vaga|transferenc|visita/;
const enrollmentDeadline = /\b(ultimo dia|prazo (?:final|termina|vence|encerra|acaba)|ate hoje|ainda hoje|preciso.{0,35}(?:hoje|amanha)|necessito.{0,35}(?:hoje|amanha)|matricula.{0,25}(?:hoje|amanha)|vaga.{0,25}(?:hoje|amanha)|documentos?.{0,25}(?:hoje|amanha))\b/i;

export function attendancePriority(lead: Atendimento, now = Date.now()) {
  if (lead.triage_status === "resolvido" || lead.status === "resolvido" || lead.status === "nao_convertido") return { level: 0, reason: "" };
  const inbound = lead.last_inbound_message_at ? Date.parse(lead.last_inbound_message_at) : NaN;
  const outbound = lead.last_outbound_message_at ? Date.parse(lead.last_outbound_message_at) : NaN;
  const unanswered = Number.isFinite(inbound) && (!Number.isFinite(outbound) || inbound > outbound);
  const waitingForTeam = lead.triage_status === "aguardando_secretaria";
  const since = waitingForTeam && lead.handoff_at ? Date.parse(lead.handoff_at) : inbound;
  const hours = Number.isFinite(since) ? Math.max(0, (now - since) / 3_600_000) : 0;
  const needsAction = unanswered || waitingForTeam;
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const summary = normalize(`${lead.assunto || ""} ${lead.triage_summary || ""} ${lead.attention_reason || ""}`);
  const message = normalize(lead.last_inbound_message || "");
  const schoolRelated = lead.assunto === "matricula" || schoolTopics.test(`${summary} ${message}`);
  const explicitUrgency = safetyWords.test(message) && !/\bnao\s+(?:e\s+)?urgente\b/.test(message);
  const deadlineUrgency = schoolRelated && enrollmentDeadline.test(message);

  // A idade da mensagem, sozinha, não torna fornecedores e contatos externos urgentes.
  if (lead.attention_level === "externo") return { level: 0, reason: "" };
  if (needsAction && (lead.attention_level === "urgente" || explicitUrgency || deadlineUrgency)) {
    const fallbackReason = explicitUrgency
      ? "A mensagem contém termos de possível urgência; verificar o contexto"
      : deadlineUrgency
        ? "A mensagem indica prazo próximo para uma demanda escolar"
        : "Mensagem classificada como urgente pela triagem";
    return { level: 3, reason: lead.attention_reason || fallbackReason };
  }
  if (needsAction && schoolRelated && hours >= 4) {
    return { level: 3, reason: `Demanda escolar aguardando a equipe há ${Math.floor(hours)} h` };
  }
  if (needsAction && hours >= 1 && (schoolRelated || waitingForTeam || lead.attention_level === "atencao")) {
    return { level: 2, reason: `Aguardando atendimento há ${Math.floor(hours)} h` };
  }
  if (needsAction && (waitingForTeam || lead.attention_level === "atencao")) {
    return { level: 1, reason: lead.attention_reason || "Aguardando atendimento" };
  }
  return { level: 0, reason: "" };
}
