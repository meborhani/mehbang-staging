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
  assert.equal(E.scoreBoxIndex(40),0);
  assert.equal(E.scoreBoxIndex(220),3);
  assert.equal(E.scoreBoxIndex(300),3,'300 shares the single 200–300 board position');
  assert.equal(E.scoreBoxIndex(301),4,'scores above 300 advance to the 300–500 position');
  assert.equal(E.scoreBoxIndex(400),4);
  assert.equal(E.playerSafeHaul({haul:150,busted:false}),150,'the card uses only this player’s current-hand safe haul');
  assert.equal(E.playerSafeHaul({haul:150,busted:true}),0,'a devil clears this player’s visible safe haul');
}

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
  assert.equal(report.totalSafeHaul,235,'non-busted players contribute their safe values to the shared visible total');
  assert.equal(g.players[first].wealth,400,'the highest wager doubles when it is at or below the top safe haul');
  assert.equal(g.players[safePlayer].wealth,300,'the highest safe haul earns its separate 50-chip bonus');
  assert.equal(g.players[second].wealth,220,'lower wagers receive the ordinary payout when the top safe haul covers them');
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
  assert.equal(report.players[first].success,false,'combined hauls do not cover a wager when neither safe player reaches it');
  assert.equal(report.players[first].doubled,false);
  assert.equal(report.players[second].success,true,'a wager equal to the top individual safe haul wins');
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
  assert.equal(report.totalSafeHaul,50,'a busted player’s earlier safe haul no longer counts');
  assert.equal(report.maxHaul,50,'the maximum safe haul excludes anyone who revealed the devil');
  assert.equal(report.players[first].success,false,'revealing the devil invalidates that player’s safe haul for settlement');
  assert.equal(report.players[first].haul,0,'a busted player receives no score for their earlier coal reveals');
  assert.equal(report.players[first].doubled,false);
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
  const g=E.createGame(3,['نفر ۱','نفر ۲','نفر ۳'],()=>0.5);
  E.addWager(g,0,100);E.lockBet(g,0);E.addWager(g,1,100);E.addWager(g,1,50);E.lockBet(g,1);E.addWager(g,2,100);E.addWager(g,2,20);E.lockBet(g,2);E.startRound(g,()=>0.5);
  g.players[0].haul=100;
  g.players[1].haul=195;g.players[1].busted=true;g.players[1].foundDevil=true;
  g.players[2].haul=120;
  g.players[0].pact=true;
  g.phase='settlement';
  const report=E.settle(g);
  assert.equal(report.maxHaul,120,'the top safe score is 120; the devil finder’s 195 is ignored');
  assert.equal(report.totalSafeHaul,220,'only the two non-busted players contribute safe scores');
  assert.deepEqual(report.players.map(p=>p.success),[true,false,true]);
  assert.deepEqual(report.players.map(p=>p.doubled),[false,false,false],'the highest 150 wager fails because no eligible safe haul reaches 150');
  assert.deepEqual(report.players.map(p=>p.burned),[0,150,0]);
  assert.deepEqual(report.highHaulPlayers,[2]);
  assert(report.transfers.some(t=>t.from===1&&t.to===0&&t.amount===50),'the devil finder pays 50 to the pact holder');
  assert.equal(g.players[1].wealth,0,'the devil finder loses the 150 wager and an additional 50 pact payment');
  assert.equal(g.players[0].wealth,350,'player one wins their 100 payout and receives the pact payment');
  assert.equal(g.players[2].wealth,370,'player three wins 120 and the 50 high-haul bonus');
}
{
  const g=E.createGame(2,['نفر با شرط بالا','نفر امن'],()=>0.5);
  E.addWager(g,0,100);E.addWager(g,0,50);E.lockBet(g,0);E.addWager(g,1,100);E.lockBet(g,1);E.startRound(g,()=>0.5);
  g.players[0].haul=0;g.players[1].haul=150;g.phase='settlement';
  const report=E.settle(g);
  assert.equal(report.players[0].success,true,'the highest bettor may qualify from another player’s safe haul');
  assert.equal(report.players[0].doubled,true,'the highest wager doubles when the top safe haul reaches it');
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
  g.players[0].wealth=100;g.players[1].wealth=120;g.players[2].wealth=400;
  g.phase='settlement';E.settle(g);
  assert.deepEqual(g.pactOffers,[],'no pact is offered when multiple players share the lowest score box, even if their exact scores differ');
  assert.equal(E.offerPact(g),null,'a tied lowest score box has no pact recipient');
  const unique=E.createGame(3,['تو','الف','ب'],()=>0.5);unique.players[0].wealth=40;unique.players[1].wealth=250;unique.players[2].wealth=400;unique.phase='settlement';E.settle(unique);
  assert.deepEqual(unique.pactOffers,[0],'the only player in the lowest score box receives the pact offer');
  assert.equal(E.acceptPact(unique,0),true);
  assert.equal(unique.players[0].pact,true);
  assert.deepEqual([0,50,51,199,200,201,300,301,500,501,750,751,1000,1001,1300,1301,1600].map(E.scoreBoxIndex),[0,0,1,1,2,3,3,4,5,6,7,8,9,10,11,12,13],'300 shares the 200–300 position and later values retain their correct boundaries');
}
{
  const g=E.createGame(3,['تو','الف','ب'],()=>0.5);
  g.players[0].wealth=40;g.players[1].wealth=120;g.players[2].wealth=300;
  g.phase='settlement';g.pactOffers=[0];g.pactOffer=0;E.settle(g);
  assert.deepEqual(g.pactOffers,[0],'only the player with the lowest settled score receives the pact offer');
  const stale=E.createGame(3,['تو','الف','ب'],()=>0.5);
  stale.players[0].wealth=250;stale.players[1].wealth=85;stale.players[2].wealth=300;stale.phase='settlement';stale.pactOffers=[0];stale.pactOffer=0;
  assert.equal(E.offerPact(stale),1,'a stale offer is redirected to the unique player in the lowest score box');
  const tied=E.createGame(3,['تو','الف','ب'],()=>0.5);tied.players[0].wealth=100;tied.players[1].wealth=120;tied.players[2].wealth=300;tied.phase='settlement';tied.pactOffers=[0];
  assert.equal(E.offerPact(tied),null,'a stale offer is cleared when multiple players share the lowest score box');
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
