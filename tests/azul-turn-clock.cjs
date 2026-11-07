const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8776', '--directory', process.cwd()], { stdio: 'ignore' });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      window.__vibrations = [];
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { window.__vibrations.push(pattern); return true; } });
    });
    await page.goto('http://127.0.0.1:8776/games/azul/index.html?fresh=1');
    await page.locator('[data-new="4"]').click();
    assert.match(await page.locator('#timer').innerText(), /01:00/, 'each turn should start with one minute');
    assert.doesNotMatch(await page.locator('#timer').innerText(), /⌛/, 'the digital countdown should not include an hourglass');
    assert.ok(await page.locator('.player-area').evaluate(e => e.classList.contains('azul-my-turn')), 'the player board should be marked active for their turn');
    assert.equal(await page.locator('.player-area').evaluate(e => getComputedStyle(e, '::after').animationName), 'azul-turn-border-sweep', 'the active board should have a rotating red frame');
    const frameSizes = await page.evaluate(() => ['#azul-back', '#timer'].map(selector => { const r=document.querySelector(selector).getBoundingClientRect(); return [r.width,r.height,getComputedStyle(document.querySelector(selector)).borderRadius]; }));
    assert.deepEqual(frameSizes[0].slice(0,2), frameSizes[1].slice(0,2), 'the timer and back control should be equally sized circles');
    assert.match(frameSizes[1][2], /50%/, 'the timer should use the same circular frame shape as the back control');
    assert.ok(await page.locator('#wall .wall-cell').first().evaluate(e => e.getBoundingClientRect().width <= 18.5), 'small-screen board tiles should be reduced for iPhone-sized screens');
    const ghostStyle = await page.locator('#wall .wall-cell.empty').first().evaluate(e => { const c=getComputedStyle(e, '::after'); return {size:c.backgroundSize,opacity:Number(c.opacity)}; });
    assert.equal(ghostStyle.size, '100% 100%', 'faded wall tile art should exactly fill each cell');
    assert.ok(ghostStyle.opacity >= 0.35, 'faded wall tiles should remain clearly visible');
    assert.ok(await page.evaluate(() => window.__vibrations.length > 0), 'the active player turn should vibrate the phone');
    assert.equal(await page.locator('#azul-back').evaluate(e => getComputedStyle(e, '::after').content), '"←"', 'back control should use a clear back arrow glyph');

    for (const viewport of [{width:320,height:640},{width:360,height:740},{width:390,height:844},{width:430,height:932}]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const rect=e=>e.getBoundingClientRect(),factories=[...document.querySelectorAll('.factory')].map(rect),tiles=[...document.querySelectorAll('.factory .tile')].map(rect),opponents=rect(document.querySelector('.opponents')),player=rect(document.querySelector('.player-area')),pattern=rect(document.querySelector('#patterns')),wall=rect(document.querySelector('#wall'));
        const circleOverlap=factories.some((a,i)=>factories.some((b,j)=>{if(i>=j)return false;return Math.hypot((a.left+a.right-b.left-b.right)/2,(a.top+a.bottom-b.top-b.bottom)/2)<(a.width+b.width)/2-1}));
        const tileOverlap=tiles.some((a,i)=>tiles.some((b,j)=>i<j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
        return {scroll:document.documentElement.scrollWidth!==innerWidth||document.documentElement.scrollHeight!==innerHeight,circleOverlap,tileOverlap,topClear:[0,2,3].every(i=>factories[i].top>=opponents.bottom-1),bottomClear:[4,7].every(i=>factories[i].bottom<=player.top+1),boardInside:pattern.left>=player.left&&wall.right<=player.right&&pattern.top>=player.top&&wall.bottom<=player.bottom};
      });
      assert.deepEqual(geometry,{scroll:false,circleOverlap:false,tileOverlap:false,topClear:true,bottomClear:true,boardInside:true},`iPhone layout should stay clear at ${viewport.width}×${viewport.height}`);
    }
    await page.setViewportSize({width:390,height:844});

    await page.locator('[data-source]:not([disabled])').first().click();
    await page.locator('.pattern-row.available').first().click();
    while ((await page.locator('#instruction').innerText()).includes('باقی‌مانده')) await page.locator('.pattern-row.available').first().click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem('mahbang-azul-light-v4'));
      return state.turn === 0 && state.last.startsWith('رایانه');
    }, undefined, { timeout: 5000 });
    assert.match(await page.locator('#timer').innerText(), /01:00|00:59/, 'the one-minute clock should reset when the turn returns after the CPU move');
    assert.ok(await page.evaluate(() => window.__vibrations.length > 1), 'the phone should vibrate again when the player gets another turn');

    const before = await page.evaluate(() => {
      const key = 'mahbang-azul-light-v4';
      const state = JSON.parse(localStorage.getItem(key));
      state.turn = 0;
      state.timeoutPending = false;
      state.pending = null;
      state.turnDeadline = Date.now() - 1000;
      localStorage.setItem(key, JSON.stringify(state));
      return JSON.stringify({ lines: state.players[0].lines, floor: state.players[0].floor, wall: state.players[0].wall, score: state.players[0].score });
    });
    await page.goto('http://127.0.0.1:8776/games/azul/index.html?resume=1');
    await page.locator('[data-resume]').click();
    await page.waitForFunction(initial => {
      const state = JSON.parse(localStorage.getItem('mahbang-azul-light-v4'));
      const now = JSON.stringify({ lines: state.players[0].lines, floor: state.players[0].floor, wall: state.players[0].wall, score: state.players[0].score });
      return now !== initial;
    }, before, { timeout: 5000 });
    assert.ok(await page.locator('#modal').evaluate(e => e.classList.contains('hide')), 'timeout takeover should happen without a blocking confirmation modal');
    assert.doesNotMatch(await page.locator('#timer').innerText(), /02:30/, 'a whole-game 2:30 timer must not be shown');

    await page.evaluate(() => {
      const key='mahbang-azul-light-v4',state=JSON.parse(localStorage.getItem(key));
      state.turn=0;state.turnDeadline=Date.now()+60000;state.players[1].lines=[[0],[1,1],[2,2,2],[3,3,3,3],[4,4,4,4,4]];
      localStorage.setItem(key,JSON.stringify(state));
    });
    await page.goto('http://127.0.0.1:8776/games/azul/index.html?resume=1');
    await page.locator('[data-resume]').click();
    await page.waitForFunction(() => document.querySelector('.opponent .mini-slot.filled') !== null, undefined, { timeout: 3000 });
    assert.equal(await page.locator('.opponent').first().locator('.mini-slot.filled').count(), 15, 'all of the opponent’s stacked pattern tiles should be rendered');
    const visiblePlaced = await page.locator('.opponent').first().locator('.mini-slot.filled').evaluateAll(es => es.every(e => getComputedStyle(e).backgroundImage.includes('tile-')));
    assert.ok(visiblePlaced, 'rivals’ placed triangular tiles should display instead of the faded empty-slot texture');
    console.log('Azul one-minute turn timer, timeout takeover, vibration, and back icon: PASS');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
