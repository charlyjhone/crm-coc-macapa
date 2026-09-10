import {
  buildTiffanyPayload,
  getTiffanyMissingFields,
} from "./tiffany-export.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

Deno.test("builds the Exame export without an AI gateway", () => {
  const payload = buildTiffanyPayload({
    name: "Exame",
    emails: ["giovanna.prado@exame.com"],
    valor: 12000,
    moeda: "BRL",
    produto: "publicidade",
    data_proximo_pagamento: "2026-07-30",
  });

  assertEquals(payload.nome_empresa, "Exame");
  assertEquals(payload.nome_pessoa, "Giovanna Prado");
  assertEquals(payload.emails, ["giovanna.prado@exame.com"]);
  assertEquals(payload.valor, "12000");
  assertEquals(payload.produto, "Publicidade");
  assertEquals(payload.expected_payment_date, "2026-07-30");
  assertEquals(getTiffanyMissingFields(payload), []);
});

Deno.test("keeps legacy context callers compatible and normalizes BRL values", () => {
  const payload = buildTiffanyPayload(
    null,
    "Lead: ACME\nEmails: billing@acme.com\nProduto: Mentoria\nMoeda: USD\nValor: R$ 12.000,00\nexpected_payment_date: 30/07/2026",
  );

  assertEquals(payload.valor, "12000");
  assertEquals(payload.produto, "Consultoria");
  assertEquals(payload.moeda, "USD");
  assertEquals(payload.expected_payment_date, "2026-07-30");
});

Deno.test("reports missing required CRM data before calling Tiffany", () => {
  const payload = buildTiffanyPayload({ name: "Sem dados" });
  assertEquals(getTiffanyMissingFields(payload), [
    "valor (preço do serviço)",
    "email do cliente",
  ]);
});
