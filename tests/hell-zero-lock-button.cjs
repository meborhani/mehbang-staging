const assert=require('assert'),fs=require('fs');
const s=fs.readFileSync('games/hell-escape/app.js','utf8');
assert(s.includes("lock.disabled=p.locked||(p.wealth>=10&&!p.wager);"),'zero-balance players must have an enabled lock button');
console.log('hell zero lock button regression: ok');
