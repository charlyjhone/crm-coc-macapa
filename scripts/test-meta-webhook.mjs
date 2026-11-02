// Testes do webhook da Meta (Instagram/Messenger) com banco em memória, sem chamadas externas.
// node --test scripts/test-meta-webhook.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { test } from "node:test";

function load() {
  let src = readFileSync(new URL("../supabase/functions/meta-webhook/index.ts", import.meta.url), "utf8");
  src = src.replace(/^import .*;\n/gm, "").replace(/export async function/g, "async function").replace(/export const/g, "const").replace("import.meta.main", "false");
  const js = stripTypeScriptTypes(src, { mode: "transform" }) + "\nglobalThis.__x = { handleEvent, validSignature };";
  const ctx = { crypto: globalThis.crypto, TextEncoder, URL, Response, console: { log() {}, error() {} },
    fetch: async () => ({ ok: true, json: async () => ({ name: "Maria Souza", username: "maria.s" }) }),
    Deno: { env: { get: (k) => (k === "META_PAGE_ACCESS_TOKEN" ? "token" : undefined) } }, serve() {}, createClient() {}, Date, Number, JSON, Array, Promise };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return ctx.__x;
}

function memoryDb() {
  const tables = { leads: [], lead_social_identities: [], social_messages: [] };
  let seq = 0;
  const from = (name) => {
    const filters = [];
    let op = "select", payload = null;
    const rows = () => tables[name].filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select() { return q; },
      eq(k, v) { filters.push([k, v]); return q; },
      insert(row) {
        op = "insert"; payload = row;
        if (name === "lead_social_identities" && tables[name].some((r) => r.channel === row.channel && r.social_user_id === row.social_user_id)) q._error = { code: "23505" };
        else if (name === "social_messages" && row.external_id && tables[name].some((r) => r.channel === row.channel && r.external_id === row.external_id)) q._error = { code: "23505" };
        else { q._row = { id: `id-${++seq}`, ...row }; tables[name].push(q._row); }
        return q;
      },
      update(patch) { op = "update"; payload = patch; return q; },
      async maybeSingle() { return { data: rows()[0] || null, error: null }; },
      async single() { return op === "insert" ? { data: q._row || null, error: q._error || null } : { data: rows()[0] || null, error: null }; },
      then(resolve) {
        if (op === "update") rows().forEach((r) => Object.assign(r, payload));
        return Promise.resolve({ data: null, error: q._error || null }).then(resolve);
      },
    };
    return q;
  };
  return { from, tables };
}

const { handleEvent, validSignature } = load();
const inbound = (mid, text, sender = "IGSID-1", ts = Date.parse("2026-11-01T15:00:00Z")) => ({ sender: { id: sender }, recipient: { id: "PAGE" }, timestamp: ts, message: { mid, text } });

test("assinatura: aceita a correta e recusa alterada", async () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const sig = "sha256=" + createHmac("sha256", "segredo").update(body).digest("hex");
  assert.equal(await validSignature(body, sig, "segredo"), true);
  assert.equal(await validSignature(body + " ", sig, "segredo"), false);
  assert.equal(await validSignature(body, null, "segredo"), false);
  assert.equal(await validSignature(body, sig, "outro"), false);
});

test("primeira mensagem cria contato, vínculo e mensagem; aguarda secretaria", async () => {
  const db = memoryDb();
  assert.equal(await handleEvent(db, "instagram", inbound("m1", "Tem vaga no 6º ano?")), "stored");
  assert.equal(db.tables.leads.length, 1);
  const lead = db.tables.leads[0];
  assert.equal(lead.name, "Maria Souza");
  assert.equal(lead.source, "Instagram Direct");
  assert.equal(lead.triage_status, "aguardando_secretaria");
  assert.equal(lead.last_inbound_message, "Tem vaga no 6º ano?");
  assert.equal(db.tables.lead_social_identities[0].username, "maria.s");
  assert.ok(db.tables.lead_social_identities[0].last_inbound_at);
  assert.equal(db.tables.social_messages[0].direction, "inbound");
});

test("reenvio do mesmo mid não duplica; segunda mensagem usa o mesmo contato", async () => {
  const db = memoryDb();
  await handleEvent(db, "instagram", inbound("m1", "Oi"));
  assert.equal(await handleEvent(db, "instagram", inbound("m1", "Oi")), "duplicate");
  await handleEvent(db, "instagram", inbound("m2", "Quanto custa?"));
  assert.equal(db.tables.leads.length, 1);
  assert.equal(db.tables.social_messages.length, 2);
});

test("eco de resposta pelo aplicativo vira mensagem enviada, sem criar contato novo", async () => {
  const db = memoryDb();
  await handleEvent(db, "facebook", inbound("m1", "Bom dia", "PSID-9"));
  const echo = { sender: { id: "PAGE" }, recipient: { id: "PSID-9" }, timestamp: Date.now(), message: { mid: "m2", text: "Bom dia! Como posso ajudar?", is_echo: true } };
  assert.equal(await handleEvent(db, "facebook", echo), "stored");
  assert.equal(db.tables.leads.length, 1);
  const out = db.tables.social_messages.find((m) => m.external_id === "m2");
  assert.equal(out.direction, "outbound");
  assert.equal(out.operator_name, "Pelo aplicativo");
  assert.ok(db.tables.leads[0].last_outbound_message_at);
});

test("anexo sem texto aparece como [imagem]; contato resolvido é reaberto", async () => {
  const db = memoryDb();
  await handleEvent(db, "instagram", inbound("m1", "Oi"));
  db.tables.leads[0].triage_status = "resolvido"; db.tables.leads[0].status = "resolvido";
  await handleEvent(db, "instagram", { sender: { id: "IGSID-1" }, recipient: { id: "PAGE" }, timestamp: Date.now(), message: { mid: "m2", attachments: [{ type: "image", payload: { url: "https://x" } }] } });
  assert.equal(db.tables.leads[0].last_inbound_message, "[imagem]");
  assert.equal(db.tables.leads[0].triage_status, "aguardando_secretaria");
  assert.equal(db.tables.leads[0].status, "em_atendimento");
});

test("eventos sem mensagem (leitura, entrega) são ignorados", async () => {
  const db = memoryDb();
  assert.equal(await handleEvent(db, "facebook", { sender: { id: "PSID" }, read: { watermark: 1 } }), "ignored");
  assert.equal(db.tables.leads.length, 0);
});
