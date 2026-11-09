const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const azulHtml = fs.readFileSync('games/azul/index.html', 'utf8');
const hubHtml = fs.readFileSync('index.html', 'utf8');
const outcomeStart = hubHtml.indexOf('function histOutcome(e){');
const outcomeEnd = hubHtml.indexOf('\nfunction histOpen(){', outcomeStart);
assert.ok(outcomeStart >= 0 && outcomeEnd > outcomeStart, 'history should have a report-based Azul outcome resolver');
const histOutcome = new Function(`return (${hubHtml.slice(outcomeStart, outcomeEnd)})`)();
assert.equal(histOutcome({ g:'آزول', s:0, r:'l', rp:{ rows:[{ l:'امتیاز نهایی', v:[100,12] }] } }), 'w', 'legacy Azul history should use final reported scores instead of a stale loss marker');
assert.equal(histOutcome({ g:'آزول', s:0, r:'l', rp:{ rows:[{ l:'امتیاز نهایی', v:[12,100] }] } }), 'l', 'history should still show a loss when another player has the higher score');
assert.equal(histOutcome({ g:'آزول', s:0, r:'l', rp:{ rows:[{ l:'امتیاز نهایی', v:[12,12] }] } }), 'd', 'equal final scores should be a draw');
const finishStart = azulHtml.indexOf('function finishRound(){');
let scan = finishStart + 'function finishRound'.length, depth = 0, finishEnd = -1;
for (; scan < azulHtml.length; scan++) { if (azulHtml[scan] === '{') depth++; else if (azulHtml[scan] === '}' && --depth === 0) { finishEnd = scan + 1; break; } }
assert.ok(finishStart >= 0 && finishEnd > finishStart, 'production round scorer should exist');
const finishRound = new Function('s','PEN','wallPoints','bonus','fa','render','refill','toast','setTimeout','online','onlineRole','onlineAi','botMove','timer','tutorialMode','tutorial','azulAiThinkDelay', `return (${azulHtml.slice(finishStart, finishEnd)})()`);
const roundState = { round:1, players:[
  {score:0,lines:[[0],[],[],[],[]],wall:Array.from({length:5},()=>Array(5).fill(null)),floor:[]},
  {score:0,lines:[[],[],[],[],[]],wall:Array.from({length:5},()=>Array(5).fill(null)),floor:[]}
], discard:[], nextStarter:null, starter:0, roundHistory:[] };
finishRound(roundState,[1,1,2,2,2,3,3],()=>1,()=>0,String,()=>{},()=>{},()=>{},()=>0,false,'host',[],()=>{},null,false,null,()=>15);
assert.deepEqual(roundState.roundHistory, [{ round:1, scores:[1,0] }], 'completed hands should persist each player’s net score');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8774', '--directory', process.cwd()], { stdio: 'ignore' });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://127.0.0.1:8774/?hub=1', { waitUntil: 'domcontentloaded' });
    const fullWall = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => (r + c) % 5));
    const emptyWall = Array.from({ length: 5 }, () => Array(5).fill(null));
    const fixture = {
      n: 2,
      players: [
        { name: 'ابراهیم', avatar: '0', score: 100, lines: [[], [], [], [], []], wall: fullWall, floor: [] },
        { name: 'سارا', avatar: '1', score: 12, lines: [[], [], [], [], []], wall: emptyWall, floor: [] }
      ],
      bag: [], discard: [], factories: Array.from({ length: 5 }, () => []), center: [], round: 3,
      elapsed: 80000, startedAt: Date.now(), starter: 0, nextStarter: null, turn: -1, firstToken: true,
      over: true, last: 'بازی تمام شد', pending: null,
      roundHistory: [{ round: 1, scores: [5, 2] }, { round: 2, scores: [7, 3] }]
    };
    await page.evaluate(state => localStorage.setItem('mahbang-azul-light-v4', JSON.stringify(state)), fixture);
    await page.locator('[data-hg="azul"]').click();
    await page.locator('#mini [data-mg="azulresume"]').click();
    const frame = page.frameLocator('#azulOverlay iframe');
    await frame.getByRole('button', { name: 'ادامهٔ بازی ذخیره‌شده' }).click();
    await frame.locator('#modal-content').getByText(/گزارش امتیاز/).waitFor({ timeout: 6000 });
    const reportText = await frame.locator('#modal-content').innerText();
    for (const text of ['ابراهیم', 'سارا', 'تکمیل رنگ', 'تکمیل سطر', 'تکمیل ستون', 'امتیاز دست ۱', 'امتیاز دست ۲', 'امتیاز نهایی']) assert.ok(reportText.includes(text), `final report should include ${text}`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mb_hist') || '[]'));
    const game = stored.findLast(e => e.g === 'آزول');
    assert.ok(game && game.rp, 'Azul report should be saved in game history');
    assert.equal(game.r, 'w', 'the highest-scoring local player must be recorded as the winner');
    assert.deepEqual(game.rp.rows.find(r => r.l === 'امتیاز دست ۱').v, [5, 2]);
    assert.deepEqual(game.rp.rows.find(r => r.l === 'امتیاز دست ۲').v, [7, 3]);
    assert.deepEqual(game.rp.rows.find(r => r.l === 'تکمیل رنگ').v, [5, 0]);
    assert.deepEqual(game.rp.rows.find(r => r.l === 'تکمیل سطر').v, [5, 0]);
    assert.deepEqual(game.rp.rows.find(r => r.l === 'تکمیل ستون').v, [5, 0]);
    assert.deepEqual(game.rp.rows.find(r => r.l === 'امتیاز نهایی').v, [100, 12]);
    console.log('Azul final report details and saved game history: PASS');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
