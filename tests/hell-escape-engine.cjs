const assert = require('node:assert/strict');
const E = require('../games/hell-escape/engine.js');

function rngFrom(values) { let i=0; return () => values[i++ % values.length]; }
function betAndStart(state, bets, rng) {
  bets.forEach((amount, seat) => { if (amount) E.addWager(state, seat, amount); E.lockBet(state, seat); });
  E.startRound(state, rng || (() => 0.5));
}
function coalWith(state, pred) { return state.coals.find(c => !c.revealed && pred(c)); }
function clearPactOffers(state) { while (E.offerPact(state) !== null) E.declinePact(state, E.offerPact(state)); }

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
  assert.equal(g.players[seat].haul,75,'safe haul is not erased when the devil ends this player’s turn');
  assert.notEqual(g.turn,seat);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[100,50]);
  const seat=g.turn;
  assert.equal(E.endTurn(g,seat),false,'a player cannot end a turn before revealing coal while coals remain');
  assert.equal(g.turn,seat,'rejected empty turn does not advance');
  const first=g.turn, second=(first+1)%2;
  const safe1=coalWith(g,c=>c.kind==='coal'&&c.value===100);
  E.revealCoal(g,first,safe1.id); E.endTurn(g,first);
  const safe2=coalWith(g,c=>c.kind==='coal'&&c.value===20);
  E.revealCoal(g,second,safe2.id); E.endTurn(g,second);
  assert.equal(g.phase,'settlement');
  const summary=E.settle(g);
  assert.equal(summary.maxHaul,100);
  assert.equal(summary.players[first].payout,200,'the settlement report records the bank payout separately from the returned stake');
  assert.equal(g.players[first].wealth,450,'highest successful wager is doubled and the highest safe haul also gets 50');
  assert.equal(g.players[second].wealth,250,'a player succeeds when any player safely reveals enough coal to cover their wager');
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[50,20]);
  g.available=[];
  assert.equal(E.endTurn(g,g.turn),false,'an empty bag never allows a player to skip without revealing a coal first');
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  betAndStart(g,[50,20,10]);
  const first=g.turn;E.revealCoal(g,first,coalWith(g,c=>c.kind==='coal').id);E.endTurn(g,first);
  g.available=[];
  assert.equal(E.forcePassEmpty(g),true,'players with no remaining coal are automatically passed only after the bag is empty');
  assert.notEqual(g.turn,g.turnOrder[1],'an empty-bag forced pass advances automatically');
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  betAndStart(g,[50,20,10]);
  const first=g.turn,token=coalWith(g,c=>c.kind==='coal');g.available=[token.id];
  E.revealCoal(g,first,token.id);assert.equal(E.endTurn(g,first),true);
  assert.equal(g.phase,'settlement','the last revealed coal settles after already-drawn players finish');
  assert(g.players.every(p=>p.turnDone),'players with no coal left are auto-passed instead of being offered a skip button');
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[100,50]);
  g.phase='settlement';g.players[0].haul=0;g.players[1].haul=0;
  const bank=g.bank,wealth=g.players.map(p=>p.wealth);
  const report=E.settle(g);
  assert.equal(report.players[0].success,false);
  assert.equal(report.players[1].success,false);
  assert.equal(report.players[0].burned,100);
  assert.equal(report.players[1].burned,50);
  assert.equal(g.bank,bank+150,'failed wagers are burned into the bank');
  assert.deepEqual(g.players.map(p=>p.wealth),wealth,'a burned wager is not returned to its owner');
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  betAndStart(g,[100,50,20]);
  const first=g.turn;
  E.revealCoal(g,first,coalWith(g,c=>c.kind==='coal'&&c.value===100).id);
  E.endTurn(g,first);
  const safePlayer=g.turn;
  E.revealCoal(g,safePlayer,coalWith(g,c=>c.kind==='coal'&&c.value===75).id);
  E.revealCoal(g,safePlayer,coalWith(g,c=>c.kind==='coal'&&c.value===50).id);
  E.endTurn(g,safePlayer);
  const second=g.turn;
  E.revealCoal(g,second,coalWith(g,c=>c.kind==='coal'&&c.value===10).id);
  E.endTurn(g,second);
  const report=E.settle(g);
  assert.equal(report.maxHaul,125);
  assert.equal(report.totalSafeHaul,235,'wager success uses all safe coal values revealed by every player');
  assert.equal(g.players[first].wealth,400,'the highest wager doubles when its owner personally reaches the wager, even if another player hauled more');
  assert.equal(g.players[safePlayer].wealth,300,'the highest safe haul earns its separate 50-chip bonus');
  assert.equal(g.players[second].wealth,220,'lower wagers receive the ordinary payout when total safe haul covers them');
  assert.equal(report.players[first].doubled,true);
  assert.equal(report.players[first].success,true);
  assert.equal(report.players[second].success,true);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[100,50]);
  const first=g.turn, second=g.turnOrder[1];
  E.revealCoal(g,first,coalWith(g,c=>c.kind==='coal'&&c.value===50).id);E.endTurn(g,first);
  E.revealCoal(g,second,coalWith(g,c=>c.kind==='coal'&&c.value===50).id);E.endTurn(g,second);
  const report=E.settle(g);
  assert.equal(report.totalSafeHaul,100);
  assert.equal(report.maxHaul,50);
  assert.equal(report.players[first].success,true,'the highest wager succeeds from combined haul even when no individual reaches it');
  assert.equal(report.players[first].doubled,true);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[100,50]);
  const first=g.turn;
  E.revealCoal(g,first,coalWith(g,c=>c.kind==='coal'&&c.value===75).id);
  const safeHaul=g.players[first].haul;
  E.revealCoal(g,first,coalWith(g,c=>c.kind==='devil').id);
  assert.equal(g.players[first].haul,safeHaul,'safe haul is retained after the same player reveals a devil');
  assert.equal(g.totalSafeHaul,safeHaul,'the hand-wide safe total keeps this haul after the devil');
  const second=g.turn;
  E.revealCoal(g,second,coalWith(g,c=>c.kind==='coal'&&c.value===50).id);E.endTurn(g,second);
  const report=E.settle(g);
  assert.equal(report.totalSafeHaul,125);
  assert.equal(report.players[first].success,true,'a devil reveal does not erase previously revealed safe coals');
  assert.equal(report.players[first].doubled,true,'the highest wager can still double when the combined safe total covers it');
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  betAndStart(g,[50,20]);
  const seat=g.turn, token=coalWith(g,c=>c.kind==='coal');
  E.revealCoal(g,seat,token.id);E.endTurn(g,seat);
  const previousReveal=g.players[seat].reveals[0];
  const nextSeat=g.turn, token2=coalWith(g,c=>c.kind==='coal');
  E.revealCoal(g,nextSeat,token2.id);E.endTurn(g,nextSeat);
  const remaining=g.available.length,remainingIds=g.available.slice();
  E.settle(g);clearPactOffers(g);E.nextRound(g,()=>0.5);
  assert.equal(g.available.length,remaining,'coal supply is retained while at least 24 coals remain');
  assert.deepEqual(g.available,remainingIds);
  assert.deepEqual(g.players[seat].reveals[0],previousReveal,'per-player reveal rows persist between hands while the same bag is used');
  g.phase='settlement';g.settled=null;g.available=remainingIds.slice(0,23);E.settle(g);clearPactOffers(g);E.nextRound(g,()=>0.5);
  assert.equal(g.available.length,48,'a fresh supply is created only once fewer than 24 coals remain');
  assert(g.players.every(p=>p.reveals.length===0),'per-player reveal rows clear when the bag is refreshed');
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
  assert.notEqual(g.turn,finder,'revealing the devil advances to the next player immediately');
  while(g.phase==='play'){
    const seat=g.turn,token=coalWith(g,c=>c.kind==='coal');
    E.revealCoal(g,seat,token.id);E.endTurn(g,seat);
  }
  const before=g.players.map(p=>p.wealth);
  const summary=E.settle(g);
  assert(summary.transfers.some(x=>x.from===finder&&x.to===1&&x.amount===50));
  assert(g.players[1].wealth>=before[1]+50,'the pact recipient receives 50 chips from the devil finder');
  assert(!summary.transfers.some(x=>x.from===1&&x.to===1),'a pact holder who reveals the devil does not pay themselves');
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  g.players[0].pact=true;betAndStart(g,[100,50]);
  const pactHolder=g.turn;E.revealCoal(g,pactHolder,coalWith(g,c=>c.kind==='devil').id);
  const next=g.turn;E.revealCoal(g,next,coalWith(g,c=>c.kind==='coal').id);E.endTurn(g,next);
  const report=E.settle(g);
  assert.equal(report.transfers.length,0,'a pact holder who reveals the devil makes no self-payment');
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  g.players[0].wealth=100;g.players[1].wealth=100;g.players[2].wealth=400;
  g.phase='settlement';E.settle(g);
  assert.deepEqual(g.pactOffers,[0,1],'all players tied for last place receive a pact offer');
  assert.equal(E.offerPact(g),0,'the first eligible player receives the pact offer');
  assert.equal(E.acceptPact(g,0),true);
  assert.equal(g.players[0].pact,true);
  assert.equal(E.offerPact(g),1,'the next tied player can independently accept or decline');
  assert.equal(E.declinePact(g,1),true);
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  g.phase='settlement';g.players[0].foundDevil=true;g.players[0].wealth=0;g.players[1].pact=true;
  const report=E.settle(g);
  assert.equal(report.transfers[0].amount,50,'devil payment remains exactly 50 even when the drawer has spent their remaining chips');
  assert.equal(g.players[0].wealth,-50,'an unpaid portion is carried as a negative balance rather than reducing the pact payment');
}
{
  const g=E.createGame(2,['تو','رایانه'],()=>0.5);
  g.players[0].wealth=1600;
  g.phase='settlement';
  E.finishIfWon(g);
  assert.equal(g.gameOver,true);
}
console.log('hell escape engine: all tests passed');
