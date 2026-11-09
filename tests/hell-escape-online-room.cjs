const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}

(async()=>{
 const {run}=await import('../supabase/functions/hell/hell_core.mjs');
 const port=8785,server=spawn('python3',['-m','http.server',String(port)],{cwd:process.cwd(),stdio:'ignore'});await new Promise(r=>setTimeout(r,250));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 let room=null;
 function ctxFor(token){return {code:room.code,n:room.n,host:room.host===token,seat:room.seats.find(s=>s.token===token)?.seat,status:room.status,ver:room.ver,st:room.st,seats:room.seats.map(s=>({seat:s.seat,account:s.token,name:s.name,av:s.av,age:Date.now()-s.seen,gone:s.gone}))};}
 async function rpc(fn,a){const token=a.p_token;
  if(fn==='mb_me')return {bal:1000,daily:false};if(fn==='mb_hub')return {gems:0,lv:1};if(fn==='mb_hist_get')return [];
  if(fn==='hell_create'){room={code:'54321',n:a.p_n,host:token,status:'wait',ver:0,st:null,views:{},seats:[{seat:0,token,name:a.p_name,av:a.p_av,seen:Date.now(),gone:false}]};return {ok:true,code:room.code,seat:0};}
  if(fn==='hell_join'){if(!room||room.code!==a.p_code)return {ok:false,why:'closed'};let q=room.seats.find(s=>s.token===token);if(!q){if(room.status!=='wait')return {ok:false,why:'started'};let seat=0;while(room.seats.some(s=>s.seat===seat))seat++;if(seat>=room.n)return {ok:false,why:'full'};q={seat,token,name:a.p_name,av:a.p_av,seen:Date.now(),gone:false};room.seats.push(q);}q.seen=Date.now();q.gone=false;return {ok:true,seat:q.seat};}
  if(fn==='hell_setn'){if(room.host!==token||room.status!=='wait')return {ok:false};room.n=a.p_n;room.ver++;return {ok:true};}
  if(fn==='hell_leave'){const q=room?.seats.find(s=>s.token===token);if(q){if(room.status==='wait'&&q.seat===0)room.status='closed';else q.gone=true;}return {ok:true};}
  if(fn==='hell_poll'){const q=room?.seats.find(s=>s.token===token);if(!q)return {ok:false,why:'not seated'};q.seen=Date.now();return {ok:true,status:room.status,ver:room.ver,n:room.n,you:q.seat,host:room.host===token,seats:room.seats.map(s=>({seat:s.seat,name:s.name,av:s.av,on:true,gone:s.gone})),now:Date.now(),view:room.status==='play'||room.status==='done'?(a.p_ver==null||a.p_ver!==room.ver?room.views[q.seat]:null):null,why:room.why};}
  if(fn==='hell_ctx'){const q=room?.seats.find(s=>s.token===token);if(!q)return {ok:false,why:'not seated'};return {ok:true,a:token,seat:q.seat,status:room.status,ver:room.ver,n:room.n,host:room.host===token,st:room.st,seats:room.seats.map(s=>({seat:s.seat,account:s.token,name:s.name,av:s.av,age:Date.now()-s.seen,gone:s.gone}))};}
  if(fn==='hell_save'){if(a.p_ver!==room.ver)return false;room.st=a.p_st;room.views=a.p_views;room.status=a.p_status;room.ver++;return true;}
  if(fn==='hell_done'){room.status='done';return null;}
  return null;
 }
 async function edge(body){const token=body.token;if(!room||body.code!==room.code)return {ok:false,why:'closed'};for(let i=0;i<4;i++){const c=ctxFor(token);if(body.op!=='start'&&c.status!=='play')return {ok:true,status:c.status};const r=run(body.op,body.m,c,Date.now());if(!r.ok&&!r.changed)return {ok:false,why:r.why};if(r.changed){if(c.ver!==room.ver)continue;room.st=r.st;room.views=r.views;room.status=r.status;room.ver++;if(r.res)room.status='done';return {ok:r.ok,status:room.status,ver:room.ver,view:r.mine};}return {ok:true,status:r.status,ver:room.ver,view:r.mine};}return {ok:false,why:'busy'};}
 async function setupPage(token,name){const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(({token,name})=>{localStorage.setItem('mb_acc',JSON.stringify({token,name}));localStorage.setItem('mb_av','2');window.Peer={};}, {token,name});
  await context.route('**/rest/v1/rpc/**',async route=>{const fn=new URL(route.request().url()).pathname.split('/').pop();let x={};try{x=await rpc(fn,route.request().postDataJSON()||{});}catch(e){x={ok:false,why:String(e)};}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});});
  await context.route('**/functions/v1/hell',async route=>{let x={};try{x=await edge(route.request().postDataJSON()||{});}catch(e){x={ok:false,why:String(e)};}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/index.html?hub=1`,{waitUntil:'domcontentloaded'});return {context,page,errors};}
 try{
  const host=await setupPage('H'.repeat(48),'ابراهیم'),guest=await setupPage('G'.repeat(48),'مهمان');
  await host.page.locator('[data-hg="hell"]').click();await host.page.locator('[data-pn="2"]').click();await host.page.locator('#mini [data-mg="mk"]').click();
  await host.page.locator('.mg-code').waitFor({timeout:6000});
  await guest.page.locator('[data-hg="hell"]').click();await guest.page.locator('#mgCode').fill('54321');await guest.page.locator('#mini [data-mg="join"]').click();
  await host.page.waitForFunction(()=>document.querySelectorAll('#mini .mg-p').length===2,{timeout:8000});
  await host.page.locator('#mini [data-mg="start"]').click();
  await host.page.locator('#hellEscapeOverlay iframe').waitFor({timeout:8000});await guest.page.locator('#hellEscapeOverlay iframe').waitFor({timeout:8000});
  const hf=host.page.frameLocator('#hellEscapeOverlay iframe'),gf=guest.page.frameLocator('#hellEscapeOverlay iframe');
  await hf.locator('#statusText').waitFor({timeout:5000});await gf.locator('#statusText').waitFor({timeout:5000});
  await hf.locator('[data-chip="100"]').click();await gf.locator('[data-chip="100"]').click();
  await hf.locator('[data-lock]').click();await gf.locator('[data-lock]').click();
  await hf.locator('.coal-token.available').first().waitFor({timeout:5000});
  await host.page.waitForFunction(()=>{const h=document.querySelector('#hellEscapeOverlay iframe');return h&&document.querySelector('#mini')&&!document.querySelector('#mini').hidden;},null,{timeout:5000});
  await guest.page.waitForFunction(()=>{const h=document.querySelector('#hellEscapeOverlay iframe');return h&&document.querySelector('#mini')&&!document.querySelector('#mini').hidden;},null,{timeout:5000});
  await host.page.waitForTimeout(1500);
  const canHost=await hf.locator('#seat-0.is-active').count(),canGuest=await gf.locator('#seat-0.is-active').count();
  assert.equal(canHost+canGuest,1,'the personalized views agree on one active turn');
  const activeFrame=canHost?hf:gf,otherFrame=canHost?gf:hf;
  assert.equal(await activeFrame.locator('[data-end-turn]').isDisabled(),true,'a player cannot skip before revealing a coal');
  await activeFrame.locator('.coal-token.available').first().click();
  await activeFrame.locator('#myPlayerReveals .coal-reveal-badge').waitFor({timeout:5000});
  await otherFrame.locator('.player-reveal-row .coal-reveal-badge').first().waitFor({timeout:5000});
  assert.deepEqual(host.errors,[]);assert.deepEqual(guest.errors,[]);
  console.log('Hell Escape online host/guest room, server-backed wagers, hidden bets and synchronized coal reveal: PASS');
  await host.context.close();await guest.context.close();
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
