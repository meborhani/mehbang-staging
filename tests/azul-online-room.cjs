const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8765', '--directory', process.cwd()], { stdio: 'ignore' });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    await new Promise(r => setTimeout(r, 300));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const fakeTransport = `window.__TRANSPORT = {
        host(code, onLink, onReady) {
          const ch = new BroadcastChannel('azul-test-' + code), links = {};
          ch.onmessage = e => {
            const p = e.data || {};
            if (p.k === 'join') {
              const cid = p.cid;
              const l = links[cid] = { onmessage: null, onclose: null, send: d => ch.postMessage({ to: cid, d }), close() {} };
              onLink(l);
            } else if (p.to === 'h' && links[p.from] && links[p.from].onmessage) links[p.from].onmessage(p.d);
          };
          onReady();
          return { close: () => ch.close() };
        },
        join(code, onLink) {
          const ch = new BroadcastChannel('azul-test-' + code), cid = Math.random().toString(36).slice(2);
          const l = { onmessage: null, onclose: null, send: d => ch.postMessage({ to: 'h', from: cid, d }), close() {} };
          ch.onmessage = e => { const p = e.data || {}; if (p.to === cid && l.onmessage) l.onmessage(p.d); };
          ch.postMessage({ k: 'join', cid }); setTimeout(() => onLink(l), 30);
          return { close: () => ch.close() };
        }
      };`;
    const host = await context.newPage();
    const guest = await context.newPage();
    await host.goto('http://127.0.0.1:8765/?hub=1', { waitUntil: 'domcontentloaded' });
    await host.evaluate(fakeTransport);
    await host.locator('[data-hg="azul"]').waitFor({ state: 'visible', timeout: 8000 });
    await host.locator('[data-hg="azul"]').click();
    assert.equal(await host.locator('[data-mg="mk"]').isEnabled(), true, 'Azul create-room control must be enabled');
    assert.equal(await host.locator('#mgCode').isEnabled(), true, 'Azul join-code field must be enabled');
    await host.locator('[data-pn="2"]').click();
    await host.locator('[data-mg="mk"]').click();
    await host.locator('.mg-code').waitFor();
    const code = (await host.locator('.mg-code').innerText()).replace(/\D/g, '').slice(-5);
    assert.equal(code.length, 5, 'host should create a five-digit room');

    await guest.goto('http://127.0.0.1:8765/?hub=1', { waitUntil: 'domcontentloaded' });
    await guest.evaluate(fakeTransport);
    await guest.locator('[data-hg="azul"]').waitFor({ state: 'visible', timeout: 8000 });
    await guest.locator('[data-hg="azul"]').click();
    await guest.locator('#mgCode').fill(code);
    await guest.locator('[data-mg="join"]').click();
    await host.waitForFunction(() => { const p = document.querySelectorAll('#mini .mg-p')[1]; return p && !p.textContent.includes('منتظر بازیکن'); }, null, { timeout: 8000 });
    await host.locator('[data-mg="start"]').click();
    await host.locator('#azulOverlay iframe').waitFor();
    await guest.locator('#azulOverlay iframe').waitFor();
    const hf = host.frameLocator('#azulOverlay iframe'), gf = guest.frameLocator('#azulOverlay iframe');
    await hf.locator('[data-source]:not([disabled])').first().click();
    await hf.locator('.pattern-row.available').first().click();
    for (let i = 0; i < 8; i++) {
      await host.waitForTimeout(160);
      if ((await hf.locator('#status').innerText()) !== '● نوبت شماست') break;
      if ((await hf.locator('#instruction').innerText()).includes('باقی‌مانده')) await hf.locator('.pattern-row.available').first().click();
    }
    await gf.getByText('● نوبت شماست').waitFor({ timeout: 6000 });
    await gf.locator('[data-source]:not([disabled])').first().click();
    await gf.locator('.pattern-row.available').first().click();
    for (let i = 0; i < 8; i++) {
      await guest.waitForTimeout(160);
      if ((await gf.locator('#status').innerText()) !== '● نوبت شماست') break;
      if ((await gf.locator('#instruction').innerText()).includes('باقی‌مانده')) await gf.locator('.pattern-row.available').first().click();
    }
    await hf.getByText('● نوبت شماست').waitFor({ timeout: 6000 });

    await gf.locator('#settings').click();
    await gf.getByRole('button', { name: 'اتمام بازی' }).click();
    await gf.getByRole('button', { name: 'بله، اتمام بازی' }).click();
    await hf.getByText(/این بازی به درخواست بازیکن پایان یافت/).waitFor({ timeout: 6000 });
    await gf.getByText(/این بازی به درخواست بازیکن پایان یافت/).waitFor({ timeout: 6000 });
    await gf.locator('[data-azul-back]').click();
    await guest.locator('[data-hg="azul"]').waitFor({ state: 'visible' });
    await guest.locator('#azulOverlay iframe').waitFor({ state: 'detached' });
    assert.equal(await guest.locator('#azulOverlay iframe').count(), 0, 'return to hub must close the Azul view');
    await context.close();

    const fourContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const four = await fourContext.newPage();
    await four.goto('http://127.0.0.1:8765/?hub=1', { waitUntil: 'domcontentloaded' });
    await four.evaluate(fakeTransport);
    await four.locator('[data-hg="azul"]').waitFor({ state: 'visible' });
    await four.locator('[data-hg="azul"]').click();
    await four.locator('[data-pn="4"]').click();
    await four.locator('[data-mg="mk"]').click();
    await four.locator('[data-mg="start"]').click();
    await four.locator('#azulOverlay iframe').waitFor();
    const fourFrame = four.frameLocator('#azulOverlay iframe');
    await fourFrame.locator('.opponent').first().waitFor({ timeout: 6000 });
    assert.equal(await fourFrame.locator('.opponent').count(), 3, 'four-player Azul must show three opponents');
    await fourFrame.locator('[data-source]:not([disabled])').first().click();
    await fourFrame.locator('.pattern-row.available').first().click();
    for (let i = 0; i < 8; i++) {
      await four.waitForTimeout(160);
      if ((await fourFrame.locator('#status').innerText()) !== '● نوبت شماست') break;
      if ((await fourFrame.locator('#instruction').innerText()).includes('باقی‌مانده')) await fourFrame.locator('.pattern-row.available').first().click();
    }
    await fourFrame.getByText('● نوبت شماست').waitFor({ timeout: 12000 });
    await fourContext.close();

    const solo = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await solo.newPage();
    await page.goto('http://127.0.0.1:8765/?hub=1', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hg="azul"]').waitFor({ state: 'visible' });
    await page.locator('[data-hg="azul"]').click();
    await page.locator('[data-mg="ai"]').click();
    const local = page.frameLocator('#azulOverlay iframe');
    await local.locator('#status').waitFor();
    await local.locator('[data-source]').first().waitFor();
    const localFrame = page.frames().find(f => f.url().includes('/games/azul/index.html'));
    assert.ok(await localFrame.evaluate(() => !!localStorage.getItem('mahbang-azul-light-v4')), 'local AI game state must keep saving');
    await local.locator('#settings').click();
    await local.getByRole('button', { name: 'اتمام بازی' }).click();
    await local.getByRole('button', { name: 'بله، اتمام بازی' }).click();
    await local.getByText(/این بازی به درخواست بازیکن پایان یافت/).waitFor();
    await solo.close();
    console.log('Azul online rooms (2 and 4 players), synced turns, AI fill, and online/offline end-game: PASS');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
