export interface ProbabilitySignals {
  inboundCount: number;
  daysSinceLastInbound: number | null;
  consecutiveUnansweredOutbound: number;
  ballInOurCourt: boolean;
  recentClientPriceCommitment: boolean;
  hasExternalCampaignEvidence?: boolean;
}

export function hasRecentClientPriceCommitment(
  messages: Array<{ text: string; timestamp: number }>,
  now = Date.now(),
): boolean {
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  const price =
    /(?:US\$|USD|\$|R\$|BRL|EUR|€)\s*[\d.,]+|[\d.,]+\s*(?:USD|BRL|EUR|d[oó]lares?|reais|euros?)/iu;
  const p = `(?:${price.source})`;
  // Não basta a mesma mensagem conter “preço” e “budget”. Frases como
  // “US$ 3.000 está acima do nosso orçamento” são objeção, não compromisso.
  // Exigimos linguagem em que o cliente oferece, aceita ou defende a cifra.
  const commitment = new RegExp([
    // Aceite/defesa explícita do preço em discussão. Uma contraproposta baixa
    // ou simples declaração de budget não entra aqui: o modelo a avalia pela
    // distância para a nossa proposta, sem receber piso artificial de 78%.
    p + "[^.!?]{0,100}(?:is|é|parece|consideramos)?\\s*(?:fair|reasonable|acceptable|just[oa]|faz sentido|makes? sense|works? for us|aceit[aá]vel)",
    p + "[^.!?]{0,120}(?:vou|vamos|will|i'll|we'll)[^.!?]{0,50}(?:approval|aprova[cç][aã]o|secure|get|conseguir)[^.!?]{0,40}(?:budget|or[cç]amento|verba)",
  ].join("|"), "iu");
  return messages.some(({ text, timestamp }) =>
    Number.isFinite(timestamp) && now - timestamp <= tenDays &&
    price.test(text) && commitment.test(text)
  );
}

export function applyProbabilityGuardrails(
  probability: number,
  signals: ProbabilitySignals,
): number {
  let result = probability;
  if (
    signals.recentClientPriceCommitment &&
    signals.daysSinceLastInbound !== null &&
    signals.daysSinceLastInbound <= 10
  ) {
    // Contraproposta/aceite recente do próprio cliente já superou interesse e
    // qualificação. Ainda não é 90%, pois aprovação, contrato ou pagamento
    // podem faltar, mas uma nota mediana como 55% é incorreta.
    result = Math.max(result, 78);
  }
  if (signals.inboundCount === 0 && !signals.hasExternalCampaignEvidence) {
    result = Math.min(result, 15);
  }

  const ghostDays = signals.daysSinceLastInbound;
  if (!signals.ballInOurCourt && ghostDays !== null) {
    if (signals.consecutiveUnansweredOutbound >= 5 || ghostDays >= 30) {
      result = Math.min(result, 10);
    } else if (signals.consecutiveUnansweredOutbound >= 3 && ghostDays >= 14) {
      result = Math.min(result, 25);
    } else if (ghostDays >= 21) {
      result = Math.min(result, 35);
    }
  }
  return Math.max(0, Math.min(100, Math.round(result)));
}
