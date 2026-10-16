import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/schoolDateTime.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { schoolDateTimeInput, schoolDateTimeToIso } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('horário da escola independe do fuso do navegador/servidor', () => {
  assert.equal(schoolDateTimeToIso('2026-10-23T15:00'), '2026-10-23T18:00:00.000Z');
  assert.equal(schoolDateTimeInput('2026-10-23T18:00:00.000Z'), '2026-10-23T15:00');
  assert.equal(schoolDateTimeInput('2026-10-24T01:00:00.000Z'), '2026-10-23T22:00');
});
test('datas inexistentes ou incompletas não são normalizadas silenciosamente', () => {
  for (const value of ['', '2026-02-30T15:00', '2026-13-01T15:00', '2026-10-23T25:00', 'amanhã', '2026-10-23']) {
    assert.equal(schoolDateTimeToIso(value), null, value);
  }
});
test('outro fuso pode ser configurado e horário inexistente no horário de verão é recusado', () => {
  assert.equal(schoolDateTimeToIso('2026-10-23T15:00', 'America/Manaus'), '2026-10-23T19:00:00.000Z');
  assert.equal(schoolDateTimeToIso('2026-03-08T02:30', 'America/New_York'), null);
});
