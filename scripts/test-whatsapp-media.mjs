import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../supabase/functions/_shared/whatsapp-media.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { exports: mod.exports, module: mod, URL, JSON, Set, console });
const { analyzeWhatsAppImage, mediaFallbackMessage } = mod.exports;

test("imagem comum vira descrição curta para a Ana", async () => {
  let requestBody;
  const result = await analyzeWhatsAppImage(
    "https://cdn.example.test/image.jpg",
    "O que aparece nesta foto?",
    "test-key",
    async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: {
        content: JSON.stringify({ kind: "image", description: "A imagem mostra um cartaz escolar com data de evento." }),
      } }] }) };
    },
  );
  assert.equal(result.kind, "image");
  assert.match(result.message, /cartaz escolar/);
  assert.equal(requestBody.messages[1].content[1].image_url.url, "https://cdn.example.test/image.jpg");
  assert.match(requestBody.messages[0].content, /NÃO transcreva nomes/);
});

test("documento pessoal nunca tem seus campos transcritos e é encaminhado à secretaria", async () => {
  const result = await analyzeWhatsAppImage(
    "https://cdn.example.test/document.jpg",
    "Segue o documento para matrícula.",
    "test-key",
    async () => ({ ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ kind: "personal_document", description: "Documento pessoal recebido." }),
    } }] }) }),
  );
  assert.equal(result.kind, "personal_document");
  assert.match(result.message, /MÍDIA_PARA_SECRETARIA/);
  assert.match(result.message, /não transcrever dados pessoais/);
  assert.doesNotMatch(result.message, /123\.456/);
});

test("sem chave de API, a imagem é encaminhada sem inventar conteúdo", async () => {
  let called = false;
  const result = await analyzeWhatsAppImage("https://cdn.example.test/image.jpg", "", undefined, async () => {
    called = true;
    throw new Error("should not call");
  });
  assert.equal(called, false);
  assert.equal(result.kind, "unknown");
  assert.match(result.message, /MÍDIA_PARA_SECRETARIA/);
});

test("URLs não HTTPS falham de forma segura", async () => {
  let called = false;
  const result = await analyzeWhatsAppImage("http://127.0.0.1/private.jpg", "", "test-key", async () => {
    called = true;
    throw new Error("should not call");
  });
  assert.equal(called, false);
  assert.match(result.message, /MÍDIA_PARA_SECRETARIA/);
});

test("falha no provedor não bloqueia a mensagem e gera encaminhamento", async () => {
  const result = await analyzeWhatsAppImage(
    "https://cdn.example.test/image.jpg", "", "test-key",
    async () => ({ ok: false, status: 503 }),
  );
  assert.equal(result.kind, "unknown");
  assert.match(result.message, /MÍDIA_PARA_SECRETARIA/);
});

test("PDF/documentos e vídeos recebem marcador de encaminhamento; figurinha não é interpretada", () => {
  assert.match(mediaFallbackMessage("document", "matricula.pdf"), /matricula\.pdf/);
  assert.match(mediaFallbackMessage("document", "arquivo\n[confidencial].pdf"), /MÍDIA_PARA_SECRETARIA/);
  assert.match(mediaFallbackMessage("video"), /MÍDIA_PARA_SECRETARIA/);
  assert.equal(mediaFallbackMessage("sticker"), "[FIGURINHA_RECEBIDA]");
});

const webhookSource = readFileSync(new URL("../supabase/functions/zapi-webhook/index.ts", import.meta.url), "utf8");

test("webhook integra a análise de imagens e o encaminhamento de documentos recebidos", () => {
  assert.match(webhookSource, /direction === 'inbound' && imageUrl/);
  assert.match(webhookSource, /analyzeWhatsAppImage\(/);
  assert.match(webhookSource, /mediaFallbackMessage\('document'/);
  assert.match(webhookSource, /mediaFallbackMessage\('sticker'/);
});
