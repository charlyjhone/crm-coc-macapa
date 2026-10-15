import type { Atendimento } from "@/hooks/useAtendimentos";

const urgentWords = /\b(urgente|urgencia|emergencia|acidente|machucad[oa]|hospital|socorro|violencia|ameaca|abuso|desaparecid[oa]|agressao)\b/i;

export function attendancePriority(lead: Atendimento, now = Date.now()) {
  if (lead.triage_status === "resolvido") return { level: 0, reason: "" };
  const inbound = lead.last_inbound_message_at ? Date.parse(lead.last_inbound_message_at) : NaN;
  const outbound = lead.last_outbound_message_at ? Date.parse(lead.last_outbound_message_at) : NaN;
  const unanswered = Number.isFinite(inbound) && (!Number.isFinite(outbound) || inbound > outbound);
  const hours = unanswered ? Math.max(0, (now - inbound) / 3_600_000) : 0;
  if (unanswered && urgentWords.test((lead.last_inbound_message || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
    return { level: 3, reason: "Mensagem com possível urgência; verificar o contexto" };
  }
  if (unanswered && hours >= 4) return { level: 3, reason: `Família sem resposta há ${Math.floor(hours)} h` };
  if (unanswered && hours >= 1) return { level: 2, reason: `Família sem resposta há ${Math.floor(hours)} h` };
  if (unanswered && lead.triage_status === "aguardando_secretaria") return { level: 1, reason: "Aguardando resposta da secretaria" };
  return { level: 0, reason: "" };
}
