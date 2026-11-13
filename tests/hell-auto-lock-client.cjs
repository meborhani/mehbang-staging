const assert=require('assert'),fs=require('fs');
const s=fs.readFileSync('games/hell-escape/app.js','utf8');
assert(s.includes('function maybeAutoLock()'),'client must have an automatic zero-balance lock helper');
assert(s.includes("sendAction({a:'lock'})"),'client must request the server lock for a zero-balance player');
assert(s.includes('maybeAutoLock();'),'online state application must invoke auto-lock');
console.log('hell auto-lock client regression: ok');
