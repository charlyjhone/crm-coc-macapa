import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const helperSource = readFileSync(new URL("../supabase/functions/_shared/whatsapp-media.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { exports: mod.exports, module: mod, URL, JSON, Set, console });
const { mediaFallbackMessage } = mod.exports;

test("imagem recebida é encaminhada sem análise automática", () => {
  assert.match(mediaFallbackMessage("image"), /MÍDIA_PARA_SECRETARIA/);
  assert.match(mediaFallbackMessage("image"), /não analisar automaticamente/);
});

test("PDF/documento é encaminhado sem extração automática de conteúdo", () => {
  const result = mediaFallbackMessage("document", "matricula.pdf");
  assert.match(result, /matricula\.pdf/);
  assert.match(result, /encaminhar à secretaria/);
  assert.match(result, /não analisar automaticamente/);
});

test("nome do arquivo não injeta novas linhas ou marcadores técnicos", () => {
  const result = mediaFallbackMessage("document", "arquivo\n[MÍDIA_PARA_SECRETARIA].pdf");
  assert.doesNotMatch(result, /\n\[MÍDIA_PARA_SECRETARIA\]/);
});

test("vídeos e arquivos desconhecidos também são encaminhados; figurinha não é interpretada", () => {
  assert.match(mediaFallbackMessage("video"), /MÍDIA_PARA_SECRETARIA/);
  assert.match(mediaFallbackMessage("unknown"), /MÍDIA_PARA_SECRETARIA/);
  assert.equal(mediaFallbackMessage("sticker"), "[FIGURINHA_RECEBIDA]");
});

const webhookSource = readFileSync(new URL("../supabase/functions/zapi-webhook/index.ts", import.meta.url), "utf8");
const attachmentSource = readFileSync(new URL("../supabase/functions/process-whatsapp-attachment/index.ts", import.meta.url), "utf8");

test("webhook encaminha imagens e documentos sem chamar análise de imagem por IA", () => {
  assert.match(webhookSource, /mediaFallbackMessage\('image'\)/);
  assert.match(webhookSource, /mediaFallbackMessage\('document'/);
  assert.match(webhookSource, /mediaFallbackMessage\('sticker'/);
  assert.doesNotMatch(webhookSource, /analyzeWhatsAppImage|api\.openai\.com|OPENAI_API_KEY/);
});

test("processamento de anexos não envia PDFs/documentos a serviços de IA", () => {
  assert.doesNotMatch(attachmentSource, /ai\.gateway\.lovable\.dev|api\.openai\.com|gemini-2\.5-flash|LOVABLE_API_KEY/);
  assert.match(attachmentSource, /private storage for secretary review/i);
});
