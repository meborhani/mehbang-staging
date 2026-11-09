(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HellEscapeEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var CHIP_VALUES=[10,20,50,100,200,500,1000];
  var COAL_COUNTS={10:9,20:9,25:9,50:7,75:3,100:2};
  function scoreBoxIndex(score){score=Math.max(0,+score||0);if(score<=50)return 0;if(score<200)return 1;if(score===200)return 2;if(score<=300)return 3;if(score<500)return 4;if(score===500)return 5;if(score<750)return 6;if(score===750)return 7;if(score<1000)return 8;if(score===1000)return 9;if(score<1300)return 10;if(score===1300)return 11;if(score<1600)return 12;return 13;}
  function normalizePactHolder(g){if(!g||!Array.isArray(g.players))return null;var positions=g.players.map(function(p){return Number.isFinite(p.scorePos)?p.scorePos:p.wealth;}),lowestBox=Math.min.apply(null,positions.map(scoreBoxIndex)),lowest=positions.map(function(score,i){return scoreBoxIndex(score)===lowestBox?i:-1;}).filter(function(i){return i>=0;}),holder=lowest.length===1&&g.players[lowest[0]].pact?lowest[0]:null;g.players.forEach(function(p,i){p.pact=i===holder;});return holder;}
  function playerSafeHaul(player){return player&&!player.busted?Math.max(0,+player.haul||0):0;}
  function rnd(rng){var n=Number((rng||Math.random)());return Number.isFinite(n)?Math.max(0,Math.min(.999999999,n)):0;}
  function shuffledBag(rng){
    var bag=[];for(var i=0;i<9;i++)bag.push({kind:'devil',value:0});
    Object.keys(COAL_COUNTS).forEach(function(v){for(var j=0;j<COAL_COUNTS[v];j++)bag.push({kind:'coal',value:+v});});
    for(var k=bag.length-1;k>0;k--){var q=Math.floor(rnd(rng)*(k+1));var t=bag[k];bag[k]=bag[q];bag[q]=t;}
    return bag.map(function(c,id){return {id:id,kind:c.kind,value:c.value,revealed:false};});
  }
  function createGame(n,names,rng){
    n=Math.max(2,Math.min(4,Math.floor(+n||2)));
    names=Array.isArray(names)?names:[];
    var players=[];for(var i=0;i<n;i++)players.push({name:String(names[i]||('بازیکن '+(i+1))).slice(0,24),wealth:200,wager:0,wagerHidden:true,locked:false,haul:0,lastHaul:0,coalCount:0,reveals:[],busted:false,foundDevil:false,pact:false,turnDone:false,scorePos:200});
    return {version:1,round:1,phase:'bet',players:players,coals:shuffledBag(rng),available:Array.from({length:48},function(_,i){return i;}),turnOrder:[],turnIndex:-1,turn:-1,bank:10000,bestBet:0,maxHaul:0,totalSafeHaul:0,pactOffer:null,pactOffers:[],gameOver:false,winners:[],settled:null,history:[],createdAt:Date.now()};
  }
  function validSeat(g,s){return !!g&&Number.isInteger(s)&&s>=0&&s<g.players.length;}
  function addWager(g,s,v){
    if(!validSeat(g,s)||g.phase!=='bet'||g.players[s].locked||CHIP_VALUES.indexOf(+v)<0)return false;
    var p=g.players[s],value=+v;if(p.wealth-p.wager<value)return false;
    p.wager+=value;return true;
  }
  function lockBet(g,s){
    if(!validSeat(g,s)||g.phase!=='bet')return false;
    var p=g.players[s];if(p.locked||p.wager<10||p.wealth<p.wager)return false;
    p.wealth-=p.wager;p.locked=true;
    if(g.players.every(function(x){return x.locked;}))g.phase='bet-reveal';
    return true;
  }
  function startRound(g,rng){
    if(!g||g.phase!=='bet-reveal'||!g.players.every(function(p){return p.locked;}))return false;
    g.players.forEach(function(p){p.wagerHidden=false;p.haul=0;p.coalCount=0;p.busted=false;p.foundDevil=false;p.turnDone=false;});g.totalSafeHaul=0;
    g.bestBet=Math.max.apply(null,g.players.map(function(p){return p.wager;}));
    var candidates=[];g.players.forEach(function(p,i){if(p.wager===g.bestBet)candidates.push(i);});
    var starter=candidates[Math.floor(rnd(rng)*candidates.length)];
    g.turnOrder=[];for(var i=0;i<g.players.length;i++)g.turnOrder.push((starter+i)%g.players.length);
    g.turnIndex=0;g.turn=g.turnOrder[0];g.phase='play';return true;
  }
  function advance(g){
    if(g.available.length===0)g.players.forEach(function(p){if(!p.turnDone&&p.coalCount<1)p.turnDone=true;});
    for(var step=1;step<=g.turnOrder.length;step++){
      var ix=(g.turnIndex+step)%g.turnOrder.length,seat=g.turnOrder[ix];
      if(!g.players[seat].turnDone){g.turnIndex=ix;g.turn=seat;return;}
    }
    g.turn=-1;g.phase='settlement';
  }
  function forcePassEmpty(g){if(!g||g.phase!=='play'||g.available.length!==0)return false;g.players.forEach(function(p){if(!p.turnDone&&p.coalCount<1)p.turnDone=true;});advance(g);return true;}
  function revealCoal(g,s,id){
    if(!validSeat(g,s)||g.phase!=='play'||g.turn!==s)return false;
    var token=g.coals.find(function(c){return c.id===id;});
    if(!token||token.revealed||g.available.indexOf(id)<0)return false;
    token.revealed=true;g.available.splice(g.available.indexOf(id),1);
    var p=g.players[s];
    p.reveals=p.reveals||[];p.reveals.push({id:token.id,kind:token.kind,value:token.value,round:g.round});
    if(token.kind==='devil'){
      p.busted=true;p.foundDevil=true;p.turnDone=true;advance(g);
    }else{p.haul+=token.value;p.coalCount++;g.totalSafeHaul=(g.totalSafeHaul||0)+token.value;}
    return true;
  }
  function endTurn(g,s){
    if(!validSeat(g,s)||g.phase!=='play'||g.turn!==s)return false;
    if(g.players[s].coalCount<1)return false;
    g.players[s].turnDone=true;advance(g);return true;
  }
  function finishIfWon(g){
    if(!g||g.gameOver)return !!(g&&g.gameOver);
    var reached=g.players.some(function(p){return p.wealth>=1600;});
    if(reached){var high=Math.max.apply(null,g.players.map(function(p){return p.wealth;}));g.gameOver=true;g.winners=g.players.map(function(p,i){return p.wealth===high?i:-1;}).filter(function(i){return i>=0;});g.phase='game-over';}
    return g.gameOver;
  }
  function settle(g){
    if(!g||g.phase!=='settlement')return null;
    if(g.settled)return g.settled;
    var p=g.players,eligibleHaul=p.map(playerSafeHaul),maxHaul=Math.max.apply(null,eligibleHaul),totalSafeHaul=eligibleHaul.reduce(function(sum,value){return sum+value;},0),maxWager=Math.max.apply(null,p.map(function(x){return x.wager;}));
    var leaders=p.map(function(x,i){return !x.busted&&x.haul===maxHaul&&maxHaul>0?i:-1;}).filter(function(i){return i>=0;});
    var transfers=[],pactSeats=p.map(function(x,i){return x.pact?i:-1;}).filter(function(i){return i>=0;});
    p.forEach(function(x,i){
      var succeeds=x.wager<=maxHaul;
      x.lastHaul=x.haul;
      var doubled=succeeds&&x.wager===maxWager;
      var payout=0,burned=0;
      if(succeeds){payout=x.wager*(doubled?2:1);x.wealth+=x.wager+payout;g.bank-=payout;}
      else{burned=x.wager;g.bank+=x.wager;}
      x.roundSuccess=succeeds;x.roundDoubled=doubled;x.roundPayout=payout;x.roundBurned=burned;
    });
    leaders.forEach(function(i){p[i].wealth+=50;g.bank-=50;});
    p.forEach(function(x,from){if(!x.foundDevil)return;pactSeats.forEach(function(to){if(to===from)return;var amount=50;x.wealth-=amount;p[to].wealth+=amount;transfers.push({from:from,to:to,amount:amount});});});
    g.maxHaul=maxHaul;g.totalSafeHaul=totalSafeHaul;
    p.forEach(function(x){x.pact=false;x.scorePos=x.wealth;});
    var lowBox=Math.min.apply(null,p.map(function(x){return scoreBoxIndex(x.wealth);})),last=p.map(function(x,i){return scoreBoxIndex(x.wealth)===lowBox?i:-1;}).filter(function(i){return i>=0;});
    g.pactOffers=last.length===1?last.slice():[];g.pactOffer=g.pactOffers.length?g.pactOffers[0]:null;
    var summary={round:g.round,maxHaul:maxHaul,totalSafeHaul:totalSafeHaul,highHaulPlayers:leaders,bestWager:maxWager,players:p.map(function(x){return {name:x.name,wager:x.wager,haul:x.busted?0:x.lastHaul,busted:x.busted,success:x.roundSuccess,doubled:x.roundDoubled,payout:x.roundPayout,burned:x.roundBurned,wealth:x.wealth};}),transfers:transfers,bank:g.bank};
    g.history.push(summary);g.settled=summary;finishIfWon(g);if(g.gameOver){g.pactOffers=[];g.pactOffer=null;}return summary;
  }
  function offerPact(g){if(!g||g.phase!=='settlement'||g.gameOver)return null;var lowBox=Math.min.apply(null,g.players.map(function(p){return scoreBoxIndex(p.wealth);})),lowest=g.players.map(function(p,i){return scoreBoxIndex(p.wealth)===lowBox?i:-1;}).filter(function(i){return i>=0;});g.pactOffers=Array.isArray(g.pactOffers)?g.pactOffers:(validSeat(g,g.pactOffer)?[g.pactOffer]:[]);if(g.pactOffers.length)g.pactOffers=lowest.length===1?[lowest[0]]:[];g.pactOffer=g.pactOffers.length?g.pactOffers[0]:null;return g.pactOffer;}
  function resolvePact(g,s,take){if(!validSeat(g,s)||g.phase!=='settlement'||g.gameOver||offerPact(g)!==s)return false;if(take)g.players[s].pact=true;g.pactOffers.shift();g.pactOffer=g.pactOffers.length?g.pactOffers[0]:null;return true;}
  function acceptPact(g,s){return resolvePact(g,s,true);}
  function declinePact(g,s){return resolvePact(g,s,false);}
  function nextRound(g,rng){
    if(!g||g.phase!=='settlement'||g.gameOver||offerPact(g)!==null)return false;
    g.round++;g.phase='bet';if(g.available.length<24){g.coals=shuffledBag(rng);g.available=Array.from({length:48},function(_,i){return i;});g.players.forEach(function(p){p.reveals=[];});}
    g.turnOrder=[];g.turnIndex=-1;g.turn=-1;g.bestBet=0;g.maxHaul=0;g.settled=null;
    g.totalSafeHaul=0;g.pactOffers=[];g.pactOffer=null;g.players.forEach(function(p){p.wager=0;p.wagerHidden=true;p.locked=false;p.haul=0;p.coalCount=0;p.busted=false;p.foundDevil=false;p.turnDone=false;p.scorePos=p.wealth;p.reveals=p.reveals||[];});return true;
  }
  function addNpcWager(g,s,rng,maxValue){
    if(!validSeat(g,s)||g.players[s].locked)return false;
    var p=g.players[s],opts=CHIP_VALUES.filter(function(v){return v<=p.wealth&&(!maxValue||v<=maxValue);});
    if(!opts.length)return false;
    var target=opts[Math.floor(rnd(rng)*opts.length)];
    addWager(g,s,target);return lockBet(g,s);
  }
  function snapshot(g){return JSON.parse(JSON.stringify(g));}
  function validate(g){
    if(!g||g.version!==1||!Array.isArray(g.players)||g.players.length<2||g.players.length>4||!Array.isArray(g.coals)||g.coals.length!==48||!Array.isArray(g.available)||g.available.some(function(id){return !Number.isInteger(id)||id<0||id>=48;}))return false;
    if(g.coals.some(function(c,i){return c.id!==i||!['devil','coal'].includes(c.kind)||!Number.isInteger(c.value)||typeof c.revealed!=='boolean';}))return false;
    if(g.players.some(function(p){return !p||!Number.isFinite(p.wealth)||!Number.isFinite(p.wager)||p.wager<0||p.haul<0||p.haul>1270||(p.reveals!==undefined&&!Array.isArray(p.reveals));}))return false;
    return ['bet','bet-reveal','play','settlement','game-over'].includes(g.phase);
  }
  return {CHIP_VALUES:CHIP_VALUES,COAL_COUNTS:COAL_COUNTS,scoreBoxIndex:scoreBoxIndex,normalizePactHolder:normalizePactHolder,playerSafeHaul:playerSafeHaul,createGame:createGame,addWager:addWager,lockBet:lockBet,startRound:startRound,revealCoal:revealCoal,endTurn:endTurn,forcePassEmpty:forcePassEmpty,settle:settle,offerPact:offerPact,acceptPact:acceptPact,declinePact:declinePact,nextRound:nextRound,addNpcWager:addNpcWager,finishIfWon:finishIfWon,snapshot:snapshot,validate:validate};
});
