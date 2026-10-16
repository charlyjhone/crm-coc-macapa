import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function harness({ name = 'Renato', valid = true, roles = ['user'] } = {}) {
  let handler;
  const sent = [], saved = [], tokens = [];
  const client = {
    auth: { async getUser(token) {
      tokens.push(token);
      return { data: { user: valid ? { id: 'operator-1', user_metadata: { full_name: name } } : null }, error: null };
    } },
    from(table) {
      const q = {
        select() { return q; }, eq() { return q; }, in() { return q; },
        async insert(row) { saved.push(row); return { error: null }; },
        then(resolve) { return Promise.resolve({ data: table === 'user_roles' ? roles.map(role => ({ role })) : [], error: null }).then(resolve); },
      }; return q;
    },
  };
  const auth = readFileSync(new URL('../supabase/functions/_shared/authorize-school-request.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
  const send = readFileSync(new URL('../supabase/functions/send-whatsapp-message/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(auth + '\n' + send, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    serve: fn => { handler = fn; }, createClient: () => client,
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://test.invalid' : 'internal-test-key' } },
    normalizeWhatsAppPhone: phone => phone,
    setActivityContext: async () => {},
    fetch: async (url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ messageId: 'test-message' }); },
    Request, Response, console: { log() {}, error() {}, warn() {} },
  });
  return { sent, saved, tokens, async call(body, token = 'user-token') {
    return handler(new Request('https://test.invalid', { method: 'POST',
      headers: token ? { authorization: 'Bearer ' + token } : {},
      body: JSON.stringify({ phone: '00000000000', message: 'Boa tarde!', ...body }),
    }));
  } };
}

test('assinatura vem da sessão, ignora nome e tipo Ana enviados pelo navegador', async () => {
  const h = harness();
  assert.equal((await h.call({ senderType: 'ana', operatorName: 'Outra pessoa' })).status, 200);
  assert.equal(h.sent[0].message, '*Renato — Secretaria COC*\nBoa tarde!');
  assert.equal(h.saved[0].message, h.sent[0].message);
  assert.equal(h.saved[0].raw_data.operator_id, 'operator-1');
  assert.equal(h.saved[0].raw_data.operator_name, 'Renato');
  assert.equal(h.saved[0].raw_data.sender_type, 'human');
  assert.ok(h.tokens.every(token => token === 'user-token'));
});
test('mensagem interna da Ana conserva assinatura e não recebe nome humano', async () => {
  const h = harness();
  const message = '*[Atendente Ana]*\nOlá!';
  assert.equal((await h.call({ message, senderType: 'ana' }, 'internal-test-key')).status, 200);
  assert.equal(h.sent[0].message, message);
  assert.equal(h.saved[0].raw_data.operator_name, null);
});
test('sem sessão, sessão inválida ou sem papel não há envio', async () => {
  for (const [opts, token, status] of [[{}, null, 401], [{ valid: false }, 'user-token', 401], [{ roles: [] }, 'user-token', 403]]) {
    const h = harness(opts);
    assert.equal((await h.call({}, token)).status, status);
    assert.equal(h.sent.length, 0);
  }
});
test('nome ausente pede cadastro no perfil, sem envio anônimo', async () => {
  const h = harness({ name: '' });
  assert.equal((await h.call({})).status, 422);
  assert.equal(h.sent.length, 0);
});
test('nome remove quebras e marcadores; payload inválido é recusado', async () => {
  const h = harness({ name: '*Renato*\nSilva' });
  assert.equal((await h.call({})).status, 200);
  assert.equal(h.saved[0].raw_data.operator_name, 'Renato Silva');
  const bad = harness();
  assert.equal((await bad.call({ message: null })).status, 400);
  assert.equal(bad.sent.length, 0);
});
