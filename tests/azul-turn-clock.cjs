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
    await page.locator('[data-new="2"]').click();
    assert.match(await page.locator('#timer').innerText(), /01:00/, 'each turn should start with one minute');
    assert.ok(await page.evaluate(() => window.__vibrations.length > 0), 'the active player turn should vibrate the phone');
    assert.equal(await page.locator('#azul-back').evaluate(e => getComputedStyle(e, '::after').content), '"←"', 'back control should use a clear back arrow glyph');

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
    console.log('Azul one-minute turn timer, timeout takeover, vibration, and back icon: PASS');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
