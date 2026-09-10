// Lead scoring determinístico para ordenar o CRM por "com quem eu preciso
// falar primeiro". Dois modos:
//
//  - PIPELINE (em_aberto / em_negociacao): prioriza quem está com a bola no
//    NOSSO campo (cliente respondeu e espera resposta), negociações ativas,
//    valor alto e engajamento recente. Leads que sumiram perdem prioridade —
//    a Susan já está fazendo follow-up automático neles.
//
//  - GANHOS (ganho / produzido): prioriza obrigações — cliente aguardando
//    resposta, pagamento vencido, produção parada há muito tempo.
//
// O score é 0-100, com "reasons" legíveis pra tooltip. Tier: P1 (>=65),
// P2 (>=40), P3 (resto).

export interface PriorityLead {
  status?: string | null;
  valor?: number | null;
  moeda?: string | null;
  valor_pago?: number | null;
  data_proximo_pagamento?: string | null;
  ai_close_probability?: number | null;
  email_inbound_count?: number;
  whatsapp_inbound_count?: number;
  email_outbound_count?: number;
  whatsapp_outbound_count?: number;
  last_inbound_message_at?: string | null;
  last_outbound_message_at?: string | null;
  last_interaction?: string | null;
  created_at?: string;
  ganho_at?: string | null;
  produzido_at?: string | null;
  delivered_at?: string | null;
  archived?: boolean;
  unclassified?: boolean;
}

export interface LeadPriority {
  score: number;
  tier: 1 | 2 | 3;
  reasons: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / DAY_MS);
}

function valorToBRL(valor?: number | null, moeda?: string | null): number {
  if (!valor || valor <= 0) return 0;
  if (moeda === 'USD') return valor * 5.5;
  if (moeda === 'EUR') return valor * 6.0;
  return valor;
}

/** Cliente mandou a última mensagem e estamos devendo resposta? */
export function isBallInOurCourt(lead: PriorityLead): boolean {
  const tIn = lead.last_inbound_message_at ? Date.parse(lead.last_inbound_message_at) : NaN;
  const tOut = lead.last_outbound_message_at ? Date.parse(lead.last_outbound_message_at) : NaN;
  if (Number.isNaN(tIn)) return false;
  if (Number.isNaN(tOut)) return true;
  return tIn > tOut;
}

function tierFor(score: number): 1 | 2 | 3 {
  if (score >= 65) return 1;
  if (score >= 40) return 2;
  return 3;
}

function clamp(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)));
}

function pipelinePriority(lead: PriorityLead): LeadPriority {
  let score = 0;
  const reasons: string[] = [];

  const ballOurs = isBallInOurCourt(lead);
  const dInbound = daysSince(lead.last_inbound_message_at);
  const dOutbound = daysSince(lead.last_outbound_message_at);

  // 1) Cliente aguardando NOSSA resposta — maior urgência do CRM
  if (ballOurs) {
    const waiting = dInbound ?? 0;
    score += 35 + Math.min(12, waiting * 3);
    reasons.push(
      waiting >= 1
        ? `Cliente aguardando sua resposta há ${Math.floor(waiting)}d`
        : 'Cliente aguardando sua resposta'
    );
  }

  // 2) Probabilidade de fechamento (IA)
  const prob = lead.ai_close_probability ?? null;
  if (prob !== null) {
    score += prob * 0.35;
    if (prob >= 60) reasons.push(`${prob}% de chance de fechar`);
  }

  // 3) Negociação ativa vale mais que lead em aberto
  if (lead.status === 'em_negociacao') {
    score += 12;
    reasons.push('Em negociação');
  }

  // 4) Valor do negócio (escala log pra não deixar 1 lead gigante dominar tudo)
  const brl = valorToBRL(lead.valor, lead.moeda);
  if (brl > 0) {
    score += Math.min(12, Math.log10(brl + 1) * 3);
    if (brl >= 20000) reasons.push('Valor alto');
  }

  // 5) Engajamento: quanto o cliente já falou com a gente
  const inboundCount = (lead.email_inbound_count || 0) + (lead.whatsapp_inbound_count || 0);
  score += Math.min(8, inboundCount);

  // 6) Frescor: cliente falou faz pouco tempo = lead quente
  if (dInbound !== null) {
    score += Math.max(0, 8 - dInbound);
  } else {
    // Nunca respondeu nada — lead frio
    score -= 10;
  }

  // 7) Ghosting: bola com o cliente há dias — Susan está no follow-up,
  //    não precisa da atenção do Miguel
  if (!ballOurs && dOutbound !== null && dOutbound > 2) {
    score -= Math.min(25, (dOutbound - 2) * 1.5);
    if (dOutbound >= 7) reasons.push(`Sem resposta do cliente há ${Math.floor(dOutbound)}d (Susan está no follow-up)`);
  }

  return { score: clamp(score), tier: tierFor(clamp(score)), reasons };
}

function wonPriority(lead: PriorityLead): LeadPriority {
  let score = 20; // negócio ganho já merece atenção de base
  const reasons: string[] = [];

  const ballOurs = isBallInOurCourt(lead);
  const dInbound = daysSince(lead.last_inbound_message_at);

  // 1) Cliente (agora parceiro) aguardando resposta
  if (ballOurs) {
    const waiting = dInbound ?? 0;
    score += 35 + Math.min(12, waiting * 3);
    reasons.push(
      waiting >= 1
        ? `Cliente aguardando sua resposta há ${Math.floor(waiting)}d`
        : 'Cliente aguardando sua resposta'
    );
  }

  // 2) Pagamento vencido / pendente
  const dPagamento = lead.data_proximo_pagamento ? daysSince(lead.data_proximo_pagamento) : null;
  if (dPagamento !== null && dPagamento > 0) {
    score += 18;
    reasons.push(`Pagamento previsto venceu há ${Math.floor(dPagamento)}d`);
  }
  const brl = valorToBRL(lead.valor, lead.moeda);
  const pago = lead.valor_pago || 0;
  if (brl > 0 && pago < brl * 0.99) {
    score += 8;
    reasons.push('Pagamento não quitado');
  }

  // 3) Produção parada: ganhou e ainda não produziu/entregou
  if (lead.status === 'ganho' && !lead.produzido_at && !lead.delivered_at) {
    const dGanho = daysSince(lead.ganho_at) ?? 0;
    score += Math.min(18, dGanho * 1.2);
    if (dGanho >= 7) reasons.push(`Ganho há ${Math.floor(dGanho)}d sem produção`);
  }

  // 4) Frescor da última mensagem do cliente
  if (dInbound !== null) score += Math.max(0, 6 - dInbound);

  return { score: clamp(score), tier: tierFor(clamp(score)), reasons };
}

/**
 * Score de prioridade do lead. Retorna null para leads sem noção útil de
 * prioridade (perdido, entregue, arquivado, não classificado).
 */
export function computeLeadPriority(lead: PriorityLead): LeadPriority | null {
  if (!lead || lead.archived || lead.unclassified) return null;
  const status = lead.status || 'em_aberto';
  if (status === 'em_aberto' || status === 'em_negociacao') return pipelinePriority(lead);
  if (status === 'ganho' || status === 'produzido') return wonPriority(lead);
  return null; // perdido / entregue
}

export function priorityTierLabel(tier: 1 | 2 | 3): string {
  return tier === 1 ? 'P1' : tier === 2 ? 'P2' : 'P3';
}
