const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8777', '--directory', process.cwd()], { stdio: 'ignore' });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => { window.__FAST = true; });
    await page.goto('http://127.0.0.1:8777/games/azul/index.html?fresh=1');
    await page.locator('[data-new="4"]').click();
    const savedBefore = await page.evaluate(() => localStorage.getItem('mahbang-azul-light-v4'));
    const controls = await page.evaluate(() => {
      const r = e => e.getBoundingClientRect();
      const help = r(document.querySelector('#help'));
      const gear = r(document.querySelector('#settings'));
      return { visible: getComputedStyle(document.querySelector('#help')).display !== 'none', aligned: Math.abs(help.top - gear.top) < 1, adjacent: help.right <= gear.left + 1, sameSize: Math.abs(help.width - gear.width) < 1 };
    });
    assert.deepEqual(controls, { visible: true, aligned: true, adjacent: true, sameSize: true }, 'the question-mark help control should sit beside the gear on its right-side control row');

    await page.locator('#help').click();
    assert.ok(await page.locator('#modal-content').innerText().then(t => t.includes('بازی آموزشی')), 'the help page should explain the rules and offer a guided training round');
    await page.locator('[data-start-tutorial]').click();
    assert.ok(await page.locator('body').evaluate(e => e.classList.contains('tutorial-mode')), 'training should start in a clearly marked temporary mode');
    assert.ok(!(await page.locator('#toast').evaluate(e => e.classList.contains('show'))), 'the regular game-start toast should not obscure the first tutorial prompt');
    assert.match(await page.locator('#instruction').innerText(), /کارگاه ۱/, 'the first tutorial prompt should ask the player to pick a tile');
    assert.ok(await page.locator('#instruction').evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 9), 'tutorial instructions should remain readable on a phone');
    assert.equal(await page.locator('#factories .factory').first().locator('.tile[data-c="0"]').count(), 2, 'the guided first pickup should contain two blue tiles to split');

    await page.locator('#factories .factory').first().locator('.tile[data-c="0"]').first().click();
    assert.match(await page.locator('#instruction').innerText(), /ردیف اول/, 'after selecting a tile, the tutorial should direct the player to the first row');
    await page.locator('#patterns [data-row="0"]').click();
    assert.equal(await page.locator('#patterns [data-row="0"] .tile').count(), 1, 'the first row should receive one of the two selected tiles');
    assert.match(await page.locator('#instruction').innerText(), /ردیف دوم/, 'after the first tile, the tutorial should explain and guide the remaining tile');
    await page.locator('#patterns [data-row="1"]').click();
    assert.equal(await page.locator('#patterns [data-row="1"] .tile').count(), 1, 'the remaining tile should be placed in a second legal row');

    for (const name of ['مریم', 'علی', 'سارا']) {
      await page.waitForFunction(expected => document.querySelector('#instruction').innerText.includes('نوبت ' + expected), name, { timeout: 6500 });
      assert.ok(await page.locator('.opponent.active').count(), `the ${name} tutorial explanation should mark that opponent's turn`);
    }
    await page.waitForFunction(() => document.querySelector('#instruction').innerText.includes('این دور آموزشی تمام شد'), undefined, { timeout: 6500 });
    assert.equal(await page.evaluate(() => localStorage.getItem('mahbang-azul-light-v4')), savedBefore, 'the temporary training round must leave the saved real game untouched');
    assert.ok(await page.locator('#tutorial-exit').isVisible(), 'the completed tutorial should offer a return to the saved game');
    await page.locator('#tutorial-exit').click();
    assert.ok(!(await page.locator('body').evaluate(e => e.classList.contains('tutorial-mode'))), 'leaving training should restore normal game mode');
    const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('mahbang-azul-light-v4')));
    const original = JSON.parse(savedBefore);
    for (const key of ['players', 'factories', 'center', 'round', 'turn', 'starter', 'roundHistory']) assert.deepEqual(savedAfter[key], original[key], `returning from training must preserve saved game ${key}`);
    console.log('Azul help control, guided tile split, opponent explanations, round scoring, and saved-game restore: PASS');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
