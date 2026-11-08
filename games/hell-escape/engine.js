(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HellEscapeEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var CHIP_VALUES=[10,20,50,100,200,500,1000];
  var COAL_COUNTS={10:9,20:9,25:9,50:7,75:3,100:2};
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
    var players=[];for(var i=0;i<n;i++)players.push({name:String(names[i]||('بازیکن '+(i+1))).slice(0,24),wealth:200,wager:0,wagerHidden:true,locked:false,haul:0,lastHaul:0,coalCount:0,busted:false,foundDevil:false,pact:false,turnDone:false,scorePos:200});
    return {version:1,round:1,phase:'bet',players:players,coals:shuffledBag(rng),available:Array.from({length:48},function(_,i){return i;}),turnOrder:[],turnIndex:-1,turn:-1,bank:10000,bestBet:0,maxHaul:0,pactOffer:null,gameOver:false,winners:[],settled:null,history:[],createdAt:Date.now()};
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
    g.players.forEach(function(p){p.wagerHidden=false;p.haul=0;p.coalCount=0;p.busted=false;p.foundDevil=false;p.turnDone=false;});
    g.bestBet=Math.max.apply(null,g.players.map(function(p){return p.wager;}));
    var candidates=[];g.players.forEach(function(p,i){if(p.wager===g.bestBet)candidates.push(i);});
    var starter=candidates[Math.floor(rnd(rng)*candidates.length)];
    g.turnOrder=[];for(var i=0;i<g.players.length;i++)g.turnOrder.push((starter+i)%g.players.length);
    g.turnIndex=0;g.turn=g.turnOrder[0];g.phase='play';return true;
  }
  function advance(g){
    for(var step=1;step<=g.turnOrder.length;step++){
      var ix=(g.turnIndex+step)%g.turnOrder.length,seat=g.turnOrder[ix];
      if(!g.players[seat].turnDone){g.turnIndex=ix;g.turn=seat;return;}
    }
    g.turn=-1;g.phase='settlement';
  }
  function revealCoal(g,s,id){
    if(!validSeat(g,s)||g.phase!=='play'||g.turn!==s)return false;
    var token=g.coals.find(function(c){return c.id===id;});
    if(!token||token.revealed||g.available.indexOf(id)<0)return false;
    token.revealed=true;g.available.splice(g.available.indexOf(id),1);
    var p=g.players[s];
    if(token.kind==='devil'){
      p.busted=true;p.foundDevil=true;p.haul=0;p.coalCount=0;p.turnDone=true;advance(g);
    }else{p.haul+=token.value;p.coalCount++;}
    return true;
  }
  function endTurn(g,s){
    if(!validSeat(g,s)||g.phase!=='play'||g.turn!==s)return false;
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
    var p=g.players, maxHaul=Math.max.apply(null,p.map(function(x){return x.haul;})),maxWager=Math.max.apply(null,p.map(function(x){return x.wager;}));
    var leaders=p.map(function(x,i){return x.haul===maxHaul&&!x.busted&&maxHaul>0?i:-1;}).filter(function(i){return i>=0;});
    var transfers=[],pactSeats=p.map(function(x,i){return x.pact?i:-1;}).filter(function(i){return i>=0;});
    p.forEach(function(x,i){
      var succeeds=!x.busted&&x.wager<=maxHaul;
      x.lastHaul=x.haul;
      if(succeeds){var payout=x.wager*(x.wager===maxWager?2:1);x.wealth+=x.wager+payout;g.bank-=payout;}
      else g.bank+=x.wager;
    });
    leaders.forEach(function(i){p[i].wealth+=50;g.bank-=50;});
    p.forEach(function(x,from){if(!x.foundDevil)return;pactSeats.forEach(function(to){if(to===from)return;var amount=Math.min(50,Math.max(0,x.wealth));if(!amount)return;x.wealth-=amount;p[to].wealth+=amount;transfers.push({from:from,to:to,amount:amount});});});
    g.maxHaul=maxHaul;
    p.forEach(function(x){x.pact=false;});
    var low=Math.min.apply(null,p.map(function(x){return x.wealth;})),last=p.map(function(x,i){return x.wealth===low?i:-1;}).filter(function(i){return i>=0;});
    g.pactOffer=last.length===1?last[0]:null;
    var summary={round:g.round,maxHaul:maxHaul,highHaulPlayers:leaders,bestWager:maxWager,players:p.map(function(x){return {name:x.name,wager:x.wager,haul:x.lastHaul,busted:x.busted,success:!x.busted&&x.wager<=maxHaul,wealth:x.wealth};}),transfers:transfers,bank:g.bank};
    g.history.push(summary);g.settled=summary;finishIfWon(g);return summary;
  }
  function offerPact(g){return g&&g.phase==='settlement'&&!g.gameOver?g.pactOffer:null;}
  function acceptPact(g,s){if(!validSeat(g,s)||g.phase!=='settlement'||g.gameOver||g.pactOffer!==s)return false;g.players[s].pact=true;g.pactOffer=null;return true;}
  function declinePact(g,s){if(!validSeat(g,s)||g.phase!=='settlement'||g.pactOffer!==s)return false;g.pactOffer=null;return true;}
  function nextRound(g,rng){
    if(!g||g.phase!=='settlement'||g.gameOver)return false;
    g.round++;g.phase='bet';g.coals=shuffledBag(rng);g.available=Array.from({length:48},function(_,i){return i;});
    g.turnOrder=[];g.turnIndex=-1;g.turn=-1;g.bestBet=0;g.maxHaul=0;g.settled=null;
    g.players.forEach(function(p){p.wager=0;p.wagerHidden=true;p.locked=false;p.haul=0;p.coalCount=0;p.busted=false;p.foundDevil=false;p.turnDone=false;p.scorePos=p.wealth;});return true;
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
    if(g.players.some(function(p){return !p||!Number.isFinite(p.wealth)||p.wealth<0||!Number.isFinite(p.wager)||p.wager<0||p.haul<0||p.haul>1270;}))return false;
    return ['bet','bet-reveal','play','settlement','game-over'].includes(g.phase);
  }
  return {CHIP_VALUES:CHIP_VALUES,COAL_COUNTS:COAL_COUNTS,createGame:createGame,addWager:addWager,lockBet:lockBet,startRound:startRound,revealCoal:revealCoal,endTurn:endTurn,settle:settle,offerPact:offerPact,acceptPact:acceptPact,declinePact:declinePact,nextRound:nextRound,addNpcWager:addNpcWager,finishIfWon:finishIfWon,snapshot:snapshot,validate:validate};
});
