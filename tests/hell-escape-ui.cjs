const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
(async()=>{
 const port=8783,server=spawn('python3',['-m','http.server',String(port)],{cwd:process.cwd(),stdio:'ignore'});
 await new Promise(r=>setTimeout(r,250));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const failed=[];page.on('requestfailed',r=>failed.push(r.url()));
  await page.goto(`http://127.0.0.1:${port}/games/hell-escape/index.html`);
  await page.locator('[data-count="2"]').click();
  await page.locator('[data-start]').click();
  await page.locator('[data-chip="200"]').click();
  await page.locator('[data-lock]').click();
  await page.waitForFunction(()=>document.body.dataset.phase==='play');
  assert.equal(await page.locator('.coal-token').count(),48,'all 48 coal tokens render as separate controls');
  assert.ok(await page.locator('#seat-0').evaluate(e=>e.classList.contains('is-active')),'human seat is visibly active at first after highest wager');
  assert.equal(await page.locator('.op-chips').count(),0,'opponent cards do not show wager chips over their bet text');
  assert.equal(await page.locator('#seat-0 .active-flames').count(),1,'the active seat has the flame border overlay');
  assert.ok(await page.locator('#seat-0 .active-flames').evaluate(e=>getComputedStyle(e,':before').backgroundImage.includes('flame.svg')),'turn highlight uses the flame asset');
  const first=page.locator('.coal-token:not(.is-revealed)').first();
  const before=await first.getAttribute('data-coal-id');
  await first.click();
  await page.waitForFunction(id=>document.querySelector(`[data-coal-id="${id}"]`).classList.contains('is-revealed'),before);
  await page.waitForFunction(()=>document.querySelector('#drawNotice').textContent.match(/زغال|شیطان/));
  assert.equal(await page.locator('#revealList .reveal-entry').count(),1,'the drawn piece is logged for both human and AI turns');
  await page.locator('[data-reveals]').click();
  assert.equal(await page.locator('#revealModal[open]').count(),1,'the reveal log can be opened on demand');
  await page.locator('#revealModal [data-close]').last().click();
  await page.locator('.summary-chip').click();
  assert.equal(await page.locator('#summaryModal[open]').count(),1,'game summary opens as a separate modal');
  await page.locator('#summaryModal [data-close]').last().click();
  await page.locator('[data-settings]').click();
  assert.equal(await page.locator('#settingsModal[open]').count(),1,'gear opens the settings modal');
  await page.locator('[data-vibration]').click();
  assert.equal(await page.locator('[data-vibration]').innerText(),'لرزش نوبت: خاموش','turn vibration can be switched off');
  await page.locator('#settingsModal [data-close]').last().click();
  if(await page.locator('#seat-0').evaluate(e=>e.classList.contains('is-active')))await page.locator('[data-end-turn]').click();
  const aiStart=await page.evaluate(()=>performance.now());
  await page.waitForFunction(()=>document.querySelectorAll('.coal-token.is-revealed').length>=2,{timeout:6500});
  await page.waitForFunction(()=>document.querySelector('#revealModal').open&&document.querySelectorAll('#revealList .reveal-entry').length>=2,{timeout:1500});
  assert.ok((await page.locator('#drawNotice').innerText()).includes('رها')||(await page.locator('#drawNotice').innerText()).includes('سارا')||(await page.locator('#drawNotice').innerText()).includes('کاوه'),'the latest CPU draw is announced with its player name');
  const aiDelay=await page.evaluate(start=>performance.now()-start,aiStart);
  assert.ok(aiDelay>=900&&aiDelay<=5600,`CPU should pause 1–5 seconds before revealing coal; got ${Math.round(aiDelay)}ms`);
  for(const width of [360,390,430]){
    await page.setViewportSize({width,height:844});
    const viewport=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,iw:innerWidth,ih:innerHeight}));
    assert.ok(viewport.sw<=viewport.iw+1&&viewport.sh<=viewport.ih+1,`no viewport overflow: ${JSON.stringify(viewport)}`);
  }
  assert.deepEqual(failed,[],'all UI and asset requests succeed');
  for(const count of [3,4]){
    const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await p.goto(`http://127.0.0.1:${port}/games/hell-escape/index.html`);
    await p.locator(`[data-count="${count}"]`).click();await p.locator('[data-start]').click();
    assert.equal(await p.locator('.opponent').count(),count-1,`${count}-player game shows exactly ${count-1} opponents`);
    assert.equal(await p.locator('.coal-token').count(),48,'48 coal choices remain visible in each player-count layout');
    const fit=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1);
    assert.ok(fit,`${count}-player portrait layout fits without scrolling`);await p.close();
  }
  assert.deepEqual(failed,[],'all UI and asset requests succeed');
  console.log('hell escape UI: 2–4 seats, lock, exact coal pick, CPU delay, summary and mobile fit passed');
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
