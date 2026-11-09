const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
(async()=>{
 const port=8784,server=spawn('python3',['-m','http.server',String(port)],{cwd:process.cwd(),stdio:'ignore'});await new Promise(r=>setTimeout(r,250));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?hub=1`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('[data-hg="hell"]').click({timeout:4000});
  await page.locator('#mini [data-mg="mk"]').waitFor();
  assert.ok(await page.locator('#mgCode').count(),'Hell Escape room menu exposes the shared five-digit join field');
  assert.ok(await page.locator('#mini [data-mg="ai"]').count(),'offline AI remains available from the shared room menu');
  await page.locator('#mini [data-mg="ai"]').click();
  const frameEl=page.locator('#hellEscapeOverlay iframe');await frameEl.waitFor({timeout:5000});
  const frame=page.frameLocator('#hellEscapeOverlay iframe');
  assert.equal(await frame.locator('.setup-title h1').innerText(),'فرار از جهنم','hub opens the standalone game iframe');
  await frame.locator('[data-count="2"]').click();await frame.locator('[data-start]').click();
  const src=await frame.locator('#myAvatar').getAttribute('src');assert.ok(src&&src.length>20,'the host profile avatar is passed into the game');
  await frame.locator('body').evaluate(()=>parent.postMessage({type:'hell:report',result:'w',report:{id:'hell',gid:'hub-test',g:'فرار از جهنم',t:Date.now(),dur:100,n:2,names:['تو','رایانه'],ai:[false,true],res:0,rows:[],sum:[]}},location.origin));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mb_hist')||'[]').some(x=>x.g==='فرار از جهنم'));
  await frame.locator('body').evaluate(()=>parent.postMessage({type:'hell:back'},location.origin));
  await page.locator('#hellEscapeOverlay').waitFor({state:'detached'});
  assert.deepEqual(errors,[],'no parent or iframe runtime errors');
  console.log('hell escape hub: launch, avatar bridge, history and return passed');
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
