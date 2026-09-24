// Isolated UI regression: synthetic session/data; all backend requests are mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const errors=[];let sends=0;let role='admin';
 const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'operador@example.invalid',created_at:new Date().toISOString()};
 const lead={id:'00000000-0000-4000-8000-000000000002',name:'Família de teste',phone:'00000000000',email:null,triage_status:'aguardando_secretaria',triage_summary:'Dúvida de matrícula',assunto:'matricula',interesse:'alto',handoff_at:new Date().toISOString(),last_inbound_message_at:new Date().toISOString(),created_at:new Date().toISOString()};
 await context.route('https://test-project.supabase.co/**',async route=>{
  const url=new URL(route.request().url());let data=[];
  if(url.pathname.includes('/auth/v1/'))data={user};
  else if(url.pathname.endsWith('/user_roles'))data=[{role}];
  else if(url.pathname.endsWith('/leads'))data=[lead];
  else if(url.pathname.endsWith('/whatsapp_messages'))data=[{id:'message-test',direction:'inbound',message:'Olá, quero informações.',created_at:new Date().toISOString()}];
  else if(url.pathname.endsWith('/system_settings'))data=[{key:'escola_nome',value:'Escola de Teste'},{key:'escola_info',value:'Atendimento de segunda a sexta.'},{key:'escola_agente_ativo',value:'true'}];
  else if(url.pathname.endsWith('/send-whatsapp-message')){sends++;data={success:true};}
  else if(url.pathname.endsWith('/admin-manage-users'))data={users:[]};
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
 });
 await context.addInitScript(({user})=>localStorage.setItem('sb-test-project-auth-token',JSON.stringify({access_token:'test-session-only',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const path of ['/captacao','/familias','/matriculas','/visitas','/tarefas-captacao','/origem-conversao','/possibilidades','/inbox','/atendimentos','/configuracoes','/usuarios']){
  await page.goto('http://127.0.0.1:4173'+path);await page.waitForLoadState('networkidle');
  assert.ok((await page.locator('body').innerText()).length>100,path+' blank');
  assert.ok(!page.url().includes('/auth'),path+' redirected');
  console.log('PASS route',path);
 }
 await page.goto('http://127.0.0.1:4173/atendimentos');await page.getByRole('button',{name:'Conversa',exact:true}).click();
 await page.getByText('Olá, quero informações.',{exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Resposta da Secretaria'}).fill('Resposta simulada, sem envio real.');
 await page.getByRole('button',{name:'Enviar pelo WhatsApp'}).click();
 await page.getByText('Mensagem enviada pela Secretaria',{exact:true}).waitFor();assert.equal(sends,1);
 console.log('PASS conversation and mocked human reply');
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:4173/atendimentos');await page.waitForLoadState('networkidle');
 const width=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.page<=width.viewport+1,JSON.stringify(width));
 console.log('PASS mobile width');
 role='user';await page.goto('http://127.0.0.1:4173/configuracoes');await page.waitForLoadState('networkidle');assert.ok(!page.url().includes('/configuracoes'));console.log('PASS admin-only route');
 assert.deepEqual(errors,[]);console.log('PASS no uncaught browser errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
