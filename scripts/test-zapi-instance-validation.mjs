import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/zapi-webhook/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness({ expectedInstanceId = 'coc-instance', requireInstanceId = true, validCallbackSecret = true } = {}) {
  let handler;
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    ZAPI_INSTANCE_ID: expectedInstanceId,
    REQUIRE_ZAPI_INSTANCE_ID: requireInstanceId ? 'true' : 'false',
  };
  const supabase = {
    async rpc(name, args) {
      if (name !== 'verify_zapi_webhook_secret') throw new Error('Unexpected RPC: ' + name);
      return { data: validCallbackSecret && args.p_secret === 'callback-secret', error: null };
    },
  };
  vm.runInNewContext(compiled, {
    serve: fn => { handler = fn; },
    createClient: () => supabase,
    setActivityContext: async () => {},
    Deno: { env: { get: key => env[key] } },
    Request, Response, URL,
    console: { log() {}, warn() {}, error() {} },
  });
  return async function call(payload, secret = 'callback-secret') {
    const response = await handler(new Request(
      'https://example.supabase.co/functions/v1/zapi-webhook?key=' + encodeURIComponent(secret),
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
    ));
    return { status: response.status, body: await response.json() };
  };
}

test('aceita callback autenticado da instância correta', async () => {
  const call = harness();
  const result = await call({ instanceId: 'coc-instance', notification: 'CHAT_LABEL_ASSOCIATION' });
  assert.equal(result.status, 200);
  assert.equal(result.body.skipped, true);
});

test('recusa callback sem instanceId quando a validação é obrigatória', async () => {
  const call = harness();
  const result = await call({ notification: 'CHAT_LABEL_ASSOCIATION' });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'missing_instance');
});

test('recusa callback de outra instância', async () => {
  const call = harness();
  const result = await call({ instanceId: 'conceito-instance', notification: 'CHAT_LABEL_ASSOCIATION' });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'wrong_instance');
});

test('falha fechada se a instância é obrigatória mas não foi configurada', async () => {
  const call = harness({ expectedInstanceId: undefined, requireInstanceId: true });
  const result = await call({ instanceId: 'anything', notification: 'CHAT_LABEL_ASSOCIATION' });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'instance_not_configured');
});

test('recusa callback sem segredo válido antes de processar o payload', async () => {
  const call = harness({ validCallbackSecret: false });
  const result = await call({ instanceId: 'coc-instance', notification: 'CHAT_LABEL_ASSOCIATION' });
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'unauthorized');
});
