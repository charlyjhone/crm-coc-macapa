import {
  applyProbabilityGuardrails,
  hasRecentClientPriceCommitment,
} from "./sales-signals.ts";

Deno.test("contraproposta recente do cliente eleva negociação real para pelo menos 78%", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");
  const detected = hasRecentClientPriceCommitment([{
    text: "A proposta de US$ 600 é justa e vou buscar aprovação do orçamento.",
    timestamp: Date.parse("2026-08-03T10:00:00Z"),
  }], now);
  if (!detected) throw new Error("sinal de preço não detectado");

  const result = applyProbabilityGuardrails(55, {
    inboundCount: 5,
    daysSinceLastInbound: 1,
    consecutiveUnansweredOutbound: 1,
    ballInOurCourt: false,
    recentClientPriceCommitment: detected,
  });
  if (result !== 78) throw new Error(`esperado 78, recebido ${result}`);
});

Deno.test("objeção a preço sem cifra aceita não cria compromisso", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");
  const detected = hasRecentClientPriceCommitment([{
    text: "Your proposal of US$ 3,000 is above our budget, so we cannot proceed.",
    timestamp: Date.parse("2026-08-03T10:00:00Z"),
  }], now);
  if (detected) throw new Error("objeção foi confundida com compromisso de preço");
});

Deno.test("budget baixo do cliente é contraproposta, não aceite do nosso preço", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");
  const detected = hasRecentClientPriceCommitment([{
    text: "Our all-inclusive budget is US$ 500, while your proposal is US$ 3,000.",
    timestamp: Date.parse("2026-08-03T10:00:00Z"),
  }], now);
  if (detected) throw new Error("budget baixo recebeu o piso reservado a preço aceito/defendido");
});

Deno.test("silêncio prolongado continua impondo teto", () => {
  const result = applyProbabilityGuardrails(80, {
    inboundCount: 2,
    daysSinceLastInbound: 31,
    consecutiveUnansweredOutbound: 5,
    ballInOurCourt: false,
    recentClientPriceCommitment: false,
  });
  if (result !== 10) throw new Error(`esperado 10, recebido ${result}`);
});

Deno.test("campanha importada pode ser avaliada mesmo sem mensagem vinculada", () => {
  const result = applyProbabilityGuardrails(20, {
    inboundCount: 0,
    daysSinceLastInbound: null,
    consecutiveUnansweredOutbound: 0,
    ballInOurCourt: false,
    recentClientPriceCommitment: false,
    hasExternalCampaignEvidence: true,
  });
  if (result !== 20) throw new Error(`esperado 20, recebido ${result}`);
});
