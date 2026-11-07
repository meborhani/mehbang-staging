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
      const nativeRandom = Math.random.bind(Math);
      Math.random = () => Number.isFinite(window.__azulRandomValue) ? window.__azulRandomValue : nativeRandom();
    });
    await page.goto('http://127.0.0.1:8776/games/azul/index.html?fresh=1');
    await page.evaluate(() => { window.__azulRandomValue = 0.01; });
    await page.locator('[data-new="4"]').click();
    assert.equal(await page.locator('#timer').innerText(), '۶۰', 'each turn should start at 60 seconds');
    assert.doesNotMatch(await page.locator('#timer').innerText(), /⌛/, 'the digital countdown should not include an hourglass');
    assert.ok(await page.locator('.player-area').evaluate(e => e.classList.contains('azul-my-turn')), 'the player board should be marked active for their turn');
    assert.equal(await page.locator('.player-area').evaluate(e => getComputedStyle(e, '::after').animationName), 'azul-gold-turn-orbit', 'the active board should have a rotating bright gold glow');
    assert.match(await page.locator('.player-area').evaluate(e => getComputedStyle(e, '::after').filter), /drop-shadow\(.*rgb\(255, 2\d\d, [1-2]\d\d\)/, 'the active turn glow should be clearly golden');
    assert.match(await page.locator('.player-area').evaluate(e => getComputedStyle(e).backgroundImage), /rgb\(255, 248, 233\)|rgb\(239, 224, 197\)/, 'the player board should retain its original cream background');
    assert.match(await page.locator('.opp-preview').first().evaluate(e => getComputedStyle(e).backgroundImage), /rgb\(255, 246, 229\)|rgb\(238, 224, 198\)/, 'rival boards should retain the original cream background');
    assert.match(await page.locator('.opponent').first().evaluate(e => getComputedStyle(e).backgroundImage), /rgb\(245, 234, 214\)|rgb\(241, 229, 208\)/, 'rival frames should restore their original navy and cream surface instead of seat colors');
    await page.locator('.opponent').first().evaluate(e => e.classList.add('active'));
    assert.equal(await page.locator('.opponent').first().evaluate(e => getComputedStyle(e,'::before').animationName), 'azul-gold-turn-orbit', 'the active opponent frame should use the same rotating gold glow');
    assert.equal(await page.locator('.opponent').first().evaluate(e => getComputedStyle(e,'::before').backgroundColor), 'rgba(0, 0, 0, 0)', 'the opponent turn halo must not paint over their avatar, score, or board');
    const frameSizes = await page.evaluate(() => ['#azul-back', '#timer'].map(selector => { const r=document.querySelector(selector).getBoundingClientRect(); return [r.width,r.height,getComputedStyle(document.querySelector(selector)).borderRadius]; }));
    assert.deepEqual(frameSizes[0].slice(0,2), frameSizes[1].slice(0,2), 'the timer and back control should be equally sized circles');
    assert.match(frameSizes[1][2], /50%/, 'the timer should use the same circular frame shape as the back control');
    assert.ok(await page.locator('#wall .wall-cell').first().evaluate(e => e.getBoundingClientRect().width >= 21), 'the local 5×5 wall should use the available width on an iPhone-sized screen');
    const floorGeometry = await page.evaluate(() => { const r=e=>e.getBoundingClientRect();const f=r(document.querySelector('#floor')),a=r(document.querySelector('.foot-actions')),p=r(document.querySelector('.player-area'));const o=document.querySelector('.opponent'),v=r(o.querySelector('.opp-preview')),of=r(o.querySelector('.opp-floor')),l=r(o.querySelector('.opp-lines')),w=r(o.querySelector('.opp-wall'));return {ownAtBottom:f.bottom<=f.top?false:f.top>=a.bottom-1&&f.bottom<=p.bottom+1,rivalAtBottom:of.top>=Math.max(l.bottom,w.bottom)-1&&v.bottom-of.bottom<4,rivalTileWidth:o.querySelector('.opp-wall .mini-cell').getBoundingClientRect().width}; });
    assert.ok(floorGeometry.ownAtBottom, 'the local penalty row should sit beneath the action strip at the bottom of the player board');
    assert.ok(floorGeometry.rivalAtBottom, 'each rival penalty row should sit below the boards at the bottom of the rival panel');
    assert.ok(floorGeometry.rivalTileWidth >= 9.5, 'rival walls and stepped rows should grow to use the available panel width');
    const ghostStyle = await page.locator('#wall .wall-cell.empty').first().evaluate(e => { const c=getComputedStyle(e, '::after'); return {size:c.backgroundSize,opacity:Number(c.opacity)}; });
    assert.equal(ghostStyle.size, '100% 100%', 'faded wall tile art should exactly fill each cell');
    assert.ok(ghostStyle.opacity >= 0.35, 'faded wall tiles should remain clearly visible');
    assert.ok(await page.evaluate(() => window.__vibrations.length > 0), 'the active player turn should vibrate the phone');
    assert.equal(await page.locator('#azul-back').evaluate(e => getComputedStyle(e, '::after').content), '"←"', 'back control should use a clear back arrow glyph');
    const factoryNumberStyle = await page.locator('.factory .fnum').first().evaluate(e => ({ image: getComputedStyle(e).backgroundImage, border: getComputedStyle(e).borderTopColor, radius: getComputedStyle(e).borderRadius, rect: e.getBoundingClientRect().toJSON(), factory: e.parentElement.getBoundingClientRect().toJSON() }));
    assert.ok(!factoryNumberStyle.image.includes('url('), 'factory numbers should not use a baked image frame');
    assert.equal(factoryNumberStyle.border, 'rgb(242, 213, 140)', 'factory numbers should have a responsive gold CSS frame');
    assert.match(factoryNumberStyle.radius, /50%/, 'factory numbers should stay circular');
    assert.ok(Math.abs((factoryNumberStyle.rect.left+factoryNumberStyle.rect.right)/2-(factoryNumberStyle.factory.left+factoryNumberStyle.factory.right)/2)<0.5, 'factory number medallions should stay centered on the factory at every viewport size');
    assert.match(await page.locator('.app').evaluate(e => getComputedStyle(e).backgroundImage), /patterns\/lapis_mobile_/, 'the supplied Persian pattern should cover the game background');
    await page.waitForTimeout(1100);
    await page.waitForFunction(() => document.querySelector('#timer').innerText !== '۶۰', undefined, { timeout: 3000 });
    assert.match(await page.locator('#timer').innerText(), /^[۰-۹]{2}$/, 'the visible countdown should decrease in digital seconds');

    for (const viewport of [{width:320,height:640},{width:360,height:740},{width:360,height:880},{width:390,height:844},{width:430,height:932}]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const rect=e=>e.getBoundingClientRect(),factories=[...document.querySelectorAll('.factory')].map(rect),tiles=[...document.querySelectorAll('.factory .tile')].map(rect),badges=[...document.querySelectorAll('.factory .fnum')].map(rect),opponents=rect(document.querySelector('.opponents')),player=rect(document.querySelector('.player-area')),pattern=rect(document.querySelector('#patterns')),wall=rect(document.querySelector('#wall'));
        const circleOverlap=factories.some((a,i)=>factories.some((b,j)=>{if(i>=j)return false;return Math.hypot((a.left+a.right-b.left-b.right)/2,(a.top+a.bottom-b.top-b.bottom)/2)<(a.width+b.width)/2-1}));
        const tileOverlap=tiles.some((a,i)=>tiles.some((b,j)=>i<j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
        const badgeCentered=badges.every((b,i)=>Math.abs((b.left+b.right-factories[i].left-factories[i].right)/2)<.5);
        return {scroll:document.documentElement.scrollWidth!==innerWidth||document.documentElement.scrollHeight!==innerHeight,circleOverlap,tileOverlap,badgeCentered,topClear:[0,2,3].every(i=>factories[i].top>=opponents.bottom-1),bottomClear:[4,7].every(i=>factories[i].bottom<=player.top+1),boardInside:pattern.left>=player.left&&wall.right<=player.right&&pattern.top>=player.top&&wall.bottom<=player.bottom};
      });
      assert.deepEqual(geometry,{scroll:false,circleOverlap:false,tileOverlap:false,badgeCentered:true,topClear:true,bottomClear:true,boardInside:true},`iPhone layout should stay clear at ${viewport.width}×${viewport.height}`);
      const patternImage=await page.locator('.app').evaluate(e=>getComputedStyle(e).backgroundImage);
      assert.match(patternImage,viewport.height/viewport.width>=2.38? /lapis_mobile_1080x2640/ : viewport.width>=430? /lapis_mobile_1440x3200/ : /lapis_mobile_1080x2400/,`the closest supplied pattern aspect should be used at ${viewport.width}×${viewport.height}`);
    }
    await page.setViewportSize({width:390,height:844});

    await page.locator('[data-source]:not([disabled])').first().click();
    await page.locator('.pattern-row.available').first().click();
    while ((await page.locator('#instruction').innerText()).includes('باقی‌مانده')) await page.locator('.pattern-row.available').first().click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem('mahbang-azul-light-v4'));
      return state.turn === 0 && state.last.startsWith('رایانه');
    }, undefined, { timeout: 5000 });
    assert.match(await page.locator('#timer').innerText(), /۶۰|۵۹|60|59/, 'the one-minute clock should reset when the turn returns after the CPU move');
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
      state.turn=1;state.turnDeadline=Date.now()+60000;state.players[0].lines=[[],[],[],[],[]];state.players[0].wall=Array.from({length:5},()=>Array(5).fill(null));state.players[1].lines=[[0],[1,1],[2,2,2],[3,3,3,3],[4,4,4,4,4]];state.factories[0]=[1,1,2,3];state.pending={source:'f',index:0,color:1,count:2,remaining:2,started:false};
      localStorage.setItem(key,JSON.stringify(state));
    });
    await page.goto('http://127.0.0.1:8776/games/azul/index.html?resume=1');
    await page.locator('[data-resume]').click();
    await page.waitForFunction(() => document.querySelector('.opponent .mini-slot.filled') !== null, undefined, { timeout: 3000 });
    assert.equal(await page.locator('.opponent').first().locator('.mini-slot.filled').count(), 15, 'all of the opponent’s stacked pattern tiles should be rendered');
    const visiblePlaced = await page.locator('.opponent').first().locator('.mini-slot.filled').evaluateAll(es => es.every(e => getComputedStyle(e).backgroundImage.includes('tile-')));
    assert.ok(visiblePlaced, 'rivals’ placed triangular tiles should display instead of the faded empty-slot texture');
    assert.equal(await page.locator('.pattern-row.available').count(), 0, 'an opponent’s pending tile selection must not turn the local player’s pattern rows green');
    assert.equal(await page.locator('.tile.selected').count(), 0, 'an opponent’s pending tile selection must not highlight tiles in the local view');
    assert.equal(await page.locator('.opponent[data-seat="1"]').evaluate(e => getComputedStyle(e,'::before').animationName), 'azul-gold-turn-orbit', 'the opponent whose turn it is should receive the shared gold frame glow');

    const randomPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await randomPage.addInitScript(() => { Math.random = () => 0.99; });
    await randomPage.goto('http://127.0.0.1:8776/games/azul/index.html?fresh=1');
    await randomPage.locator('[data-new="4"]').click();
    const started = await randomPage.evaluate(() => JSON.parse(localStorage.getItem('mahbang-azul-light-v4')));
    assert.equal(started.starter, 3, 'the starting seat should be selected randomly, not fixed to the room creator');
    assert.equal(started.turn, started.starter, 'the first turn should match the randomly chosen starting seat');
    await randomPage.close();
    console.log('Azul one-minute turn timer, timeout takeover, vibration, and back icon: PASS');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
