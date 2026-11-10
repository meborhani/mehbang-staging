// Azul server engine: same createEngine(env)/setClock shape as cat_engine.mjs, with the
// tile-drafting rules (factory offers, wall placement, adjacency scoring, floor penalties,
// end-game bonus) ported faithfully from the existing client-authoritative games/azul/index.html
// (COLORS/PEN/wallColor/legal/opts/groups/begin/take/finishRound/botMove), so the server computes
// the exact same result the browser host used to.
const PEN=[1,1,2,2,2,3,3];
const TURN_MS=60000;

function rnd(rng,n){return Math.floor((rng?rng():Math.random())*n);}
const wallColor=(r,c)=>(r+c)%5;
function legal(p,c,r){return p.lines[r].length<r+1&&(p.lines[r].length===0||p.lines[r][0]===c)&&!p.wall[r].includes(c);}
function opts(p,c){return [0,1,2,3,4].filter(r=>legal(p,c,r));}
function neighbors(w,r,c,dr,dc){let n=0;for(let i=r+dr,j=c+dc;i>=0&&i<5&&j>=0&&j<5&&w[i][j]!==null;i+=dr,j+=dc)n++;return n;}
function wallPoints(w,r,c){const h=1+neighbors(w,r,c,0,1)+neighbors(w,r,c,0,-1),v=1+neighbors(w,r,c,1,0)+neighbors(w,r,c,-1,0);return (h>1?h:0)+(v>1?v:0)+(h===1&&v===1?1:0);}
function bonus(p){let n=0;for(let i=0;i<5;i++){if(p.wall[i].every(v=>v!==null))n+=2;if(p.wall.every(row=>row[i]!==null))n+=7;}for(let c=0;c<5;c++)if(p.wall.every(row=>row.includes(c)))n+=10;return n;}
function board(){return {lines:[[],[],[],[],[]],wall:Array.from({length:5},()=>Array(5).fill(null)),floor:[],score:0};}

export function createEngine(env){
  env=env||{};
  let clock=()=>Date.now();
  const E={M:null};
  E.setClock=fn=>{clock=fn;};
  E.stInit=()=>{};

  function draw(x,rng){if(!x.bag.length&&x.discard.length)x.bag=x.discard.splice(0);if(!x.bag.length)return null;const i=rng?Math.floor(rng()*x.bag.length):rnd(rng,x.bag.length);return x.bag.splice(i,1)[0];}
  function refill(x,rng){
    const count=2*E.M.n+1;
    x.factories=Array.from({length:count},()=>{const a=[];for(let i=0;i<4;i++){const v=draw(x,rng);if(v!==null)a.push(v);}return a;});
    x.center=[];x.firstToken=true;E.M.turn=x.starter;x.dl=clock()+TURN_MS;x.pending=null;
  }
  function groups(x){
    const g=[];
    x.factories.forEach((a,i)=>{[...new Set(a)].forEach(c=>g.push({source:'f',index:i,color:c,count:a.filter(v=>v===c).length}));});
    [...new Set(x.center)].forEach(c=>g.push({source:'c',index:-1,color:c,count:x.center.filter(v=>v===c).length}));
    return g;
  }
  function begin(x,g,seat){
    const a=g.source==='f'?x.factories[g.index]:x.center;
    const taken=a.filter(v=>v===g.color);
    if(!taken.length)return false;
    g.started=true;g.count=taken.length;g.remaining=taken.length;
    if(g.source==='f'){x.center.push(...a.filter(v=>v!==g.color));x.factories[g.index]=[];}
    else{
      x.center=x.center.filter(v=>v!==g.color);
      if(x.firstToken){x.firstToken=false;x.nextStarter=seat;x.players[seat].floor.push('first');}
    }
    return true;
  }
  function take(x,g,seat,row){
    const p=x.players[seat];
    if(row!==-1&&!legal(p,g.color,row))return false;
    if(!g.started&&!begin(x,g,seat))return false;
    if(row===-1){p.floor.push(...Array(g.remaining).fill(g.color));g.remaining=0;}
    else{const n=Math.min(g.remaining,row+1-p.lines[row].length);p.lines[row].push(...Array(n).fill(g.color));g.remaining-=n;}
    if(g.remaining>0&&!opts(p,g.color).length){p.floor.push(...Array(g.remaining).fill(g.color));g.remaining=0;}
    if(g.remaining===0){x.pending=null;return true;}
    x.pending=g;return true;
  }
  function finishRound(x,rng){
    const logs=[],handScores=[];
    for(const p of x.players){
      const before=p.score;let gain=0;
      for(let r=0;r<5;r++){
        const a=p.lines[r];if(a.length!==r+1)continue;
        const c=a[0],col=(c-r+5)%5;p.wall[r][col]=c;gain+=wallPoints(p.wall,r,col);
        x.discard.push(...a.slice(1));p.lines[r]=[];
      }
      const firstIndex=p.floor.indexOf('first');
      const firstPenalty=firstIndex<0||firstIndex>=7?0:1;
      const penalty=p.floor.slice(0,7).reduce((sum,item,i)=>sum+(item==='first'?1:PEN[i]),0);
      x.discard.push(...p.floor.filter(v=>Number.isInteger(v)));
      p.floor=[];p.score=Math.max(0,p.score+gain-penalty);
      handScores.push(p.score-before);logs.push({gain,penalty,firstPenalty,score:p.score});
    }
    if(!Array.isArray(x.roundHistory))x.roundHistory=[];
    x.roundHistory.push({round:x.round,scores:handScores});
    x.roundLog={round:x.round,players:logs};
    if(x.players.some(p=>p.wall.some(r=>r.every(v=>v!==null)))){
      x.players.forEach((p,i)=>{const b=bonus(p);p.score+=b;x.roundLog.players[i].bonus=b;x.roundLog.players[i].score=p.score;});
      E.M.over=true;E.M.turn=-1;x.dl=0;
      const max=Math.max(...x.players.map(p=>p.score));
      E.M.res=x.players.filter(p=>p.score===max).length===1?x.players.findIndex(p=>p.score===max):'draw';
      return;
    }
    if(x.nextStarter!==null)x.starter=x.nextStarter;
    x.nextStarter=null;x.round++;refill(x,rng);
  }

  E.azInit=(rng)=>{
    const M=E.M,n=M.n,x={
      n,players:Array.from({length:n},()=>board()),bag:[],discard:[],factories:[],center:[],
      round:1,starter:rnd(rng,n),nextStarter:null,firstToken:true,pending:null,roundLog:null,roundHistory:[],dl:0
    };
    for(let c=0;c<5;c++)for(let j=0;j<20;j++)x.bag.push(c);
    M.x=x;refill(x,rng);
  };

  // One full AI turn: ranked heuristic placement (mirrors the client's botMove, forceRandom=false).
  E.azAiStep=(seat,rng)=>{
    const x=E.M.x,p=x.players[seat],all=groups(x);
    if(!all.length){finishRound(x,rng);return;}
    let best=null,bestScore=-Infinity;
    for(const g of all){
      for(const row of opts(p,g.color)){
        const used=Math.min(g.count,row+1-p.lines[row].length),waste=g.count-used,complete=p.lines[row].length+used===row+1?5:0;
        const score=used*1.4+complete-waste*2+(rng?rng():Math.random())*0.5;
        if(score>bestScore){bestScore=score;best={g,row};}
      }
      const floorScore=-g.count*3+(rng?rng():Math.random())*0.5;
      if(floorScore>bestScore){bestScore=floorScore;best={g,row:-1};}
    }
    const g={...best.g};begin(x,g,seat);let row=best.row;
    if(row===-1){p.floor.push(...Array(g.remaining).fill(g.color));g.remaining=0;}
    else{
      let amount=Math.min(g.remaining,row+1-p.lines[row].length);p.lines[row].push(...Array(amount).fill(g.color));g.remaining-=amount;
      while(g.remaining>0&&opts(p,g.color).length){
        const r2=opts(p,g.color).sort((a,b)=>(a+1-p.lines[a].length)-(b+1-p.lines[b].length))[0];
        const k=Math.min(g.remaining,r2+1-p.lines[r2].length);p.lines[r2].push(...Array(k).fill(g.color));g.remaining-=k;
      }
      if(g.remaining>0)p.floor.push(...Array(g.remaining).fill(g.color));
    }
    x.pending=null;
    if(groups(x).length===0){finishRound(x,rng);return;}
    E.M.turn=(E.M.turn+1)%E.M.n;
  };

  // Force-resolve the current seat's turn at random (60s timeout fallback; mirrors botMove(true)).
  E.azForceMove=(seat,rng)=>{
    const x=E.M.x,p=x.players[seat];
    let g=x.pending;
    if(!g||!g.started){
      const all=groups(x);if(!all.length){finishRound(x,rng);return;}
      g={...all[rnd(rng,all.length)]};begin(x,g,seat);
    }
    let left=g.remaining;
    while(left>0){
      const rows=opts(p,g.color);
      if(!rows.length){p.floor.push(...Array(left).fill(g.color));left=0;break;}
      const row=rows[rnd(rng,rows.length)],amount=Math.min(left,row+1-p.lines[row].length);
      p.lines[row].push(...Array(amount).fill(g.color));left-=amount;
    }
    x.pending=null;
    if(groups(x).length===0){finishRound(x,rng);return;}
    E.M.turn=(E.M.turn+1)%E.M.n;
  };

  E.azNeed=()=>{const M=E.M;if(M.over)return -1;return M.ai[M.turn]?M.turn:-1;};
  E.azTimers=(rng)=>{
    const M=E.M,x=M.x;if(M.over||!x.dl)return false;
    if(clock()>=x.dl){E.azForceMove(M.turn,rng);return true;}
    return false;
  };
  E.azArm=()=>{const M=E.M,x=M.x;if(M.over){x.dl=0;return;}x.dl=clock()+TURN_MS;};

  E.azAct=(seat,tag,m)=>{
    const M=E.M,x=M.x;
    if(M.over||seat!==M.turn||M.ai[seat]||!m||typeof m!=='object')return false;
    const p=x.players[seat];
    if(m.a==='select'){
      if(x.pending&&x.pending.started)return false;
      const g=groups(x).find(v=>v.source===m.source&&v.index===m.index&&v.color===m.color);
      if(!g)return false;
      if(x.pending&&x.pending.source===g.source&&x.pending.index===g.index&&x.pending.color===g.color){x.pending=null;return true;}
      x.pending={...g,started:false,remaining:g.count};return true;
    }
    if(m.a==='end-request'){M.over=true;M.turn=-1;x.dl=0;x.ended=true;
      const max=Math.max(...x.players.map(q=>q.score));
      M.res=x.players.filter(q=>q.score===max).length===1?x.players.findIndex(q=>q.score===max):'draw';
      return true;
    }
    let g=x.pending;if(!g)return false;
    if(m.a==='place'){if(!Number.isInteger(m.row)||m.row<0||m.row>4)return false;
      const ok=take(x,g,seat,m.row);if(ok&&!x.pending)E.M.turn=(E.M.turn+1)%E.M.n;
      if(ok&&groups(x).length===0&&!x.pending){finishRound(x);}
      return ok;
    }
    if(m.a==='floor'){const ok=take(x,g,seat,-1);if(ok&&!x.pending)E.M.turn=(E.M.turn+1)%E.M.n;if(ok&&groups(x).length===0&&!x.pending)finishRound(x);return ok;}
    return false;
  };

  E.azView=(seat)=>{
    const M=E.M,x=M.x;
    return {
      you:seat,n:M.n,names:M.names,av:M.av,ai:M.ai,turn:M.turn,over:M.over,res:M.res,round:x.round,
      bag:x.bag.length,firstToken:x.firstToken,factories:x.factories,center:x.center,pending:x.pending,
      players:x.players.map((p,i)=>({name:M.names[i],avatar:M.av[i],score:p.score,lines:p.lines,wall:p.wall,floor:p.floor})),
      roundLog:x.roundLog,turnDeadlineAt:x.dl||0
    };
  };

  E.mgReport=()=>{
    const M=E.M,x=M.x,rows=[{l:'امتیاز نهایی',v:x.players.map(p=>p.score),h:1}];
    (x.roundHistory||[]).forEach(h=>rows.push({l:'دور '+h.round+' · امتیاز این دور',v:h.scores}));
    return {id:'azul',gid:'az-'+Date.now().toString(36),g:'آزول',t:Date.now(),n:M.n,names:M.names.slice(),ai:M.ai.slice(),
      res:M.res,rows,sum:['تعداد دورها: '+x.round],rounds:x.roundHistory||[]};
  };

  return E;
}
