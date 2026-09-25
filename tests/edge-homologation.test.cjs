const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(options = {}) {
  const writes = [], requests = [];
  const env = { SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-internal', OPENAI_API_KEY: 'test-ai', ZAPI_INSTANCE_ID:'test',ZAPI_TOKEN:'test',ZAPI_CLIENT_TOKEN:'test' };
  let handler;
  const lead = { id:'test-lead',name:'Responsável Teste',phone:'00000000000',triage_status:options.handoff?'aguardando_secretaria':'novo',handoff_at:new Date().toISOString() };
  function query(table) {
    let action='select', payload, single=false; const filters=[];
    const q = new Proxy({}, {get(_, method) {
      if(method==='then') return (resolve,reject)=>Promise.resolve().then(()=> {
        if(action!=='select') { writes.push({table,action,payload}); return {data:single?{id:'test-lead'}:[{id:'test-lead'}],error:null}; }
        if(options.query) {const custom=options.query(table,filters);if(custom) return custom;}
        let data=[];
        if(table==='system_settings') data=options.disabled?[]:[{key:'escola_agente_ativo',value:'true'},{key:'escola_nome',value:'Escola Teste'},{key:'escola_info',value:'Atendimento de segunda a sexta.'}];
        if(table==='leads') data=single?lead:[lead];
        if(table==='user_roles') data=options.member===false?[]:[{role:'user'}];
        if(table==='whatsapp_messages') data=options.messages||[];
        if(single&&Array.isArray(data)) data=data[0]||null;
        return {data,error:null};
      }).then(resolve,reject);
      return (...args)=> {if(['insert','update','upsert','delete'].includes(method)){action=method;payload=args[0];} if(['single','maybeSingle'].includes(method))single=true; filters.push([method,...args]);return q;};
    }});return q;
  }
  const client={from:query,auth:{getUser:async()=>({data:{user:options.invalidAuth?null:{id:'test-user'}},error:null})},rpc:async(name)=>({data:name==='verify_school_triage_secret'?true:options.unknown?[]:['test-lead'],error:null})};
  const ai={assunto:'matricula',interesse:'medio',precisa_humano:!!options.needsHuman,motivo_humano:null,resumo:'Interesse',resposta:options.emptyAnswer?'':'Qual a série desejada?',nome_extraido:null};
  const fetch=async(url,init)=> {requests.push({url:String(url),body:init?.body});if(String(url).includes('api.openai')){if(options.aiThrows)throw new Error('timeout');return new Response(JSON.stringify(options.aiError?{error:'unavailable'}:{choices:[{message:{content:JSON.stringify(ai)}}]}),{status:options.aiError?503:200});}return new Response(JSON.stringify({success:true,messageId:'test-message'}),{status:options.sendError?502:200});};
  const cache=new Map();
  function load(filename) {
    filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const requireMock=(spec)=>spec.includes('/http/server.ts')?{serve:fn=>{handler=fn;}}:spec.includes('@supabase/supabase-js')?{createClient:()=>client}:spec.startsWith('.')?load(path.resolve(path.dirname(filename),spec)):require(spec);
    vm.runInNewContext(code,{module,exports:module.exports,require:requireMock,Deno:{env:{get:k=>env[k]}},fetch,Request,Response,Headers,AbortSignal,URL,crypto:globalThis.crypto,console:{log(){},warn(){},error(){}},setTimeout,clearTimeout},{filename});
    return module.exports;
  }
  load(path.join(__dirname,'../supabase/functions',options.function||'school-triage','index.ts'));
  return {writes,requests,call:body=>handler(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(options.function?(options.token?{Authorization:`Bearer ${options.token}`}:{ }):{'x-school-triage-secret':'test-secret'})},body:JSON.stringify({phone:'00000000000',text:'Olá',...body})}))};
}
for(const [label,options,body] of [
 ['new contact',{unknown:true},{action:'preview'}],
 ['failed audio',{}, {action:'preview',text:'[Áudio não transcrito]'}],
 ['conversation closure',{handoff:true},{action:'preview',text:'Somente isso.'}],
 ['AI error',{aiError:true},{action:'preview'}],
 ['empty AI answer',{emptyAnswer:true},{action:'preview'}],
]) test(`preview never writes or sends: ${label}`,async()=>{const h=harness(options);await h.call(body);assert.equal(h.writes.length,0);assert.ok(h.requests.every(r=>r.url.includes('api.openai')));});
test('disabled agent prevents followup processing',async()=>{const h=harness({disabled:true});const r=await h.call({action:'process_followups'});assert.equal((await r.json()).skipped,'agent_disabled');assert.equal(h.requests.length,0);assert.equal(h.writes.length,0);});
test('disabled agent prevents triage',async()=>{const h=harness({disabled:true});const r=await h.call({});assert.equal((await r.json()).skipped,'agent_disabled');assert.equal(h.requests.length,0);});
for(const label of ['emptyAnswer','aiThrows','sendError'])test(`${label} routes to secretary`,async()=>{const h=harness({[label]:true});await h.call({});assert.ok(h.writes.some(w=>w.table==='leads'&&w.payload.triage_status==='aguardando_secretaria'&&w.payload.resolved_at===null));});
test('human pause survives a later automatic outbound',async()=>{const h=harness({messages:[{message:'Ana',raw_data:{sender_type:'ana'},created_at:new Date().toISOString()},{message:'Humano',raw_data:{sender_type:'human'},created_at:new Date(Date.now()-60000).toISOString()}]});const r=await h.call({});assert.equal((await r.json()).skipped,'human_conversation_active');assert.equal(h.requests.length,0);});
test('normal triage sends and updates only after confirmed send',async()=>{const h=harness();const r=await h.call({});const body=await r.json();assert.equal(body.enviado,true);assert.equal(body.triage_status,'respondido_agente');});
for(const functionName of ['send-whatsapp-message','send-email'])for(const [label,extra,expected] of [['missing token',{},401],['invalid token',{token:'bad',invalidAuth:true},401],['unregistered user',{token:'user',member:false},403]])test(`${functionName}: ${label}`,async()=>{const h=harness({function:functionName,...extra});const r=await h.call({message:'Teste'});assert.equal(r.status,expected);assert.equal(h.requests.length,0);assert.equal(h.writes.length,0);});
test('operator cannot forge Ana sender identity',async()=>{const h=harness({function:'send-whatsapp-message',token:'user'});const r=await h.call({message:'Teste',senderType:'ana'});assert.equal(r.status,200);assert.ok(h.writes.some(w=>w.table==='whatsapp_messages'&&w.payload.raw_data.sender_type==='human'));});

test('broad enrollment question does not create premature handoff',async()=>{const h=harness({needsHuman:true});const r=await h.call({action:'preview',text:'Quero saber mais sobre a escola para matricular meu filho.'});const body=await r.json();assert.equal(body.precisa_humano,false);assert.match(body.resposta,/série e turno/);});
