import {HellEscapeEngine as E} from './hell_engine.mjs';

export const TURN_MS=60000, GRACE_MS=10000, DETECT_MS=6000, AI_MIN_MS=1000, AI_MAX_MS=5000;
const BOT_NAMES=['کاوه','رها','سارا'];
const STYLE=['risk','cautious','smart','dumb','normal','alternating'];
const CHIP_ORDER=[500,200,100,50,20,10];
const rand=n=>Math.floor(Math.random()*n);
const copy=x=>JSON.parse(JSON.stringify(x));

function npcWager(g,seat){
  const p=g.players[seat];
  if(p.wealth<10){p.wager=0;p.locked=true;p.wagerHidden=false;return;}
  let style=p.aiPersonality||'normal';
  if(style==='alternating')style=g.round%2?'risk':'cautious';
  const cap=Math.max(10,Math.min(p.wealth,100+rand(151)));
  const hist=(g.history||[]).slice(-3),mean=hist.length?hist.reduce((a,h)=>a+(h.maxHaul||0),0)/hist.length:100;
  let fraction=style==='risk'?.78+Math.random()*.2:style==='cautious'?.3+Math.random()*.22:style==='smart'?Math.max(.35,Math.min(.8,mean/cap*.72)):style==='dumb'?.12+Math.random()*.88:.5+Math.random()*.3;
  let amount=Math.max(10,Math.floor(cap*fraction/10)*10);
  for(const v of CHIP_ORDER)while(amount>=v&&p.wealth-p.wager>=v){E.addWager(g,seat,v);amount-=v;}
  if(p.wager<10&&p.wealth-p.wager>=10)E.addWager(g,seat,10);
  E.lockBet(g,seat);
}
function makeState(ctx,now){
  const n=ctx.n,players=Array(n).fill(null),names=Array(n).fill(''),av=Array(n).fill(-1),ai=Array(n).fill(true);
  for(let i=0;i<n;i++)names[i]=BOT_NAMES[i%BOT_NAMES.length]+' (رایانه)';
  for(const s of ctx.seats){names[s.seat]=s.name;av[s.seat]=s.av;ai[s.seat]=false;}
  const game=E.createGame(n,names);
  game.players.forEach((p,i)=>{p.isAI=ai[i];p.aiPersonality=ai[i]?STYLE[rand(STYLE.length)]:'human';p.avatar=av[i];p.roomSeat=i;});
  game.gameId='hell-'+ctx.code+'-'+now.toString(36);game.startedAt=now;
  const st={game,srv:{deadline:0,pactDeadline:0,nextAt:now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1),disconnectAt:{},sub:{},acted:{},roundReveals:[],done:false}};
  game.players.forEach((p,i)=>{if(p.isAI)npcWager(game,i);});
  return st;
}
function aiStop(g,s){
  const p=g.players[s];if(p.coalCount<1)return false;
  if(g.totalSafeHaul<p.wager)return false;
  const style=p.aiPersonality==='alternating'?(g.round%2?'risk':'cautious'):p.aiPersonality;
  const ownTop=!g.players.some((q,i)=>i!==s&&!q.busted&&q.haul>p.haul);
  const danger=(9-g.coals.filter(c=>c.kind==='devil'&&c.revealed).length)/Math.max(1,g.available.length);
  const lockedSuccess=g.players.some((q,i)=>i!==s&&q.turnDone&&!q.busted&&q.haul>=p.wager);
  if(style==='smart')return lockedSuccess||(p.haul>=p.wager&&ownTop&&danger>=.1)||(p.coalCount>=3&&p.haul>=p.wager&&danger>.22);
  if(style==='cautious')return lockedSuccess||p.haul>=p.wager||(p.coalCount>=3&&ownTop&&danger>.1);
  if(style==='risk')return (p.haul>=p.wager&&Math.random()<.32)||(p.coalCount>=5&&Math.random()<.25);
  if(style==='dumb')return p.coalCount>=2&&Math.random()<.3;
  return lockedSuccess||(p.haul>=p.wager&&p.coalCount>=2&&Math.random()<.55)||(p.coalCount>=4&&Math.random()<.3);
}
function setDeadline(st,now){const g=st.game;st.srv.deadline=g.phase==='play'&&!g.players[g.turn].isAI?now+TURN_MS:0;}
function afterTurn(g,st,now,previousTurn){
  if(g.phase==='play'){if(g.turn!==previousTurn)setDeadline(st,now);if(g.players[g.turn].isAI)st.srv.nextAt=now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1);}
  else if(g.phase==='settlement'){st.srv.deadline=0;st.srv.pactDeadline=now+30000;st.srv.nextAt=now+800;}
  else st.srv.deadline=0;
}
function resolveBots(g,st,now){
  let changed=false;
  for(let guard=0;guard<12;guard++){
    if(g.phase==='bet-reveal'){
      E.startRound(g);setDeadline(st,now);st.srv.nextAt=now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1);changed=true;continue;
    }
    if(g.phase==='settlement'){
      if(!g.settled){E.settle(g);if(g.settled)g.settled.reveals=copy(st.srv.roundReveals);changed=true;}
      const seat=E.offerPact(g);
      if(seat==null)break;
      const p=g.players[seat];
      if(!p.isAI){if(st.srv.pactDeadline&&now>=st.srv.pactDeadline){E.resolvePact(g,seat,false);st.srv.pactDeadline=now+30000;changed=true;continue;}break;}
      if(now<st.srv.nextAt)break;
      const take=(p.aiPersonality==='risk'||(p.aiPersonality==='smart'&&Math.random()<.75)||Math.random()<.35);
      E.resolvePact(g,seat,take);st.srv.nextAt=now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1);changed=true;continue;
    }
    if(g.phase!=='play')break;
    const seat=g.turn,p=g.players[seat];
    if(p.isAI&&now<st.srv.nextAt)break;
    const timedOut=!p.isAI&&st.srv.deadline>0&&now>=st.srv.deadline;
    if(p.isAI||timedOut){
      if(timedOut){p.isAI=true;st.srv.sub[seat]='timeout';st.srv.deadline=0;}
      const before=g.turn;
      if(g.available.length===0){if(p.coalCount>0)E.endTurn(g,seat);else E.forcePassEmpty(g);}
      else if(!timedOut&&aiStop(g,seat))E.endTurn(g,seat);
      else {const id=g.available[rand(g.available.length)],token=g.coals[id];if(E.revealCoal(g,seat,id))st.srv.roundReveals.push({seat,name:g.players[seat].name,kind:token.kind,value:token.value,id:token.id});}
      afterTurn(g,st,now,before);changed=true;continue;
    }
    break;
  }
  return changed;
}
function publicState(g,seat,st){
  const order=[seat];for(let i=1;i<g.players.length;i++)order.push((seat+i)%g.players.length);
  const ix=Object.create(null);order.forEach((s,i)=>ix[s]=i);
  const x=copy(g);
  x.players=order.map(s=>{const p=x.players[s];p.roomSeat=s;if(p.wagerHidden&&s!==seat)p.wager=0;delete p.aiPersonality;return p;});
  x.turn=g.turn<0?-1:ix[g.turn];x.pactOffers=(g.pactOffers||[]).map(s=>ix[s]);x.pactOffer=g.pactOffer==null?null:ix[g.pactOffer];x.winners=(g.winners||[]).map(s=>ix[s]);
  function rotateSummary(h){if(!h)return h;const y=copy(h);if(Array.isArray(y.players))y.players=order.map(s=>y.players[s]);if(Array.isArray(y.reveals))y.reveals=y.reveals.map(r=>Object.assign({},r,{seat:ix[r.seat]}));if(Array.isArray(y.highHaulPlayers))y.highHaulPlayers=y.highHaulPlayers.map(s=>ix[s]);return y;}
  x.history=(g.history||[]).map(rotateSummary);x.settled=rotateSummary(g.settled);
  x.coals=x.coals.map(c=>c.revealed?c:{id:c.id,kind:'hidden',value:0,revealed:false});
  x.you=0;x.roomSeat=seat;x.turnDeadlineAt=st.srv.deadline;
  return x;
}
function views(st,ctx,now){
  const g=st.game,out={},off=[],sub=[];
  for(const seat of Object.keys(st.srv.disconnectAt))if(st.srv.disconnectAt[seat]&&now-st.srv.disconnectAt[seat]>DETECT_MS)off.push(+seat);
  for(const seat of Object.keys(st.srv.sub))if(st.srv.sub[seat])sub.push(+seat);
  for(const s of ctx.seats){
    out[s.seat]={t:'st',g:'hell',you:s.seat,n:g.players.length,names:g.players.map(p=>p.name),av:g.players.map(p=>p.avatar),wins:g.players.map(()=>0),ai:g.players.map(p=>p.isAI),rn:g.round,turn:g.turn,over:g.gameOver,res:g.winners.length===1?g.winners[0]:(g.gameOver?'draw':null),line:[],b:[],x:publicState(g,s.seat,st),rp:g.gameOver?g.rp:undefined,sv:{dl:st.srv.deadline,off,sub,t:now}};
  }
  return out;
}
function report(g){
  return {id:'hell',gid:g.gameId,g:'فرار از جهنم',t:Date.now(),dur:Date.now()-(g.startedAt||Date.now()),n:g.players.length,names:g.players.map(p=>p.name),ai:g.players.map(p=>!!p.isAI),res:g.winners.length===1?g.winners[0]:'draw',rows:[{l:'امتیاز نهایی',v:g.players.map(p=>p.wealth),h:1},...g.history.flatMap(h=>[{l:'دست '+h.round+' · شرط',v:h.players.map(p=>p.wager)},{l:'دست '+h.round+' · برداشت امن',v:h.players.map(p=>p.haul)}])],sum:['موجودی بانک: '+g.bank,'مجموع زغال امن دست آخر: '+(g.settled?g.settled.totalSafeHaul:0)],rounds:g.history};
}
function resultRows(g,ctx){
  if(!g.rp)g.rp=report(g);
  return ctx.seats.map(s=>({seat:s.seat,r:g.winners.length===1?(g.winners[0]===s.seat?'w':'l'):'d',pts:g.winners.includes(s.seat)?3:0,reward:true,rp:g.rp}));
}
function online(ctx,seat){const q=ctx.seats.find(s=>s.seat===seat);return !!q&&!q.gone&&q.age<DETECT_MS;}
function act(g,seat,m,st,now){
  if(!m||typeof m!=='object')return false;
  if(st.srv.sub[seat]){g.players[seat].isAI=false;delete st.srv.sub[seat];}
  if(m.a==='wager-add')return E.addWager(g,seat,m.value);
  if(m.a==='clear-wager'){const p=g.players[seat];if(g.phase!=='bet'||p.locked)return false;p.wager=0;return true;}
  if(m.a==='lock'){
    if(!E.lockBet(g,seat))return false;
    if(g.phase==='bet-reveal'){E.startRound(g);setDeadline(st,now);st.srv.nextAt=now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1);}
    return true;
  }
  if(m.a==='reveal'){const before=g.turn,token=g.coals.find(c=>c.id===+m.id),ok=E.revealCoal(g,seat,+m.id);if(ok){st.srv.roundReveals.push({seat,name:g.players[seat].name,kind:token.kind,value:token.value,id:token.id});afterTurn(g,st,now,before);}return ok;}
  if(m.a==='end-turn'){const before=g.turn,ok=E.endTurn(g,seat);if(ok)afterTurn(g,st,now,before);return ok;}
  if(m.a==='pact'){const ok=E.resolvePact(g,seat,!!m.take);if(ok){st.srv.pactDeadline=now+30000;st.srv.nextAt=now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1);}return ok;}
  if(m.a==='next-round'){
    if(seat!==0||E.offerPact(g)!==null||!E.nextRound(g))return false;
    g.players.forEach((p,i)=>{if(p.isAI)npcWager(g,i);});st.srv.roundReveals=[];
    st.srv.nextAt=now+AI_MIN_MS+rand(AI_MAX_MS-AI_MIN_MS+1);return true;
  }
  return false;
}
function advancePresence(st,ctx,now){
  let changed=false;const g=st.game;
  for(const p of g.players){if(p.isAI)continue;const s=p.roomSeat;
    if(online(ctx,s)){if(st.srv.disconnectAt[s]){delete st.srv.disconnectAt[s];changed=true;}if(st.srv.sub[s]){delete st.srv.sub[s];p.isAI=false;changed=true;}}
    else{if(!st.srv.disconnectAt[s]){st.srv.disconnectAt[s]=now;continue;}if(now-st.srv.disconnectAt[s]>=GRACE_MS&&!st.srv.sub[s]){st.srv.sub[s]='dc';p.isAI=true;changed=true;}}
  }
  return changed;
}
export function run(op,m,ctx,now){
  let st=ctx.st,changed=false;
  if(op==='start'){
    if(ctx.status!=='wait'||!ctx.host)return {ok:false,why:'نمی‌توانید شروع کنید'};
    st=makeState(ctx,now);changed=true;
  }else if(ctx.status!=='play'||!st)return {ok:false,why:'اتاق فعال نیست'};
  const g=st.game;
  if(op==='act'){
    if(!act(g,ctx.seat,m,st,now))return {ok:false,why:'حرکت معتبر نیست'};
    changed=true;
  }
  changed=advancePresence(st,ctx,now)||changed;
  changed=resolveBots(g,st,now)||changed;
  if(g.phase==='settlement'&&!g.gameOver){const p=E.offerPact(g);if(p===null&&g.pactOffers&&g.pactOffers.length===0){/* Host advances the round explicitly. */}}
  if(g.gameOver&&g.winners.length)changed=true;
  const status=g.gameOver?'done':'play',res=g.gameOver&&!st.srv.done?resultRows(g,ctx):undefined,V=views(st,ctx,now);
  if(g.gameOver)st.srv.done=true;
  return {ok:true,changed,st,views:V,status,res,mine:V[ctx.seat]};
}
export function validateAction(m){return !!m&&typeof m==='object'&&['wager-add','clear-wager','lock','reveal','end-turn','pact','next-round'].includes(m.a);}
