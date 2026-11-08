const assert = require('node:assert/strict');
const fs = require('node:fs');

const hub = fs.readFileSync('index.html', 'utf8');
const azul = fs.readFileSync('games/azul/index.html', 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should be defined`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not read ${name}`);
}

function loadDelay(source, name) {
  const body = extractFunction(source, name);
  const run = new Function('window', 'rint', 'rnd', `return (${body})();`);
  return (window, random) => run(window, random, random);
}

for (const [source, functionName] of [
  [hub, 'mgAiThinkDelay'],
  [azul, 'azulAiThinkDelay']
]) {
  const rng = { value: 0 };
  const delay = loadDelay(source, functionName);
  const sample = n => Math.floor(rng.value * n);
  assert.equal(delay({ __FAST: false }, sample), 1000, `${functionName} should allow the 1-second minimum`);
  rng.value = 0.999999;
  assert.ok(delay({ __FAST: false }, sample) <= 5000, `${functionName} should cap thinking at 5 seconds`);
  assert.ok(delay({ __FAST: false }, sample) >= 1000, `${functionName} should never think for less than 1 second`);
  assert.equal(delay({ __FAST: true }, sample), 15, `${functionName} should preserve fast automated tests`);
}

function hasFunctionBodyCall(source, name, called) {
  return extractFunction(source, name).includes(`${called}()`);
}
for (const scheduler of ['jzSchedule', 'pkSchedule', 'kbSchedule']) {
  assert.ok(hasFunctionBodyCall(hub, scheduler, 'mgAiThinkDelay'), `${scheduler} should pause before AI actions`);
}
assert.ok(extractFunction(hub, 'aiTurn').includes('sleep(mgAiThinkDelay())'), 'Catan AI should pause before taking its turn');
assert.ok(extractFunction(azul, 'setup').includes('azulAiThinkDelay()'), 'Azul should pause when the random starting seat is a CPU');
assert.ok(extractFunction(azul, 'advance').includes('azulAiThinkDelay()'), 'Azul should pause before each CPU turn');
console.log('AI turn delay bounds and five main-game schedulers: PASS');
