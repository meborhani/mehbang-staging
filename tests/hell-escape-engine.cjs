const assert = require('node:assert/strict');
const E = require('../games/hell-escape/engine.js');

function rngFrom(values) { let i=0; return () => values[i++ % values.length]; }
function betAndStart(state, bets, rng) {
  bets.forEach((amount, seat) => { if (amount) E.addWager(state, seat, amount); E.lockBet(state, seat); });
  E.startRound(state, rng || (() => 0.5));
}
function coalWith(state, pred) { return state.coals.find(c => !c.revealed && pred(c)); }

{
  const g=E.createGame(4,['تو','الف','ب','ج'],rngFrom([0.25]));
  assert.equal(g.coals.length,48);
  assert.equal(g.coals.filter(c=>c.kind==='devil').length,9);
  for(const value of [10,20,25,50,75,100]) assert.equal(g.coals.filter(c=>c.kind==='coal'&&c.value===value).length,{10:9,20:9,25:9,50:7,75:3,100:2}[value]);
  assert(g.players.every(p=>p.wealth===200));
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  assert.equal(E.addWager(g,0,500),false,'cannot wager above bank');
  assert.equal(E.addWager(g,0,25),false,'wager chips use supported denominations');
  assert.equal(E.addWager(g,0,100),true);
  assert.equal(E.lockBet(g,0),true);
  assert.equal(g.players[0].wealth,100);
  assert.equal(g.players[0].wagerHidden,true);
  assert.equal(E.addWager(g,1,50),true);
  assert.equal(E.lockBet(g,1),true);
  assert.equal(g.phase,'bet-reveal');
  E.startRound(g,()=>0.5);
  assert.equal(g.phase,'play');
  assert.equal(g.players[0].wagerHidden,false);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[100,50]);
  const seat=g.turn, target=coalWith(g,c=>c.kind==='coal'&&c.value===75);
  const id=target.id;
  assert.equal(E.revealCoal(g,seat,id),true);
  assert.equal(g.players[seat].haul,75,'the exact selected token value is revealed');
  assert.equal(E.revealCoal(g,seat,id),false,'a token cannot be revealed twice');
  const devil=coalWith(g,c=>c.kind==='devil');
  assert.equal(E.revealCoal(g,seat,devil.id),true);
  assert.equal(g.players[seat].busted,true);
  assert.equal(g.players[seat].haul,0);
  assert.notEqual(g.turn,seat);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[100,50]);
  const first=g.turn, second=(first+1)%2;
  const safe1=coalWith(g,c=>c.kind==='coal'&&c.value===100);
  E.revealCoal(g,first,safe1.id); E.endTurn(g,first);
  const safe2=coalWith(g,c=>c.kind==='coal'&&c.value===20);
  E.revealCoal(g,second,safe2.id); E.endTurn(g,second);
  assert.equal(g.phase,'settlement');
  const summary=E.settle(g);
  assert.equal(summary.maxHaul,100);
  assert.equal(g.players[first].wealth,450,'highest successful wager is returned and pays double, plus 50 high-haul bonus');
  assert.equal(g.players[second].wealth,250,'lower successful wager is returned and pays one wager');
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[50,50]);
  for(let i=0;i<2;i++){
    const seat=g.turn, token=coalWith(g,c=>c.kind==='coal'&&c.value===10);
    E.revealCoal(g,seat,token.id); E.endTurn(g,seat);
  }
  const report=E.settle(g);
  assert.equal(report.maxHaul,10);
  assert.equal(g.players.filter(p=>p.lastHaul===10).length,2);
  assert(g.players.every(p=>p.wealth>=200),'tied highest haul bonus pays each tied player');
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  g.players[1].pact=true;
  betAndStart(g,[50,10,10]);
  const finder=g.turn;
  const devil=coalWith(g,c=>c.kind==='devil');
  E.revealCoal(g,finder,devil.id);
  while(g.phase==='play')E.endTurn(g,g.turn);
  const before=g.players.map(p=>p.wealth);
  const summary=E.settle(g);
  assert(summary.transfers.some(x=>x.from===finder&&x.to===1&&x.amount===50));
  assert.equal(g.players[1].wealth,before[1]+50);
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  g.players[0].wealth=100;g.players[1].wealth=100;g.players[2].wealth=400;
  g.phase='settlement';E.settle(g);
  assert.equal(E.offerPact(g),null,'tied last place cannot take a unique-last pact');
  g.players[0].wealth=50;g.settled=null;g.pactOffer=null;E.settle(g);
  assert.equal(E.offerPact(g),0,'only unique last gets a pact offer');
  assert.equal(E.acceptPact(g,0),true);
  assert.equal(g.players[0].pact,true);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  g.players[0].wealth=1600;
  g.phase='settlement';
  E.finishIfWon(g);
  assert.equal(g.gameOver,true);
}
console.log('hell escape engine: all tests passed');
