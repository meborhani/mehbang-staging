// Catan ("سیطره کتان") server engine: rules extracted from online.html's Catan code
// (startGame/render/playCard/moveBlackHole/aiOffer/aiAct/aiTurn/handleSeven/rollAndResolve/
//  entropyStep/turn/endRound/orderPhase/setupPhase/mainLoop/doBuild/buyCard/hBuild/ptradePropose/askSeat),
// adapted to the same synchronous createEngine(env) shape as kb_engine.mjs/pk_engine.mjs so that
// cat_core.mjs can drive it on the server with a virtual clock, exactly like Jaliz/Kahroba/Poker.
//
// Design notes (kept here rather than only in the final report, since this file is the reference
// for anyone touching the rules later):
//  - All human decision points that used to be `await askSeat(...)` are now explicit pending
//    requests on M.x (M.x.pend[seat] for simultaneous waits such as the 7-roll discard, or the
//    normal M.turn + M.x.sub state machine for single-actor waits). A client action resolves one
//    pending request synchronously; the server never blocks.
//  - The old "order phase" (everyone rolls dice to rank the turn order) had NO player decisions in
//    the client either (it only animates dice already decided), so it is computed in one shot at
//    game start instead of as a multi-round network exchange. The *outcome* (dice values, re-roll
//    ties, final order) is produced with the exact same algorithm as online.html's orderPhase(),
//    just not spread across several round-trips. This changes no rule and no result.
//  - `planet`/`doNova` (COST.planet, planetSpots, novaSpots) exist in online.html but are dead code:
//    nothing in the dock, runCmd or AI ever reaches them. They are intentionally NOT ported; see the
//    final report's "محدودیت‌های باقی‌مانده". Likewise S.era/entropyStep/eraBanner/expand() are dead
//    code in the client (S.era is initialised to 0 and never changed), so the "entropy" discard-per-
//    era-3/4 mechanic never actually triggers in the current game and is not ported either.
//  - Per-opponent hidden information (resource types, dev-card types) is preserved exactly as the
//    client's viewFor() already did it: an opponent's resources collapse to a single total, and
//    their dev cards show as zero unless the game is over.
//  - Turn/placement timing: online.html already arms ONE timer per turn (set once before rolling,
//    not reset before the build/trade phase) and ONE shared minute per setup placement (house+road
//    together). That exact "one clock per turn" shape is kept, but the two speeds the client used
//    online (60s normally, 30s after an idle turn) are replaced by the flat 60s used by kb/pk's
//    server engines, per the task's explicit instruction to use the shared disconnect/timer pattern
//    instead of Catan's bespoke idle-kick timing (that bespoke 30s-then-kick-after-2-idle-turns logic
//    is superseded by the shared 10s-grace -> computer substitution -> instant handback pattern).
//  - AI-initiated trade offers to a human, and a human's player-trade proposal to others, both can
//    legitimately involve a seat other than M.turn. Those use a separate flat (not disconnect-paused)
//    deadline, defaulting to "decline" on timeout, which exactly matches the client's existing
//    defaultAnswer() for these two ask kinds. A seat that becomes computer-controlled mid-wait via the
//    normal disconnect grace resolves immediately via the AI's own accept/decline logic.
export function createEngine(env){
var M=null,DIFF=1,clockFn=null;
function now(){return clockFn?clockFn():Date.now();}
var rint=function(n){return Math.floor(Math.random()*n);};
var pick=function(a){return a[rint(a.length)];};
var shuffle=function(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=rint(i+1);var t=a[i];a[i]=a[j];a[j]=t;}return a;};
var sum=function(a){return a.reduce(function(x,y){return x+y;},0);};
var argmax=function(a){var b=0;for(var i=1;i<a.length;i++)if(a[i]>a[b])b=i;return b;};

var SQ3=Math.sqrt(3);
var DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
var WIN=11;
var COST={fil:[1,1,0,0,0],star:[1,1,1,1,0],gal:[0,0,0,2,3],buy:[0,0,1,1,1]};
var LIM={star:5,gal:4,fil:15};
var CARD_KINDS=['gravity','strong','em','planck','fine'];
var NUMS=[2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];
var TURN_MS=60000, OFFER_MS=30000, TRADE_MS=25000, DISCARD_MS=60000;

/* ---------- AK: AI aggressiveness by difficulty, copied from online.html ---------- */
function AK(){return [{noise:4,act:.6,trade:.45,offer:12,card:.5,bh:.3},{noise:1.2,act:1,trade:1,offer:35,card:.85,bh:1},{noise:.25,act:1,trade:1,offer:60,card:.95,bh:1.6}][DIFF];}

/* ---------- board geometry ---------- */
function hexCenter(q,r){return {x:SQ3*(q+r/2),y:1.5*r};}
function vkeyOf(x,y){return Math.round(x*100)+','+Math.round(y*100);}
function hexDist(q,r){return (Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2;}
function addTile(x,q,r,slot,num){
  var key=q+','+r,c=hexCenter(q,r);
  var t={q:q,r:r,key:key,slot:slot,num:num};
  x.tiles[key]=t;
  var vs=[];
  for(var k=0;k<6;k++){
    var a=Math.PI/180*(60*k-30),vx=c.x+Math.cos(a),vy=c.y+Math.sin(a),vk=vkeyOf(vx,vy);
    var v=x.verts[vk];
    if(!v){v={key:vk,tiles:[],adj:[],edges:[]};x.verts[vk]=v;}
    if(v.tiles.indexOf(key)<0)v.tiles.push(key);
    vs.push(vk);
  }
  for(var j=0;j<6;j++){
    var A=vs[j],B=vs[(j+1)%6],ek=A<B?A+'|'+B:B+'|'+A;
    if(!x.edges[ek])x.edges[ek]={key:ek,a:A,b:B};
    if(x.verts[A].adj.indexOf(B)<0)x.verts[A].adj.push(B);
    if(x.verts[B].adj.indexOf(A)<0)x.verts[B].adj.push(A);
    if(x.verts[A].edges.indexOf(ek)<0)x.verts[A].edges.push(ek);
    if(x.verts[B].edges.indexOf(ek)<0)x.verts[B].edges.push(ek);
  }
  return t;
}
function tileRes(t){return t.slot;}
function initBoard(x,n){
  var R=n>=5?3:2,spots=[],q,r,k;
  x.R=R;
  if(R===2){
    for(q=-2;q<=2;q++)for(r=-2;r<=2;r++)if(hexDist(q,r)<=2)spots.push([q,r]);
  }else{
    var q0s={'-3':0,'-2':-1,'-1':-2,'0':-3,'1':-3,'2':-3,'3':-3},ws={'-3':3,'-2':4,'-1':5,'0':6,'1':5,'2':4,'3':3};
    for(r=-3;r<=3;r++)for(k=0;k<ws[r];k++)spots.push([q0s[r]+k,r]);
  }
  spots=shuffle(spots);
  var nd=R===2?1:2,deserts=spots.slice(0,nd),rest=spots.slice(nd),res=[],slots,nums,ok,tries=0;
  var counts=R===2?[4,3,4,4,3]:[6,5,6,6,5];
  counts.forEach(function(c,i){for(var j=0;j<c;j++)res.push(i);});
  var base=[3,4,5,6,8,9,10,11];
  var pool=R===2?NUMS:[2,2,12,12].concat(base,base,base);
  do{
    slots=shuffle(res);nums=shuffle(pool);ok=true;
    var at={};
    rest.forEach(function(p,i){at[p[0]+','+p[1]]=nums[i];});
    rest.forEach(function(p,i){
      if(nums[i]!==6&&nums[i]!==8)return;
      DIRS.forEach(function(d){var nn=at[(p[0]+d[0])+','+(p[1]+d[1])];if(nn===6||nn===8)ok=false;});
    });
    tries++;
  }while(!ok&&tries<800);
  deserts.forEach(function(p){addTile(x,p[0],p[1],-1,null);});
  rest.forEach(function(p,i){addTile(x,p[0],p[1],slots[i],nums[i]);});
  x.bh=deserts[0][0]+','+deserts[0][1];
  var cnt={};
  Object.keys(x.tiles).forEach(function(tk){
    var t=x.tiles[tk],c=hexCenter(t.q,t.r),vs=[];
    for(var kk=0;kk<6;kk++){var a=Math.PI/180*(60*kk-30);vs.push(vkeyOf(c.x+Math.cos(a),c.y+Math.sin(a)));}
    for(var jj=0;jj<6;jj++){var A=vs[jj],B=vs[(jj+1)%6],ek=A<B?A+'|'+B:B+'|'+A;cnt[ek]=(cnt[ek]||0)+1;}
  });
  var coastEdges=Object.keys(x.edges).filter(function(ek){return cnt[ek]===1;});
  var cycle=orderCoastCycle(coastEdges,x);
  if(cycle.length!==coastEdges.length)cycle=shuffle(coastEdges);
  var np=R===2?9:11;
  var types=shuffle(R===2?[-1,-1,-1,-1,0,1,2,3,4]:[-1,-1,-1,-1,-1,-1,0,1,2,3,4]);
  var chosen=pickPortEdges(cycle,Math.min(np,cycle.length));
  x.ports=[];
  chosen.forEach(function(ek,pi){var e=x.edges[ek];x.ports.push({a:e.a,b:e.b,type:types[pi]});});
}
/* walks the coastal edges in true perimeter order so adjacent picks never share a vertex */
function orderCoastCycle(coastEdges,x){
  var byVert={};
  coastEdges.forEach(function(ek){
    var e=x.edges[ek];
    (byVert[e.a]=byVert[e.a]||[]).push(ek);
    (byVert[e.b]=byVert[e.b]||[]).push(ek);
  });
  var visited={},cycle=[];
  if(!coastEdges.length)return cycle;
  var cur=coastEdges[0],enterV=x.edges[cur].a;
  while(cur&&!visited[cur]){
    visited[cur]=true;cycle.push(cur);
    var e=x.edges[cur];
    var exitV=(e.a===enterV)?e.b:e.a;
    var opts=(byVert[exitV]||[]).filter(function(ek){return ek!==cur&&!visited[ek];});
    if(!opts.length)break;
    cur=opts[0];enterV=exitV;
  }
  return cycle;
}
/* picks np edges from the perimeter cycle with a minimum gap, so no two chosen ports ever share a vertex */
function pickPortEdges(cycle,np){
  var n=cycle.length;
  if(n<=0||np<=0)return [];
  var gap=2;
  if(np*(gap+1)>n)gap=1;
  if(np*(gap+1)>n)gap=0;
  var start=rint(n),chosen=[],idx=start;
  for(var i=0;i<np;i++){chosen.push(cycle[idx%n]);idx+=gap+1;}
  return chosen;
}
function portAtMap(x){
  var m={};x.ports.forEach(function(pt){m[pt.a]=pt.type;m[pt.b]=pt.type;});return m;
}
function makeDeck(big){
  var d=[],c=big?[20,3,3,3,5]:[14,2,2,2,5];
  ['gravity','strong','em','planck','fine'].forEach(function(k,j){for(var i=0;i<c[j];i++)d.push(k);});
  return shuffle(d);
}
function newStats(){return {gain:[0,0,0,0,0],steal:[0,0,0,0,0],lost:[0,0,0,0,0],disc:0,bank:0,ptr:0,mono:0,bless:0,rolls:0,sevens:0,robMoves:0,builds:{fil:0,star:0,gal:0},cardsBought:0,cardsPlayed:0,turns:0};}

/* ---------- rules helpers (operate on M.x) ---------- */
function X(){return M.x;}
function count(seat,t){
  var x=X(),n=0;
  if(t==='fil'){Object.keys(x.fil).forEach(function(ek){if(x.fil[ek]===seat)n++;});return n;}
  Object.keys(x.bld).forEach(function(vk){var b=x.bld[vk];if(b.o===seat&&b.t===t)n++;});
  return n;
}
function totalPoints(seat){
  var x=X(),p=x.players[seat],n=0;
  Object.keys(x.bld).forEach(function(vk){var b=x.bld[vk];if(b.o===seat)n+=b.t==='gal'?2:1;});
  if(x.longest===seat)n+=2;
  if(x.dark===seat)n+=2;
  return n+p.cards.fine;
}
function publicPoints(seat){return totalPoints(seat)-X().players[seat].cards.fine;}
function ratio(seat,r){
  var x=X(),best=4;
  x.ports.forEach(function(pt){
    var ba=x.bld[pt.a],bb=x.bld[pt.b];
    if(!((ba&&ba.o===seat)||(bb&&bb.o===seat)))return;
    if(pt.type<0)best=Math.min(best,3);else if(pt.type===r)best=Math.min(best,2);
  });
  return best;
}
function canPay(seat,c){var p=X().players[seat];return c.every(function(n,i){return p.res[i]>=n;});}
function pay(seat,c){var p=X().players[seat];c.forEach(function(n,i){p.res[i]-=n;});}
function touches(seat,vk){
  var x=X(),b=x.bld[vk];
  if(b)return b.o===seat;
  var ok=false;
  x.verts[vk].edges.forEach(function(ek){if(x.fil[ek]===seat)ok=true;});
  return ok;
}
function starSpots(seat,setup){
  var x=X(),out=[];
  Object.keys(x.verts).forEach(function(vk){
    var v=x.verts[vk];
    if(x.bld[vk])return;
    var ok=true;v.adj.forEach(function(n){if(x.bld[n])ok=false;});
    if(!ok)return;
    if(!setup){var conn=false;v.edges.forEach(function(e){if(x.fil[e]===seat)conn=true;});if(!conn)return;}
    out.push(vk);
  });
  return out;
}
function filSpots(seat,fromV){
  var x=X(),out=[];
  Object.keys(x.edges).forEach(function(ek){
    var e=x.edges[ek];
    if(x.fil[ek]!=null)return;
    if(fromV){if(e.a===fromV||e.b===fromV)out.push(ek);return;}
    if(touches(seat,e.a)||touches(seat,e.b))out.push(ek);
  });
  return out;
}
function longest(seat){
  var x=X(),adj={},any=false;
  Object.keys(x.fil).forEach(function(ek){
    if(x.fil[ek]!==seat)return;any=true;
    var e=x.edges[ek];
    [[e.a,e.b],[e.b,e.a]].forEach(function(p){(adj[p[0]]=adj[p[0]]||[]).push({to:p[1],key:ek});});
  });
  if(!any)return 0;
  var best=0,used={};
  function dfs(v,len){
    if(len>best)best=len;
    var b=x.bld[v];
    if(b&&b.o!==seat&&len>0)return;
    var list=adj[v]||[];
    for(var i=0;i<list.length;i++){
      var e=list[i];if(used[e.key])continue;
      used[e.key]=true;dfs(e.to,len+1);delete used[e.key];
    }
  }
  Object.keys(adj).forEach(function(v){dfs(v,0);});
  return best;
}
function updateAwards(){
  var x=X();
  x.lens=x.players.map(function(_,i){return longest(i);});
  var mx=Math.max.apply(null,x.lens),old=x.longest;
  if(mx>=5){
    var c=[];x.lens.forEach(function(l,i){if(l===mx)c.push(i);});
    if(c.indexOf(x.longest)<0)x.longest=c.length===1?c[0]:null;
  }else x.longest=null;
  if(x.longest!==old&&x.longest!==null)addLog(M.names[x.longest]+' بلندترین شبکه را دارد.');
  var dm=Math.max.apply(null,x.players.map(function(p){return p.played;})),od=x.dark;
  if(dm>=3){
    var d=[];x.players.forEach(function(p,i){if(p.played===dm)d.push(i);});
    if(d.indexOf(x.dark)<0)x.dark=d.length===1?d[0]:null;
  }else x.dark=null;
  if(x.dark!==od&&x.dark!==null)addLog(M.names[x.dark]+' بزرگ‌ترین ارتش را دارد.');
}
function addLog(msg){var x=X();x.log.push(msg);if(x.log.length>40)x.log.shift();}
function playable(seat,k){var p=X().players[seat];return k!=='fine'&&p.cards[k]-(p.fresh[k]||0)>0&&!p.playedCard;}

/* ---------- game setup ---------- */
function catInit(){
  var n=M.n,x={};
  x.tiles={};x.verts={};x.edges={};x.bld={};x.fil={};x.ports=[];
  initBoard(x,n);
  x.deck=makeDeck(n>=5);
  x.players=[];
  for(var i=0;i<n;i++)x.players.push({res:[0,0,0,0,0],cards:{gravity:0,strong:0,em:0,planck:0,fine:0},fresh:{},played:0,playedCard:false,stats:newStats()});
  x.round=1;x.phase='order';x.sub=null;x.cur=0;x.dice=null;x.hotNum=null;x.bhBy=null;x.bhRound=0;x.bhN=0;
  x.longest=null;x.dark=null;x.lens=x.players.map(function(){return 0;});
  x.log=[];x.over=false;x.winner=null;x.order=null;x.setup=null;x.dl=0;
  x.discard=null;x.offer=null;x.trade=null;x.pt=null;x.cardTarget=null;
  x.chat=[];x.chatSeq=0; // small ephemeral emote/chat relay, kept server-side so it survives a refresh/reconnect
  M.x=x;
  M.turn=0;
  runOrderPhase();
  beginSetup();
}
function runOrderPhase(){
  var x=X(),n=M.n,ids=[];for(var i=0;i<n;i++)ids.push(i);
  function rank(group,depth){
    var res=[];
    group.forEach(function(seat){
      var a=1+rint(6),b=1+rint(6);
      addLog(M.names[seat]+' تاس ریخت: '+(a+b)+(depth?' (دوباره)':''));
      res.push({id:seat,v:a+b});
    });
    var by={};res.forEach(function(r){(by[r.v]=by[r.v]||[]).push(r.id);});
    var vs=Object.keys(by).map(Number).sort(function(p,q){return q-p;}),out=[];
    for(var j=0;j<vs.length;j++){
      var g=by[vs[j]];
      if(g.length===1)out.push(g[0]);
      else{
        addLog('مساوی شد؛ دوباره تاس می‌ریزند.');
        out=out.concat(rank(g,depth+1));
      }
    }
    return out;
  }
  x.order=rank(ids,0);
  addLog('ترتیب بازی: '+x.order.map(function(id){return M.names[id];}).join(' ← '));
}
function beginSetup(){
  var x=X(),n=M.n,ord=x.order.slice(),seq=ord.concat(ord.slice().reverse());
  x.phase='setup';x.setup={seq:seq,idx:0};
  x.cur=seq[0];M.turn=seq[0];
  armTurn();
}
function armTurn(){X().dl=M.tmr?now()+TURN_MS:0;}
function setupSecond(seq,idx,n){return idx>=n;}

/* ---------- production / 7-roll / robber ---------- */
function produce(n){
  var x=X();x.hotNum=n;
  var gain=x.players.map(function(){return [0,0,0,0,0];}),blocked=false;
  Object.keys(x.tiles).forEach(function(tk){
    var t=x.tiles[tk];
    if(t.num===n&&t.slot>=0&&x.bh===tk)blocked=true;
  });
  Object.keys(x.tiles).forEach(function(tk){
    var t=x.tiles[tk];
    if(t.num!==n||t.slot<0||x.bh===tk)return;
    var r=tileRes(t);
    t_verts(t).forEach(function(vk){var b=x.bld[vk];if(b)gain[b.o][r]+=b.t==='gal'?2:1;});
  });
  var any=false;
  x.players.forEach(function(p,i){
    var g=gain[i];
    if(sum(g)){any=true;g.forEach(function(c,k){p.res[k]+=c;p.stats.gain[k]+=c;});}
  });
  if(!any)addLog(blocked?'خرابی جلوی تولید را گرفت.':'این بار کسی چیزی نگرفت.');
}
function t_verts(t){
  // vertices of a tile, recomputed from its key since we didn't store them on the tile object
  var x=X(),c=hexCenter(t.q,t.r),vs=[];
  for(var k=0;k<6;k++){var a=Math.PI/180*(60*k-30);vs.push(vkeyOf(c.x+Math.cos(a),c.y+Math.sin(a)));}
  return vs;
}
function beginDiscardOrRobber(seat){
  var x=X(),need=[];
  x.players.forEach(function(p,i){if(sum(p.res)>7)need.push(i);});
  if(need.length){
    var amt={};need.forEach(function(i){amt[i]=Math.floor(sum(x.players[i].res)/2);});
    x.discard={need:need,amt:amt,done:{},dl:now()+DISCARD_MS};
    x.sub='discard';
    addLog('قطعی برق! هر کس بیش از ۷ قطعه دارد نیمی را از دست می‌دهد.');
  }else beginRobberMove(seat);
}
function finishDiscardIfDone(seat){
  var x=X();
  if(x.discard.need.every(function(i){return x.discard.done[i];})){
    x.discard=null;
    beginRobberMove(seat);
  }
}
function beginRobberMove(seat){
  var x=X();
  x.cardTarget={kind:'tile',seat:seat};
  x.sub='cardTarget';
}
function victimsOnTile(tk,seat){
  var x=X(),t=x.tiles[tk],vic=[];
  t_verts(t).forEach(function(vk){var b=x.bld[vk];if(b&&b.o!==seat&&sum(x.players[b.o].res)>0&&vic.indexOf(b.o)<0)vic.push(b.o);});
  return vic;
}
function doRobberMove(seat,tk){
  var x=X();
  x.bh=tk;x.players[seat].stats.robMoves++;x.bhBy=seat;x.bhRound=x.round;x.bhN=(x.bhN||0)+1;
  addLog(M.names[seat]+' خرابی را به کاشی دیگری برد.');
  var vic=victimsOnTile(tk,seat);
  if(!vic.length){x.cardTarget=null;x.sub='main';return;}
  if(vic.length===1){stealFrom(seat,vic[0]);x.cardTarget=null;x.sub='main';return;}
  x.cardTarget={kind:'victim',seat:seat,opts:vic};
}
function stealFrom(seat,vid){
  var x=X(),v=x.players[vid],p=x.players[seat],pool=[];
  v.res.forEach(function(n,i){for(var j=0;j<n;j++)pool.push(i);});
  if(!pool.length)return;
  var r=pick(pool);v.res[r]--;p.res[r]++;p.stats.steal[r]++;v.stats.lost[r]++;
  addLog(M.names[seat]+' یک قطعه از '+M.names[vid]+' دزدید.');
}

/* ---------- build / cards / trade ---------- */
function doBuild(seat,kind,key,free){
  var x=X(),p=x.players[seat];
  if(p.stats.builds[kind]!==undefined)p.stats.builds[kind]++;
  if(kind==='fil'){if(!free)pay(seat,COST.fil);x.fil[key]=seat;addLog(M.names[seat]+' کابل شبکه کشید.');}
  else if(kind==='star'){pay(seat,COST.star);x.bld[key]={o:seat,t:'star'};addLog(M.names[seat]+' یک درایو نصب کرد.');}
  else if(kind==='gal'){pay(seat,COST.gal);x.bld[key].t='gal';addLog(M.names[seat]+' درایو را به تابلو فرمان ارتقا داد.');}
  updateAwards();
  checkWin();
}
function buyCard(seat){
  var x=X(),p=x.players[seat];
  pay(seat,COST.buy);
  var c=x.deck.pop();
  p.cards[c]++;p.stats.cardsBought++;p.fresh[c]=(p.fresh[c]||0)+1;
  addLog(M.names[seat]+' یک کارت برداشت.');
  checkWin();
}
function doBank(seat,give,get){
  var x=X(),p=x.players[seat];
  if(!(give>=0&&give<5&&get>=0&&get<5&&give!==get))return false;
  var r=ratio(seat,give);
  if(p.res[give]<r)return false;
  p.res[give]-=r;p.res[get]++;p.stats.bank++;
  addLog(M.names[seat]+' برون‌سپاری کرد.');
  return true;
}
function checkWin(){
  var x=X();
  if(x.over)return true;
  if(x.phase==='play'&&totalPoints(x.cur)>=WIN){
    x.over=true;x.winner=x.cur;M.over=true;M.res=x.cur;
    if(!M.wins)M.wins=X().players.map(function(){return 0;});
    M.wins[x.cur]=(M.wins[x.cur]||0)+1;
    addLog(M.names[x.cur]+' برنده شد!');
    return true;
  }
  return false;
}
function nextTurn(){
  var x=X(),ord=x.order,i=ord.indexOf(x.cur);
  var ni=(i+1)%ord.length;
  if(ni===0)x.round++;
  x.cur=ord[ni];M.turn=x.cur;
  var p=x.players[x.cur];p.fresh={};p.playedCard=false;x.hotNum=null;p.stats.turns++;
  x.sub='roll';x.dice=null;
  doRoll(x.cur); // dice roll automatically as soon as it becomes a player's turn
  if(x.round>60){ // safety valve identical in spirit to the client's round>60 draw-by-points
    var best=0,bp=-1;x.players.forEach(function(_,i2){var pt=totalPoints(i2);if(pt>bp){bp=pt;best=i2;}});
    x.over=true;x.winner=best;M.over=true;M.res=best;
    if(!M.wins)M.wins=x.players.map(function(){return 0;});
    M.wins[best]=(M.wins[best]||0)+1;
  }
  armTurn();
}

/* ---------- player (human or AI) actions, called by catAct ---------- */
function setupPlace(seat,key){
  var x=X(),st=x.setup;
  if(!st||x.cur!==seat)return false;
  if(st.stage!=='road'){
    if(starSpots(seat,true).indexOf(key)<0)return false;
    x.bld[key]={o:seat,t:'star'};
    var second=st.idx>=M.n;
    if(second){x.verts[key].tiles.forEach(function(tk){var t=x.tiles[tk],r=tileRes(t);if(r>=0)x.players[seat].res[r]++;});}
    st.stage='road';st.houseV=key;
    var left=x.dl-now();if(left<5000)x.dl=now()+5000;
    addLog(M.names[seat]+' '+(second?'درایو دوم':'درایو نخست')+' را گذاشت.');
    return true;
  }
  if(filSpots(seat,st.houseV).indexOf(key)<0)return false;
  x.fil[key]=seat;
  updateAwards();
  addLog(M.names[seat]+' یک کابل شبکه کنار درایو کشید.');
  advanceSetup();
  return true;
}
function advanceSetup(){
  var x=X(),st=x.setup;
  st.idx++;
  if(st.idx>=st.seq.length){
    x.setup=null;x.phase='play';x.cur=x.order[0];M.turn=x.cur;
    var p=x.players[x.cur];p.stats.turns++;
    x.sub='roll';
    armTurn();
    doRoll(x.cur); // dice roll automatically for the very first turn too
    return;
  }
  x.cur=st.seq[st.idx];M.turn=x.cur;st.stage='house';st.houseV=null;
  armTurn();
}
function doRoll(seat){
  var x=X();
  if(x.phase!=='play'||x.sub!=='roll'||x.cur!==seat)return false;
  var d1=1+rint(6),d2=1+rint(6),n=d1+d2;
  x.dice=[d1,d2];x.players[seat].stats.rolls++;if(n===7)x.players[seat].stats.sevens++;
  addLog(M.names[seat]+' تاس ریخت: '+n);
  if(n===7){beginDiscardOrRobber(seat);}
  else{produce(n);x.sub='main';}
  return true;
}
function doEnd(seat){
  var x=X();
  if(x.phase!=='play'||x.cur!==seat)return false;
  if(x.sub==='tradeWait'&&x.trade&&x.trade.from===seat){x.trade=null;x.pt=null;x.sub='main';}
  if(x.sub!=='main')return false;
  nextTurn();
  return true;
}
function doDiscard(seat,sel){
  var x=X(),d=x.discard;
  if(!d||d.done[seat]||d.need.indexOf(seat)<0)return false;
  var need=d.amt[seat],p=x.players[seat];
  if(!Array.isArray(sel)||sel.length!==5)return false;
  var t=0;for(var i=0;i<5;i++){if(typeof sel[i]!=='number'||sel[i]<0||sel[i]>p.res[i])return false;t+=sel[i];}
  if(t!==need)return false;
  sel.forEach(function(c,j){p.res[j]-=c;});
  p.stats.disc+=need;d.done[seat]=true;
  addLog(M.names[seat]+' '+need+' قطعه را از دست داد.');
  finishDiscardIfDone(x.cur);
  return true;
}
function doPlayCard(seat,type){
  var x=X(),p=x.players[seat];
  if(x.phase!=='play'||x.sub!=='main'||x.cur!==seat)return false;
  if(CARD_KINDS.indexOf(type)<0||!playable(seat,type))return false;
  p.cards[type]--;p.playedCard=true;p.stats.cardsPlayed++;
  if(type==='gravity'){
    p.played++;addLog(M.names[seat]+' یک سرباز بازی کرد.');
    updateAwards();
    x.sub='cardTarget';x.cardTarget={kind:'tile',seat:seat,soldier:true};
  }else if(type==='strong'){
    x.sub='cardTarget';x.cardTarget={kind:'edge',seat:seat,need:2,got:0};
    addLog(M.names[seat]+' ساخت راه را بازی کرد.');
  }else if(type==='em'){
    x.sub='cardTarget';x.cardTarget={kind:'pick2',seat:seat};
    addLog(M.names[seat]+' برکت را بازی کرد.');
  }else if(type==='planck'){
    x.sub='cardTarget';x.cardTarget={kind:'mono',seat:seat};
    addLog(M.names[seat]+' انحصار را بازی کرد.');
  }
  checkWin();
  return true;
}
function resolveTarget(seat,key){ // edge/tile picks
  var x=X(),ct=x.cardTarget;
  if(!ct||ct.seat!==seat)return false;
  if(ct.kind==='edge'){
    if(count(seat,'fil')>=LIM.fil)return endCardTarget();
    if(filSpots(seat).indexOf(key)<0)return false;
    doBuild(seat,'fil',key,true);
    ct.got++;
    if(ct.got>=ct.need||count(seat,'fil')>=LIM.fil||!filSpots(seat).length)return endCardTarget();
    return true;
  }
  if(ct.kind==='tile'){
    var opts=Object.keys(x.tiles).filter(function(k){return k!==x.bh;});
    if(opts.indexOf(key)<0)return false;
    doRobberMove(seat,key);
    return true;
  }
  return false;
}
function resolveChoose(seat,value){
  var x=X(),ct=x.cardTarget;
  if(!ct||ct.seat!==seat)return false;
  if(ct.kind==='victim'){
    if(ct.opts.indexOf(value)<0)return false;
    stealFrom(seat,value);
    return endCardTarget();
  }
  if(ct.kind==='mono'){
    if(typeof value!=='number'||value<0||value>4)return false;
    var got=0;x.players.forEach(function(q,i){if(i!==seat){got+=q.res[value];q.res[value]=0;}});
    x.players[seat].res[value]+=got;x.players[seat].stats.mono+=got;
    addLog(M.names[seat]+' با انحصار '+got+' قطعه گرفت.');
    return endCardTarget();
  }
  return false;
}
function resolvePick(seat,sel){
  var x=X(),ct=x.cardTarget;
  if(!ct||ct.seat!==seat||ct.kind!=='pick2')return false;
  if(!Array.isArray(sel)||sel.length!==5)return false;
  var t=0;for(var i=0;i<5;i++){if(typeof sel[i]!=='number'||sel[i]<0)return false;t+=sel[i];}
  if(t!==2)return false;
  sel.forEach(function(n,i){x.players[seat].res[i]+=n;});
  x.players[seat].stats.bless+=2;
  addLog(M.names[seat]+' برکت را گرفت.');
  return endCardTarget();
}
function endCardTarget(){
  var x=X();x.cardTarget=null;x.sub='main';checkWin();return true;
}
function doBuildCmd(seat,kind,key){
  var x=X();
  if(x.phase!=='play'||x.sub!=='main'||x.cur!==seat)return false;
  if(kind==='buy'){if(!canPay(seat,COST.buy)||!x.deck.length)return false;buyCard(seat);return true;}
  if(kind==='fil'){if(!canPay(seat,COST.fil)||count(seat,'fil')>=LIM.fil||filSpots(seat).indexOf(key)<0)return false;doBuild(seat,'fil',key,false);return true;}
  if(kind==='star'){if(!canPay(seat,COST.star)||count(seat,'star')>=LIM.star||starSpots(seat,false).indexOf(key)<0)return false;doBuild(seat,'star',key,false);return true;}
  if(kind==='gal'){var b=x.bld[key];if(!canPay(seat,COST.gal)||count(seat,'gal')>=LIM.gal||!b||b.o!==seat||b.t!=='star')return false;doBuild(seat,'gal',key,false);return true;}
  return false;
}
function doBankCmd(seat,give,get){
  var x=X();
  if(x.phase!=='play'||x.sub!=='main'||x.cur!==seat)return false;
  return doBank(seat,give,get);
}
function doPtradePropose(seat,give,get){
  var x=X();
  if(x.phase!=='play'||x.sub!=='main'||x.cur!==seat)return false;
  if(!Array.isArray(give)||!Array.isArray(get)||give.length!==5||get.length!==5)return false;
  if(sum(give)<1||sum(get)<1)return false;
  for(var i=0;i<5;i++){if(give[i]>x.players[seat].res[i]||(give[i]>0&&get[i]>0))return false;}
  var results={},pendingHumans=[];
  for(var q=0;q<M.n;q++){
    if(q===seat)continue;
    var canAfford=true;for(var k=0;k<5;k++)if(x.players[q].res[k]<get[k])canAfford=false;
    if(!canAfford){results[q]=null;continue;}
    if(M.ai[q]){results[q]=aiAccepts(q,give,get,seat);continue;}
    pendingHumans.push(q);
  }
  x.pt={give:give,get:get,results:results};
  if(pendingHumans.length){x.trade={from:seat,give:give,get:get,pending:pendingHumans,dl:now()+TRADE_MS};x.sub='tradeWait';}
  return true;
}
function doPtradeRespond(seat,ok){
  var x=X(),t=x.trade;
  if(!t||t.pending.indexOf(seat)<0)return false;
  x.pt.results[seat]=!!ok;
  t.pending=t.pending.filter(function(s){return s!==seat;});
  if(!t.pending.length){x.trade=null;x.sub='main';}
  return true;
}
function doPtradeExec(seat,withSeat){
  var x=X(),pt=x.pt;
  if(x.phase!=='play'||x.sub!=='main'||x.cur!==seat)return false;
  if(!pt||pt.results[withSeat]!==true)return false;
  var p=x.players[seat],q=x.players[withSeat];
  for(var i=0;i<5;i++){if(p.res[i]<pt.give[i]||q.res[i]<pt.get[i])return false;}
  for(var j=0;j<5;j++){p.res[j]+=pt.get[j]-pt.give[j];q.res[j]+=pt.give[j]-pt.get[j];}
  p.stats.ptr++;q.stats.ptr++;
  addLog(M.names[seat]+' با '+M.names[withSeat]+' معامله کرد.');
  x.pt=null;
  return true;
}
function doChat(seat,k,i,r){
  var x=X();
  if(['t','m','w','h','o'].indexOf(k)<0)return false;
  i=i|0;r=r|0;if(i<0||i>20||r<0||r>4)return false;
  x.chatSeq++;x.chat.push({from:seat,k:k,i:i,r:r,id:x.chatSeq});
  if(x.chat.length>30)x.chat.shift();
  return true;
}
function doOfferRespond(seat,ok){
  var x=X(),o=x.offer;
  if(!o||o.target!==seat)return false;
  if(ok&&x.players[seat].res[o.want]>=1&&x.players[o.ai].res[o.give]>=1){
    x.players[seat].res[o.want]--;x.players[o.ai].res[o.want]++;
    x.players[o.ai].res[o.give]--;x.players[seat].res[o.give]++;
    addLog(M.names[seat]+' با '+M.names[o.ai]+' معامله کرد.');
  }
  x.offer=null;x.sub='main';
  return true;
}

/* ---------- dispatch ---------- */
function catAct(seat,kind,m){
  if(kind!=='cat'||!m||typeof m!=='object'||M.over)return false;
  var a=m.a,x=X();
  if(a==='roll')return x.cur===seat&&doRoll(seat);
  if(a==='end')return x.cur===seat&&doEnd(seat);
  if(a==='build')return doBuildCmd(seat,m.k,m.key);
  if(a==='bank')return doBankCmd(seat,+m.give,+m.get);
  if(a==='play')return doPlayCard(seat,m.type);
  if(a==='target')return resolveTarget(seat,m.key);
  if(a==='choose')return resolveChoose(seat,m.value);
  if(a==='pick'){
    if(x.sub==='discard')return doDiscard(seat,m.sel);
    if(x.cardTarget&&x.cardTarget.kind==='pick2')return resolvePick(seat,m.sel);
    return false;
  }
  if(a==='setup')return setupPlace(seat,m.key);
  if(a==='ptrade')return doPtradePropose(seat,m.give,m.get);
  if(a==='ptradeResp')return doPtradeRespond(seat,m.ok);
  if(a==='ptradeWith')return doPtradeExec(seat,+m.id);
  if(a==='offerResp')return doOfferRespond(seat,m.ok);
  if(a==='chat')return doChat(seat,m.k,m.i,m.r);
  return false;
}

/* ---------- AI (ported from online.html's pips/vertexScore/bestOf/aiSetupStar/aiSetupFil/
   aiPickFil/aiGoal/aiNeeded/aiPlanck/aiBHTile/aiTrade/aiAccepts/aiCard/aiAct/aiOffer) ---------- */
function pips(n){return n?6-Math.abs(7-n):0;}
function vertexScore(vk){
  var x=X(),v=x.verts[vk],s=0,seen={};
  v.tiles.forEach(function(tk){
    var t=x.tiles[tk];if(t.slot<0)return;
    s+=pips(t.num)*(x.bh===tk?0.3:1);seen[tileRes(t)]=true;
  });
  return s+Object.keys(seen).length*1.8+(v.tiles.length===3?0.5:0)+(portAtMap(x)[vk]!=null?1.2:0);
}
function bestOf(arr,fn){
  var b=null,bs=-1e9;
  arr.forEach(function(it){var s=fn(it)+Math.random()*AK().noise;if(s>bs){bs=s;b=it;}});
  return b;
}
function aiSetupStar(seat){return bestOf(starSpots(seat,true),vertexScore);}
function aiSetupFil(seat,vk){
  var x=X(),sp=filSpots(seat,vk);
  return bestOf(sp,function(ek){
    var e=x.edges[ek],o=e.a===vk?e.b:e.a,ok=!x.bld[o],adjB=false;
    x.verts[o].adj.forEach(function(n){if(x.bld[n])adjB=true;});
    return (ok&&!adjB)?vertexScore(o):1;
  });
}
function aiPickFil(seat,spots){
  var x=X();
  return bestOf(spots,function(ek){
    var e=x.edges[ek],best=0;
    [e.a,e.b].forEach(function(vk){
      if(x.bld[vk])return;
      var adjB=false;x.verts[vk].adj.forEach(function(n){if(x.bld[n])adjB=true;});
      var sc=adjB?vertexScore(vk)*0.15:vertexScore(vk)+3;
      if(sc>best)best=sc;
    });
    return best;
  });
}
function aiGoal(seat){
  var stars=count(seat,'star');
  if(stars<LIM.star&&starSpots(seat,false).length)return COST.star;
  if(stars>0&&count(seat,'gal')<LIM.gal)return COST.gal;
  return COST.buy;
}
function aiNeeded(seat,n){
  var p=X().players[seat],goal=aiGoal(seat),need=goal.map(function(c,i){return Math.max(0,c-p.res[i]);}),out=[0,0,0,0,0];
  for(var k=0;k<n;k++){
    var i=argmax(need);
    if(need[i]<=0)i=rint(5);
    out[i]++;need[i]=Math.max(0,need[i]-1);
  }
  return out;
}
function aiPlanck(seat){
  var x=X(),best=0,bs=-1;
  for(var r=0;r<5;r++){var t=0;x.players.forEach(function(q,i){if(i!==seat)t+=q.res[r];});if(t>bs){bs=t;best=r;}}
  return best;
}
function aiBHTile(seat,opts){
  var x=X();
  if(DIFF===0&&Math.random()<.4)return pick(opts);
  return bestOf(opts,function(tk){
    var t=x.tiles[tk],sc=0;
    if(t.slot<0)return -5;
    t_verts(t).forEach(function(vk){
      var b=x.bld[vk];if(!b)return;
      var w=pips(t.num)*(b.t==='gal'?2:1);
      sc+=b.o===seat?-w*1.6:w*(1+AK().bh*publicPoints(b.o)/12);
    });
    return sc;
  });
}
function aiTrade(seat){
  var x=X(),p=x.players[seat],goal=aiGoal(seat),want=-1,i;
  for(i=0;i<5;i++)if(goal[i]>p.res[i]){want=i;break;}
  if(want<0)return false;
  var best=-1,br=9;
  for(var j=0;j<5;j++){
    var r=ratio(seat,j);
    if(j!==want&&p.res[j]-goal[j]>=r&&r<br){br=r;best=j;}
  }
  if(best<0)return false;
  p.res[best]-=br;p.res[want]++;
  addLog(M.names[seat]+' برون‌سپاری کرد.');
  return true;
}
function aiAccepts(seat,give,get,fromSeat){
  var x=X(),q=x.players[seat],h=x.players[fromSeat],gi=sum(give),go=sum(get),i;
  if(gi<1||go<1)return false;
  for(i=0;i<5;i++){if(q.res[i]<get[i])return false;if(give[i]>0&&get[i]>0)return false;}
  if(totalPoints(fromSeat)>=WIN-(DIFF===2?4:2))return false;
  var goal=aiGoal(seat),useful=false;
  for(i=0;i<5;i++){if(get[i]>0&&q.res[i]-get[i]<goal[i])return false;if(give[i]>0&&q.res[i]<goal[i])useful=true;}
  if(DIFF!==0&&!((gi>=go&&useful)||gi>go))return false;
  return rint(10)<9;
}
function aiCard(seat){
  var x=X(),p=x.players[seat],kinds=['gravity','strong','em','planck'];
  for(var i=0;i<kinds.length;i++){
    var k=kinds[i];
    if(!playable(seat,k))continue;
    if(k==='strong'&&(count(seat,'fil')>LIM.fil-2||filSpots(seat).length<1))continue;
    if(k==='planck'){var r=aiPlanck(seat),t=0;x.players.forEach(function(q,j){if(j!==seat)t+=q.res[r];});if(t<3)continue;}
    if(k==='em'&&sum(p.res)>8)continue;
    return k;
  }
  return null;
}
function aiActOnce(seat){ // one atomic action during the AI's main phase; returns true if it acted
  var x=X(),p=x.players[seat];
  if(Math.random()>AK().act)return false;
  var stars=count(seat,'star'),gals=count(seat,'gal'),fils=count(seat,'fil');
  var ss=starSpots(seat,false);
  if(stars<LIM.star&&ss.length&&canPay(seat,COST.star)){doBuild(seat,'star',bestOf(ss,vertexScore));return true;}
  if(gals<LIM.gal&&stars>0&&canPay(seat,COST.gal)){
    var mine=[];Object.keys(x.bld).forEach(function(vk){if(x.bld[vk].o===seat&&x.bld[vk].t==='star')mine.push(vk);});
    doBuild(seat,'gal',bestOf(mine,vertexScore));return true;
  }
  if(x.deck.length&&canPay(seat,COST.buy)&&Math.random()<AK().card){buyCard(seat);return true;}
  var ck=aiCard(seat);
  if(ck&&Math.random()<AK().card){doPlayCard(seat,ck);return true;}
  if(fils<LIM.fil&&canPay(seat,COST.fil)&&(ss.length===0||sum(p.res)>=7)){
    var sp=filSpots(seat);
    if(sp.length){doBuild(seat,'fil',aiPickFil(seat,sp));return true;}
  }
  if(Math.random()<AK().trade&&aiTrade(seat))return true;
  return false;
}
function aiMaybeOffer(seat){
  var x=X();
  if(rint(100)>=AK().offer)return false;
  var humans=[];for(var i=0;i<M.n;i++)if(!M.ai[i])humans.push(i);
  if(!humans.length)return false;
  var p=x.players[seat],goal=aiGoal(seat),want=-1,give=-1,i2;
  for(i2=0;i2<5;i2++)if(goal[i2]>p.res[i2]){want=i2;break;}
  if(want<0)return false;
  var holders=humans.filter(function(q){return x.players[q].res[want]>=1;});
  if(!holders.length)return false;
  var h=pick(holders);
  for(i2=0;i2<5;i2++)if(i2!==want&&p.res[i2]-goal[i2]>=1){give=i2;break;}
  if(give<0)return false;
  x.offer={ai:seat,target:h,want:want,give:give,dl:now()+OFFER_MS};
  x.sub='offerWait';
  return true;
}

/* ---------- server-driven stepping (replaces the client's sleep()-based aiTurn/mainLoop) ---------- */
function catNeed(){
  var x=X();
  if(x.over)return -1;
  if(x.discard){
    var i=x.discard.need.find(function(s){return !x.discard.done[s]&&M.ai[s];});
    return i===undefined?-1:i;
  }
  if(x.offer){return M.ai[x.offer.target]?x.offer.target:-1;}
  if(x.trade){
    var j=x.trade.pending.find(function(s){return M.ai[s];});
    return j===undefined?-1:j;
  }
  if(x.phase==='setup')return M.ai[x.cur]?x.cur:-1;
  if(x.phase==='play')return M.ai[x.cur]?x.cur:-1;
  return -1;
}
function catAiStep(seat){
  var x=X();
  if(x.discard&&x.discard.need.indexOf(seat)>=0&&!x.discard.done[seat]){
    var p=x.players[seat],need=x.discard.amt[seat],sel=[0,0,0,0,0],left=need;
    var tmp=p.res.slice();
    while(left>0){var i=argmax(tmp);if(tmp[i]<=0)break;tmp[i]--;sel[i]++;left--;}
    doDiscard(seat,sel);
    return;
  }
  if(x.offer&&x.offer.target===seat){doOfferRespond(seat,false);return;} // AI never ends up as an offer target in practice (offers only target humans), but resolved safely if it ever does via disconnection substitution
  if(x.trade&&x.trade.pending.indexOf(seat)>=0){doPtradeRespond(seat,aiAccepts(seat,x.trade.give,x.trade.get,x.trade.from));return;}
  if(x.phase==='setup'&&x.cur===seat){
    var st=x.setup;
    if(st.stage!=='road'){setupPlace(seat,aiSetupStar(seat));}
    else{setupPlace(seat,aiSetupFil(seat,st.houseV));}
    return;
  }
  if(x.phase!=='play'||x.cur!==seat)return;
  if(x.cardTarget&&x.cardTarget.seat===seat){
    var ct=x.cardTarget;
    if(ct.kind==='edge'){resolveTarget(seat,aiPickFil(seat,filSpots(seat)));return;}
    if(ct.kind==='tile'){
      var opts=Object.keys(x.tiles).filter(function(k){return k!==x.bh;});
      resolveTarget(seat,aiBHTile(seat,opts));return;
    }
    if(ct.kind==='victim'){resolveChoose(seat,ct.opts.sort(function(a,b){return publicPoints(b)-publicPoints(a);})[0]);return;}
    if(ct.kind==='mono'){resolveChoose(seat,aiPlanck(seat));return;}
    if(ct.kind==='pick2'){resolvePick(seat,aiNeeded(seat,2));return;}
    return;
  }
  if(x.sub==='roll'){doRoll(seat);return;}
  if(x.sub==='main'){
    if(aiMaybeOffer(seat))return;
    if(aiActOnce(seat))return;
    doEnd(seat);
    return;
  }
}

/* ---------- timers ---------- */
function catTimers(){
  var x=X();
  if(!x||M.over||!M.tmr)return false;
  var ch=false;
  if(x.discard&&x.discard.dl&&now()>=x.discard.dl){
    var d0=x.discard;
    d0.need.forEach(function(s){
      if(!x.discard||d0.done[s])return; // x.discard may already have been cleared by an earlier iteration
      var p=x.players[s],need=d0.amt[s],sel=[0,0,0,0,0],left=need,tmp=p.res.slice();
      while(left>0){var i=argmax(tmp);if(tmp[i]<=0)break;tmp[i]--;sel[i]++;left--;}
      doDiscard(s,sel);
    });
    ch=true;
  }
  if(x.offer&&x.offer.dl&&now()>=x.offer.dl){doOfferRespond(x.offer.target,false);ch=true;}
  if(x.trade&&x.trade.dl&&now()>=x.trade.dl){
    x.trade.pending.slice().forEach(function(s){doPtradeRespond(s,false);});
    ch=true;
  }
  if(x.dl&&now()>=x.dl){
    x.dl=0;
    var seat=x.cur;
    if(x.phase==='setup'){
      var st=x.setup;
      if(st.stage!=='road')setupPlace(seat,pick(starSpots(seat,true)));
      else setupPlace(seat,pick(filSpots(seat,st.houseV)));
    }else if(x.cardTarget&&x.cardTarget.seat===seat){
      var ct=x.cardTarget;
      if(ct.kind==='edge')endCardTarget();
      else if(ct.kind==='tile'){var opts=Object.keys(x.tiles).filter(function(k){return k!==x.bh;});doRobberMove(seat,pick(opts));}
      else if(ct.kind==='victim')resolveChoose(seat,ct.opts[0]);
      else if(ct.kind==='mono')resolveChoose(seat,0);
      else if(ct.kind==='pick2')resolvePick(seat,[2,0,0,0,0]);
    }else if(x.sub==='roll')doRoll(seat);
    else if(x.sub==='main')doEnd(seat);
    ch=true;
  }
  return ch;
}
function catArm(){armTurn();}

/* ---------- views ---------- */
function catView(seat){
  var x=X(),over=x.over;
  return {
    round:x.round,cur:x.cur,phase:x.phase,sub:x.sub,dice:x.dice,hotNum:x.hotNum,bh:x.bh,bhBy:x.bhBy,bhRound:x.bhRound,bhN:x.bhN,R:x.R,
    longest:x.longest,dark:x.dark,lens:x.lens,over:x.over,winner:x.winner,deckN:x.deck.length,
    log:x.log.slice(-6),chat:x.chat.slice(-8),
    tiles:Object.keys(x.tiles).map(function(k){var t=x.tiles[k];return [t.q,t.r,t.slot,t.num];}),
    ports:x.ports,
    bld:Object.keys(x.bld).map(function(k){return [k,x.bld[k].o,x.bld[k].t];}),
    fil:Object.keys(x.fil).map(function(k){return [k,x.fil[k]];}),
    setup:x.setup?{stage:x.setup.stage,houseV:x.setup.houseV}:null,
    cardTarget:x.cardTarget,discard:x.discard?{need:x.discard.need,amt:x.discard.amt,done:x.discard.done}:null,
    offer:x.offer,trade:x.trade?{from:x.trade.from,give:x.trade.give,get:x.trade.get,pending:x.trade.pending}:null,
    pt:x.pt,
    tl:x.dl?Math.max(0,x.dl-now()):0,
    players:x.players.map(function(p,i){
      var own=i===seat;
      return {id:i,res:own?p.res.slice():[sum(p.res),0,0,0,0],
        cards:(own||over)?{gravity:p.cards.gravity,strong:p.cards.strong,em:p.cards.em,planck:p.cards.planck,fine:p.cards.fine}:{gravity:0,strong:0,em:0,planck:0,fine:0},
        fresh:own?p.fresh:{},stats:p.stats,played:p.played,playedCard:own?p.playedCard:false,
        pts:own||over?totalPoints(i):publicPoints(i)};
    })
  };
}
function stInit(){M.st={t0:Date.now()};}
function mgReport(){
  var x=X(),n=M.n,rows=[];
  function all(f){var a=[];for(var i=0;i<n;i++)a.push(f(i));return a;}
  function row(l,v,h){rows.push({l:l,v:v,h:h||0});}
  function sec(l){rows.push({l:l,v:null});}
  sec('خلاصه');
  row('نتیجه',all(function(i){return M.res===i?'برد':'باخت';}));
  sec('سیطره کتان');
  row('امتیاز',all(function(i){return totalPoints(i);}),1);
  row('درایو',all(function(i){return count(i,'star');}));
  row('تابلو فرمان',all(function(i){return count(i,'gal');}));
  row('کابل شبکه',all(function(i){return count(i,'fil');}));
  row('کارت بازی‌شده',all(function(i){return x.players[i].stats.cardsPlayed;}));
  return {v:1,id:'catan',g:'سیطره کتان',t:Date.now(),n:n,names:M.names.slice(0,n),ai:M.ai.slice(0,n),res:M.res,rows:rows,sum:[],rn:M.rn};
}
return {get M(){return M;},set M(v){M=v;},catInit:catInit,catAct:catAct,catNeed:catNeed,catAiStep:catAiStep,
  catTimers:catTimers,catArm:catArm,catView:catView,mgReport:mgReport,stInit:stInit,
  setClock:function(f){clockFn=f;},setDiff:function(d){DIFF=d;},
  _internals:{totalPoints:totalPoints,count:count,starSpots:starSpots,filSpots:filSpots,longest:longest,WIN:WIN,COST:COST,LIM:LIM}};
}
