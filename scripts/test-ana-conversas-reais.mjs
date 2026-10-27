// Reproduz conversas reais da Ana (27/10/2026) que geraram resumo repetido,
// visita não agendada, série errada e resposta dupla. Roda o handler real com
// Supabase e HTTP simulados: sem rede, credenciais, WhatsApp ou dados de produção.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/school-triage/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// Próxima quarta-feira (dia útil) em formato DD/MM e AAAA-MM-DD.
const local = new Date(Date.now() - 3 * 3600000);
const delta = ((3 - local.getUTCDay() + 7) % 7) || 7;
const quarta = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + delta));
const quartaIso = quarta.toISOString().slice(0, 10);
const quartaBr = quartaIso.slice(8, 10) + '/' + quartaIso.slice(5, 7);

const triagem = (over = {}) => ({
  assunto: 'matricula', interesse: 'alto', cadastro_interesse: true,
  visita: { solicitada: false, data: null, horario: null },
  prioridade: 'normal', motivo_prioridade: 'Interesse em matrícula',
  precisa_humano: false, motivo_humano: null, resumo: 'Interesse em matrícula',
  resposta: 'Resposta da IA.', nome_extraido: null,
  cadastro: { responsavel: null, aluno: null, ano: 2027, serie: null, turno: null },
  ...over,
});

function harness() {
  let clock = Date.now() - 600000;
  let serial = 0;
  let handler;
  const state = {
    ai: triagem(), onAi: null, sent: [], rpcCalls: [],
    rows: {
      system_settings: [{ key: 'escola_agente_ativo', value: 'true' }, { key: 'escola_nome', value: 'Escola Teste' }, { key: 'escola_agente_nome', value: 'Ana' }],
      leads: [{ id: 'lead-1', name: 'Contato 5596900000000', phone: '5596900000000', status: 'novo', triage_status: 'novo', handoff_at: null }],
      whatsapp_messages: [], activity_log: [], enrollment_opportunities: [], students: [], guardians: [],
      ana_followups: [], school_visits: [], crm_survey_claims: [],
    },
  };
  const stamp = () => new Date(clock += 1000).toISOString();
  const append = (table, row) => {
    const result = { id: `row-${++serial}`, created_at: stamp(), ...row };
    state.rows[table].push(result);
    return result;
  };
  const field = (row, key) => key.split(/->>?/).reduce((value, part) => value?.[part], row);
  function query(table) {
    const filters = [];
    let limit = Infinity, ordering, single = false, operation = 'select', values;
    const q = {
      select() { return q; },
      eq(key, value) { filters.push(row => field(row, key) === value); return q; },
      gt(key, value) { filters.push(row => field(row, key) > value); return q; },
      gte(key, value) { filters.push(row => field(row, key) >= value); return q; },
      lt(key, value) { filters.push(row => field(row, key) < value); return q; },
      lte(key, value) { filters.push(row => field(row, key) <= value); return q; },
      in(key, list) { filters.push(row => list.includes(field(row, key))); return q; },
      or() { return q; },
      not(key, operator, value) {
        filters.push(row => operator === 'is' ? field(row, key) != null : !JSON.parse(value.replace('(', '[').replace(')', ']')).includes(field(row, key)));
        return q;
      },
      order(key, options) { ordering = { key, ...options }; return q; },
      limit(value) { limit = value; return q; },
      maybeSingle() { single = true; return q; },
      single() { single = true; return q; },
      insert(value) { operation = 'insert'; values = value; return q; },
      update(value) { operation = 'update'; values = value; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          let rows = state.rows[table].filter(row => filters.every(filter => filter(row)));
          if (operation === 'insert') rows = (Array.isArray(values) ? values : [values]).map(row => append(table, row));
          if (operation === 'update') rows.forEach(row => Object.assign(row, values));
          if (ordering) rows.sort((a, b) => String(field(a, ordering.key)).localeCompare(String(field(b, ordering.key))) * (ordering.ascending ? 1 : -1));
          rows = rows.slice(0, limit).map(row => structuredClone(row));
          return { data: single ? rows[0] || null : rows, error: null };
        }).then(resolve, reject);
      },
    };
    return q;
  }
  const supabase = {
    from: query,
    async rpc(name, args) {
      if (name === 'verify_school_triage_secret') return { data: true, error: null };
      state.rpcCalls.push({ name, args });
      if (name === 'resolve_lead_ids_by_phone') return { data: ['lead-1'], error: null };
      if (name === 'claim_crm_survey') return { data: false, error: null };
      if (name === 'register_ana_enrollment') {
        let student = state.rows.students.find(s => s.full_name === args.p_student_name);
        if (!student) student = append('students', { full_name: args.p_student_name });
        let opp = state.rows.enrollment_opportunities.find(o => o.student_id === student.id && o.desired_grade === args.p_desired_grade);
        const created = !opp;
        if (!opp) opp = append('enrollment_opportunities', { legacy_lead_id: args.p_lead_id, student_id: student.id, desired_grade: args.p_desired_grade, academic_year: args.p_academic_year, stage: 'novo_interessado' });
        return { data: { opportunity_id: opp.id, student_id: student.id, created }, error: null };
      }
      if (name === 'get_ana_available_visit_slots') {
        const weekday = new Date(args.p_date + 'T12:00:00-03:00').getUTCDay();
        if (weekday === 0 || weekday === 6) return { data: [], error: null };
        return { data: ['09:00', '15:00', '17:00'].map(slot_time => ({ slot_time, slot_at: new Date(args.p_date + 'T' + slot_time + ':00-03:00').toISOString() })), error: null };
      }
      if (name === 'register_ana_school_visit') {
        const visit = append('school_visits', { opportunity_id: args.p_opportunity_id, scheduled_at: args.p_scheduled_at, status: 'agendada' });
        return { data: visit.id, error: null };
      }
      throw Error(`RPC inesperada: ${name}`);
    },
  };
  async function fakeFetch(url, options) {
    if (url === 'https://api.openai.com/v1/chat/completions') {
      state.aiPayload = JSON.parse(options.body);
      state.onAi?.();
      return Response.json({ choices: [{ message: { content: JSON.stringify(state.ai) } }] });
    }
    if (url.endsWith('/functions/v1/send-whatsapp-message')) {
      const body = JSON.parse(options.body);
      state.sent.push(body);
      append('whatsapp_messages', { phone: body.phone, message: body.message, direction: 'outbound', raw_data: { sender_type: body.senderType, survey_step: body.surveyStep || null } });
      return Response.json({ success: true });
    }
    throw Error(`HTTP inesperado: ${url}`);
  }
  const context = {
    serve: fn => { handler = fn; }, createClient: () => supabase,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'mock', OPENAI_API_KEY: 'mock' })[key] } },
    fetch: fakeFetch, Response, Request, AbortSignal, console: { log() {}, error() {} },
  };
  vm.runInNewContext(compiled, context);
  const inbound = text => append('whatsapp_messages', { phone: '5596900000000', direction: 'inbound', message: text, raw_data: {} });
  const ana = text => append('whatsapp_messages', { phone: '5596900000000', direction: 'outbound', message: `*[Atendente Ana]*\n${text}`, raw_data: { sender_type: 'ana' } });
  async function send(text, ai) {
    if (ai) state.ai = ai;
    const row = inbound(text);
    const response = await handler(new Request('https://test.invalid', {
      method: 'POST', headers: { 'x-school-triage-secret': 'mock', 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: row.phone, message_id: row.id, text }),
    }));
    return await response.json();
  }
  const lastSent = () => state.sent.at(-1)?.message || '';
  return { state, send, inbound, ana, lastSent, context };
}

const cadastroPedro = { responsavel: 'Vivian Renata da Silva França', aluno: 'Pedro Costa França', ano: 2027, serie: '1º ano', turno: 'tarde' };

test('1º ano pedido no contexto do Ensino Médio vira 1ª série e o resumo mostra o segmento', async () => {
  const h = harness();
  h.inbound('Ensino médio ?');
  h.ana('Que bom que vocês pensam no COC para o Ensino Médio! 😊 Para qual série do Ensino Médio vocês procuram vaga?');
  await h.send('1º ano', triagem({ cadastro: cadastroPedro }));
  assert.match(h.lastSent(), /Série: 1ª série do Ensino Médio/);
  await h.send('Sim', triagem({ cadastro: cadastroPedro }));
  assert.equal(h.state.rows.enrollment_opportunities.length, 1);
  assert.equal(h.state.rows.enrollment_opportunities[0].desired_grade, '1ª série');
});

test('"1º ano do ensino médio" na mesma frase também é 1ª série', async () => {
  const h = harness();
  await h.send('Quero vaga no 1º ano do ensino médio', triagem({ cadastro: { ...cadastroPedro, serie: '1º ano do Ensino Médio' } }));
  assert.match(h.lastSent(), /Série: 1ª série do Ensino Médio/);
});

test('1º ano sem citar Ensino Médio continua sendo 1º ano do Fundamental', async () => {
  const h = harness();
  await h.send('1º ano', triagem({ cadastro: cadastroPedro }));
  assert.match(h.lastSent(), /Série: 1º ano\n/);
});

test('depois de confirmar, uma pergunta nova é respondida e o resumo não volta (caso 98136-4080)', async () => {
  const h = harness();
  await h.send('tarde', triagem({ cadastro: cadastroPedro }));
  assert.match(h.lastSent(), /Só para conferir/);
  await h.send('Sim', triagem({ cadastro: cadastroPedro }));
  assert.match(h.lastSent(), /Anotei o interesse/);
  const valores = 'Os valores para 2027 serão divulgados a partir de 1º de novembro de 2026. Será um prazer receber vocês para uma visita!';
  await h.send('Sobre valor de mensalidade e matrícula para novo aluno.', triagem({ cadastro: cadastroPedro, resposta: valores }));
  assert.doesNotMatch(h.lastSent(), /Só para conferir/);
  assert.match(h.lastSent(), /Os valores para 2027/);
  assert.match(h.state.aiPayload.messages[0].content, /INTERESSE JÁ ANOTADO: .*Pedro Costa França \(1º ano\)/);
  await h.send('Sim', triagem({ cadastro: cadastroPedro, resposta: 'Que bom! Qual dia fica melhor para a visita?' }));
  assert.doesNotMatch(h.lastSent(), /Só para conferir|já estava anotado/);
  assert.equal(h.state.sent.filter(m => /Só para conferir/.test(m.message)).length, 1);
});

test('"ok" e "obrigada" depois do interesse anotado recebem resposta curta, sem o resumo (caso Vanessa)', async () => {
  const h = harness();
  await h.send('tarde', triagem({ cadastro: cadastroPedro }));
  await h.send('Sim', triagem({ cadastro: cadastroPedro }));
  await h.send('Ok', triagem({ cadastro: cadastroPedro }));
  assert.doesNotMatch(h.lastSent(), /Só para conferir/);
  assert.match(h.lastSent(), /Por nada/);
});

test('se a IA insistir no resumo de um interesse já gravado, a mensagem é trocada', async () => {
  const h = harness();
  await h.send('tarde', triagem({ cadastro: cadastroPedro }));
  await h.send('Sim', triagem({ cadastro: cadastroPedro }));
  await h.send('Eu posso ir em qualquer horário?', triagem({ cadastro: cadastroPedro, resposta: 'Só para conferir antes de anotar o interesse de vocês: ... Está tudo certinho?' }));
  assert.doesNotMatch(h.lastSent(), /Só para conferir/);
  assert.match(h.lastSent(), /já está anotado/);
});

test('"corrigir" depois do resumo pergunta o que ajustar em vez de repetir o resumo (caso Cristina)', async () => {
  const h = harness();
  await h.send('tarde', triagem({ cadastro: cadastroPedro }));
  await h.send('corrigir', triagem({ cadastro: cadastroPedro }));
  assert.match(h.lastSent(), /O que precisa ajustar/);
  assert.equal(h.state.rows.enrollment_opportunities.length, 0);
});

test('outro aluno da mesma família ainda recebe resumo para conferência', async () => {
  const h = harness();
  await h.send('tarde', triagem({ cadastro: cadastroPedro }));
  await h.send('Sim', triagem({ cadastro: cadastroPedro }));
  await h.send('Tenho outra filha, Ana Clara, para o Maternal', triagem({ cadastro: { ...cadastroPedro, aluno: 'Ana Clara França', serie: 'Maternal' } }));
  assert.match(h.lastSent(), /Só para conferir[\s\S]*Ana Clara França/);
});

test('pedido de visita em mensagem com quebra de linha não se perde (caso Beatriz)', async () => {
  const h = harness();
  const semVisita = c => triagem({ cadastro: c });
  await h.send('Bom dia! \nComo eu faço para agendar visita. Quero colocar meu filho na escola ano que vem.', triagem({ visita: { solicitada: true, data: null, horario: null } }));
  await h.send('Beatriz Nayara de Oliveira Farias', semVisita({ responsavel: 'Beatriz Nayara de Oliveira Farias', aluno: null, ano: 2027, serie: null, turno: null }));
  await h.send('João Benício', semVisita({ responsavel: 'Beatriz Nayara de Oliveira Farias', aluno: 'João Benício', ano: 2027, serie: null, turno: null }));
  await h.send('Maternal', semVisita({ responsavel: 'Beatriz Nayara de Oliveira Farias', aluno: 'João Benício', ano: 2027, serie: 'Maternal', turno: null }));
  assert.doesNotMatch(h.lastSent(), /Só para conferir/);
  assert.equal(h.state.rows.enrollment_opportunities.length, 1);
  assert.match(h.lastSent(), /Qual dia fica melhor/);
});

test('"Posso agendar" + dia e horário com "hs" agenda a visita (caso Vanessa)', async () => {
  const h = harness();
  const cad = { responsavel: 'Vanessa Oliveira', aluno: 'Vitor Oliveira', ano: 2027, serie: 'Maternal', turno: 'tarde' };
  await h.send('Posso agendar', triagem({ visita: { solicitada: true, data: null, horario: null }, cadastro: cad }));
  assert.equal(h.state.rows.enrollment_opportunities.length, 1);
  assert.match(h.lastSent(), /Qual dia fica melhor/);
  await h.send(`Pode ser dia ${quartaBr} às 15 hs`, triagem({ visita: { solicitada: true, data: null, horario: null }, cadastro: cad }));
  assert.equal(h.state.rows.school_visits.length, 1);
  assert.equal(new Date(h.state.rows.school_visits[0].scheduled_at).toISOString(), new Date(quartaIso + 'T15:00:00-03:00').toISOString());
  assert.match(h.lastSent(), /está agendada para/);
});

test('família responde dia e horário à pergunta da Ana sobre a visita e a visita é agendada (caso Cristina)', async () => {
  const h = harness();
  const cad = { responsavel: 'Cristina Franciane Souto Brito', aluno: 'Miguel Brito Souto', ano: 2027, serie: 'Maternal', turno: null };
  h.inbound('gostaria de conhecer a estrutura da escola');
  h.ana('Será um prazer receber você para conhecer a escola! Qual a idade da criança?');
  h.inbound('4 anos');
  h.ana('Que ótimo! Para agendar a visita, qual dia e horário você prefere? As visitas são de segunda a sexta, das 8h às 18h.');
  h.inbound('primeira vez na escola');
  h.ana('Que bom que vocês pensam no COC para essa nova etapa! Para agendar a visita, qual dia e horário você prefere?');
  await h.send(`dia ${quartaBr} as 17h`, triagem({ visita: { solicitada: true, data: null, horario: null }, cadastro: cad }));
  assert.doesNotMatch(h.lastSent(), /Só para conferir/);
  assert.equal(h.state.rows.school_visits.length, 1);
  assert.equal(new Date(h.state.rows.school_visits[0].scheduled_at).toISOString(), new Date(quartaIso + 'T17:00:00-03:00').toISOString());
});

test('convite genérico para visita na resposta de valores não força agendamento', async () => {
  const h = harness();
  h.ana('Os valores para 2027 serão divulgados a partir de 1º de novembro de 2026. Se você quiser, será um prazer receber sua família para uma visita! Posso anotar seu interesse para entrarmos em contato quando os valores forem divulgados?');
  await h.send('Sim', triagem({ visita: { solicitada: true, data: null, horario: null }, cadastro: cadastroPedro }));
  assert.match(h.lastSent(), /Só para conferir/);
  assert.equal(h.state.rows.school_visits.length, 0);
});

test('mensagens seguidas: só a mais recente responde (caso "Posso agendar" + "?")', async () => {
  const h = harness();
  h.state.onAi = () => { h.state.onAi = null; h.inbound('?'); };
  const r = await h.send('Posso agendar', triagem({ resposta: 'Claro! Qual dia?' }));
  assert.equal(r.skipped, 'newer_inbound_will_answer');
  assert.equal(h.state.sent.length, 0);
});

test('agradecimento enviado em seguida não cala a resposta da pergunta anterior', async () => {
  const h = harness();
  h.state.ai = triagem({ assunto: 'localizacao', cadastro_interesse: false, resposta: 'Estamos na BR-156, Zona Norte.' });
  h.state.onAi = () => { h.state.onAi = null; h.inbound('Obrigada'); };
  const r = await h.send('Qual o endereço?');
  assert.notEqual(r.skipped, 'newer_inbound_will_answer');
  assert.match(h.lastSent(), /BR-156/);
});

test('horários escritos de vários jeitos são entendidos; "dia 15 hoje" não é horário', () => {
  const { context } = harness();
  const t = s => context.extractExplicitVisitFacts(s).time;
  assert.equal(t('amanhã às 15 hs'), '15:00');
  assert.equal(t('pode ser 16h30'), '16:30');
  assert.equal(t('às 15:30'), '15:30');
  assert.equal(t('9hrs'), '09:00');
  assert.equal(t('as 4 horas da tarde'), '16:00');
  assert.equal(t('dia 15 hoje'), null);
  assert.equal(t('meu filho tem 2 anos'), null);
});

// ---- Checagem da série pela idade (tabela oficial do COC) ----
const TABELA_COC = 'Maternal 2=2; Maternal 3=3; 1º Período=4; 2º Período=5; 1º ano=6; 2º ano=7; 3º ano=8; 4º ano=9; 5º ano=10; 6º ano=11; 7º ano=12; 8º ano=13; 9º ano=14; 1ª série=15; 2ª série=16; 3ª série=17';
function coc() {
  const h = harness();
  h.state.rows.system_settings.push({ key: 'escola_series_idades', value: TABELA_COC });
  return h;
}
const cad = (serie, extra = {}) => triagem({ cadastro: { responsavel: 'Vivian Renata da Silva França', aluno: 'Pedro Costa França', ano: 2027, serie, turno: null, idade: null, ...extra } });

test('"1º ano" sem segmento: Ana pergunta a idade; 15 anos vira 1ª série do Ensino Médio', async () => {
  const h = coc();
  await h.send('1º ano', cad('1º ano'));
  assert.match(h.lastSent(), /qual é a idade de Pedro\?.*1º ano do Ensino Fundamental ou a 1ª série do Ensino Médio/);
  assert.equal(h.state.sent.filter(m => /Só para conferir/.test(m.message)).length, 0);
  await h.send('15', cad('1º ano'));
  assert.match(h.lastSent(), /Idade: 15 anos\nAno letivo: 2027\nSérie: 1ª série do Ensino Médio/);
  assert.doesNotMatch(h.lastSent(), /Obs\./);
  await h.send('Sim', cad('1º ano'));
  assert.equal(h.state.rows.enrollment_opportunities[0].desired_grade, '1ª série');
  assert.match(h.state.rows.students[0].notes, /Idade informada pela família em .*: 15 anos/);
});

test('"1º ano" com 6 anos é 1º ano do Ensino Fundamental, sem pergunta extra', async () => {
  const h = coc();
  await h.send('1º ano, ele tem 6 anos', cad('1º ano'));
  assert.match(h.lastSent(), /Idade: 6 anos\nAno letivo: 2027\nSérie: 1º ano do Ensino Fundamental/);
  assert.doesNotMatch(h.lastSent(), /Obs\./);
});

test('idade intermediária (11 anos) faz a Ana perguntar o segmento', async () => {
  const h = coc();
  await h.send('2º ano', cad('2º ano'));
  await h.send('11 anos', cad('2º ano'));
  assert.match(h.lastSent(), /é o 2º ano do Ensino Fundamental ou a 2ª série do Ensino Médio\?/);
  await h.send('Fundamental', cad('2º ano'));
  assert.match(h.lastSent(), /Série: 2º ano do Ensino Fundamental/);
  assert.match(h.lastSent(), /Obs\.: pela idade informada, a série mais comum seria 6º ano do Ensino Fundamental ou 7º ano do Ensino Fundamental\./);
});

test('pai disse "Fundamental": não pergunta idade nem converte', async () => {
  const h = coc();
  await h.send('3º ano do fundamental', cad('3º ano'));
  assert.match(h.lastSent(), /Série: 3º ano do Ensino Fundamental/);
});

test('série e idade que não combinam: resumo avisa e o SIM ainda grava', async () => {
  const h = coc();
  await h.send('1ª série do ensino médio, ele tem 6 anos', cad('1ª série'));
  assert.match(h.lastSent(), /Série: 1ª série do Ensino Médio/);
  assert.match(h.lastSent(), /Obs\.: pela idade informada, a série mais comum seria 1º ano do Ensino Fundamental ou 2º ano do Ensino Fundamental\./);
  await h.send('Sim', cad('1ª série'));
  assert.equal(h.state.rows.enrollment_opportunities.length, 1);
  assert.equal(h.state.rows.enrollment_opportunities[0].desired_grade, '1ª série');
});

test('Maternal sem número: com 2 anos pergunta Maternal 2 ou 3; com 3 anos já define', async () => {
  const h = coc();
  await h.send('Maternal, ele tem 2 anos', cad('Maternal'));
  assert.match(h.lastSent(), /é o Maternal 2 ou o Maternal 3\?/);
  await h.send('Maternal 3', cad('Maternal'));
  assert.match(h.lastSent(), /Série: Maternal 3\n/);
  const h2 = coc();
  await h2.send('Maternal, ela tem 3 anos', cad('Maternal'));
  assert.match(h2.lastSent(), /Série: Maternal 3\n/);
});

test('"primeiro período" e "1º período" usam o nome da escola', async () => {
  const h = coc();
  await h.send('primeiro período, ela tem 4 anos', cad('primeiro período'));
  assert.match(h.lastSent(), /Série: 1º Período\n/);
  assert.doesNotMatch(h.lastSent(), /Obs\./);
  const h2 = coc();
  await h2.send('2º período', cad('2º Período'));
  assert.match(h2.lastSent(), /Série: 2º Período\n/);
});

test('idade só conta quando é idade: "uns 2 anos atrás" e "1 ano" são ignorados', () => {
  const { context } = harness();
  assert.equal(context.extractAge('nosso filho já estudou aí a uns 2 anos atrás'), null);
  assert.equal(context.extractAge('quero o 1 ano'), null);
  assert.equal(context.extractAge('ele tem 6 anos'), 6);
  assert.equal(context.extractAge('minha filha de 15 anos'), 15);
});
