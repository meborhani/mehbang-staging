const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
(async()=>{
 const port=8785,server=spawn('python3',['-m','http.server',String(port)],{cwd:process.cwd(),stdio:'ignore'});
 await new Promise(r=>setTimeout(r,250));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const offline=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await offline.addInitScript(()=>{const native=window.setTimeout;window.setTimeout=(fn,delay,...args)=>native(fn,Number(delay)===3000?3000:Math.min(Number(delay)||0,5),...args);});
  await offline.goto(`http://127.0.0.1:${port}/games/hell-escape/index.html`);
  await offline.locator('[data-count="2"]').click();await offline.locator('[data-start]').click();
  assert.equal(await offline.locator('[data-help]').count(),1,'the help icon sits in the game header');
  await offline.locator('[data-help]').click();
  assert.equal(await offline.locator('#helpModal[open]').count(),1,'the help icon opens the rules modal');
  assert.ok((await offline.locator('#helpModal').innerText()).includes('بیشترین برداشت امن'),'the rules explain that any player’s maximum safe haul qualifies a wager');
  assert.equal(await offline.locator('[data-start-tutorial]').isVisible(),true,'offline help offers the three-hand computer tutorial');
  await offline.evaluate(()=>localStorage.setItem('mb-hell-escape-save-v1','keep-this-save'));
  await offline.locator('[data-start-tutorial]').click();
  assert.equal(await offline.locator('#helpModal[open]').count(),0,'starting the tutorial closes the rules dialog');
  assert.equal(await offline.locator('#tutorialGuide').count(),0,'the persistent step-by-step guide card is removed');
  assert.ok((await offline.locator('#toast').innerText()).includes('دست ۱ از ۳'),'the temporary warning identifies tutorial hand one of three');
  assert.ok((await offline.locator('#toast').innerText()).includes('شرط'),'the first temporary step explains betting');
  assert.equal(await offline.evaluate(()=>localStorage.getItem('mb-hell-escape-save-v1')),'keep-this-save','training does not overwrite a regular saved game');
  for(let round=1;round<=3;round++){
   if(await offline.locator('body').getAttribute('data-phase')==='bet'){await offline.locator('[data-chip="10"]').click();await offline.locator('[data-lock]').click();}
   await offline.waitForFunction(()=>document.body.dataset.phase==='play'||document.body.dataset.phase==='settlement',{timeout:15000});
   if(await offline.locator('body').getAttribute('data-phase')==='play'){
    await offline.waitForFunction(()=>document.querySelector('#seat-0')?.classList.contains('is-active')||document.body.dataset.phase==='settlement',{timeout:15000});
    if(await offline.locator('#seat-0').evaluate(e=>e.classList.contains('is-active'))){await offline.locator('.coal-token.available').first().click();if(await offline.locator('#seat-0').evaluate(e=>e.classList.contains('is-active'))&&await offline.locator('#seat-0').evaluate(e=>e.querySelectorAll('[data-player-reveal]').length>0))await offline.locator('[data-end-turn]').click();}
   }
   await offline.waitForFunction(()=>document.body.dataset.phase==='settlement',{timeout:30000});
   if(await offline.locator('#pactModal').evaluate(e=>e.open))await offline.locator('[data-pact="no"]').click();
   await offline.waitForFunction(()=>!document.querySelector('[data-next]').disabled,{timeout:10000});
   assert.ok((await offline.locator('#toast').innerText()).includes('دست '+new Intl.NumberFormat('fa-IR').format(round)+' از ۳'),`temporary guidance identifies hand ${round}`);
   await offline.locator('[data-next]').click();
   if(round<3)await offline.waitForFunction(r=>document.querySelector('#toast').classList.contains('show')&&document.querySelector('#toast').innerText.includes('دست '+new Intl.NumberFormat('fa-IR').format(r)+' از ۳'),round+1);
  }
  assert.equal(await offline.locator('#tutorialDoneModal[open]').count(),1,'the three-hand tutorial ends with a completion dialog');
  const online=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await online.goto(`http://127.0.0.1:${port}/games/hell-escape/index.html?online=1`);
  await online.locator('[data-count="2"]').click();await online.locator('[data-start]').click();await online.locator('[data-help]').click();
  assert.equal(await online.locator('[data-start-tutorial]').isVisible(),false,'online sessions retain the rules but hide the training-game button');
  console.log('hell escape tutorial: help, offline-only launch, guided hand one and online restriction passed');
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1)});
