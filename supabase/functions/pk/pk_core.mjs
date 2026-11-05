// Poker server core: same presence/grace/computer-substitution shape as core.mjs (Jaliz) / kb_core.mjs (Kahroba), reused as-is.
import {createEngine} from './pk_engine.mjs';
export const GRACE=10000, DET=6000, AI_GAP=800, SHOW_MS=6000;
function mkEngine(st,now){
  const E=createEngine({});const T={v:now};E.setClock(()=>T.v);E.M=st.M;return E;
}
export function newState(ctx,now){
  const n=ctx.n,names=[],ai=[],av=[],wins=[];
  for(let i=0;i<n;i++){names.push('رایانه');ai.push(true);av.push(-1);wins.push(0);}
  ctx.seats.forEach(s=>{names[s.seat]=s.name;ai[s.seat]=false;av[s.seat]=s.av;});
  const E=createEngine({});const T={v:now};E.setClock(()=>T.v);
  const buy=Math.max(10,Math.min(100000,+(ctx.cfg&&ctx.cfg.buy)||100));
  const bl=Math.max(1,Math.min(100,+(ctx.cfg&&ctx.cfg.bl)||1));
  const lim=Math.max(1,Math.min(1000,+(ctx.cfg&&ctx.cfg.lim)||10));
  E.M={g:{id:'poker',type:'poker',name:'پوکر'},mode:'host',n,me:0,names,av,wins,ai,rn:0,over:false,res:null,tmr:true,turn:0,x:null,
    pkcfg:{end:'hands',lim,bl,buy},pp:E.pkPersonas(n)};
  E.stInit();E.pkInit();E.pkArm();
  return {M:E.M,srv:{dc:{},sub:{},acted:{},pz:{},nx:0,showAt:0,done:false,t0:now}};
}
function online(info,me,seat){if(seat===me)return true;return !!info&&!info.gone&&info.age<DET;}
function presence(E,st,ctx,now){
  const M=E.M,x=M.x,s=st.srv;let ch=false;
  for(let i=0;i<M.n;i++){
    const info=ctx.seats.find(q=>q.seat===i);if(!info)continue;
    const on=online(info,ctx.seat,i);
    if(on){
      if(s.dc[i]!=null){delete s.dc[i];ch=true;}
      if(s.pz[i]!=null){x.dl=now+Math.max(1,s.pz[i]);delete s.pz[i];ch=true;}
      if(s.sub[i]==='dc'){M.ai[i]=false;delete s.sub[i];ch=true;}
    }else{
      if(s.dc[i]==null){s.dc[i]=now-Math.max(0,(info.gone?DET:info.age)-DET);ch=true;}
      if(!s.sub[i]&&M.turn===i&&x.dl>0&&s.pz[i]==null){s.pz[i]=Math.max(1,x.dl-now);x.dl=0;ch=true;}
      if(!s.sub[i]&&now-s.dc[i]>=GRACE){
        s.sub[i]='dc';M.ai[i]=true;ch=true;
        if(s.pz[i]!=null){x.dl=now+Math.max(1,s.pz[i]);delete s.pz[i];}
      }
    }
  }
  return ch;
}
function advance(E,st,ctx,now){
  const M=E.M,s=st.srv;let any=false;
  for(let k=0;k<8&&!M.over;k++){
    let ch=presence(E,st,ctx,now);
    if(M.x.st==='show'){
      if(!s.showAt)s.showAt=now+SHOW_MS;
      if(now>=s.showAt){s.showAt=0;E.pkStartHand();ch=true;if(!M.over)E.pkArm();}
    }else if(s.showAt){s.showAt=0;}
    const who=M.turn;
    if(E.pkTimers()){ch=true;if(s.sub[who])s.acted[who]=true;if(!M.over)E.pkArm();}
    if(!M.over&&M.x.st!=='show'&&now>=s.nx){
      const t2=M.turn;
      if(M.ai[t2]&&!M.x.fold[t2]&&!M.x.al[t2]){
        E.pkAiAct(t2);s.nx=now+AI_GAP;ch=true;if(s.sub[t2])s.acted[t2]=true;if(M.turn!==t2||M.over||M.x.st==='show')E.pkArm();
      }
    }
    if(!ch)break;any=true;
  }
  return any;
}
function views(E,st,ctx,now){
  const M=E.M,s=st.srv,out={};
  const off=[],sub=[];for(let i=0;i<M.n;i++){if(s.dc[i]!=null)off.push(i);if(s.sub[i])sub.push(i);}
  ctx.seats.forEach(q=>{
    const v=E.pkView(q.seat);
    out[q.seat]={t:'st',g:'poker',you:q.seat,n:M.n,names:M.names,av:M.av,wins:M.wins,ai:M.ai,rn:M.rn,turn:M.turn,over:M.over,res:M.res,line:[],b:[],x:v,sv:{dl:M.x.dl||0,off,sub,t:now},rp:M.over?M.rp:undefined};
  });
  return out;
}
function results(E,st,ctx){
  const M=E.M,s=st.srv;
  if(!M.rp){try{M.rp=E.mgReport();}catch(e){}}
  return ctx.seats.map(q=>{
    const r=M.res==='draw'?'d':(M.res===q.seat?'w':'l');
    return {seat:q.seat,r,pts:r==='w'?3:(r==='d'?1:0),reward:!s.acted[q.seat],rp:M.rp||null};
  });
}
export function run(op,m,ctx,now){
  let st=ctx.st;
  if(op==='start'){
    if(ctx.status!=='wait'||!ctx.host)return {ok:false,why:'نمی‌توانید شروع کنید'};
    if(ctx.seats.length<2)return {ok:false,why:'حداقل ۲ بازیکن لازم است'};
    st=newState(ctx,now);
  }else{
    if(ctx.status!=='play'||!st)return {ok:false,why:'closed'};
  }
  const E=mkEngine(st,now);
  const s=st.srv;let ch=op==='start';
  ch=advance(E,st,ctx,now)||ch;
  if(op==='act'&&!E.M.over){
    const seat=ctx.seat;
    if(s.sub[seat]){E.M.ai[seat]=false;delete s.sub[seat];ch=true;}
    const who=E.M.turn;
    if(m&&typeof m==='object'&&E.pkAct(seat,'pk',m)){ch=true;if(E.M.turn!==who||E.M.over||E.M.x.st==='show')E.pkArm();advance(E,st,ctx,now);}
    else return {ok:false,why:'bad',changed:ch,st:ch?st:undefined,views:ch?views(E,st,ctx,now):undefined,status:'play',mine:null};
  }
  let status='play',res;
  if(E.M.over){status='done';if(!s.done){s.done=true;res=results(E,st,ctx);ch=true;}}
  const V=views(E,st,ctx,now);
  return {ok:true,changed:ch,st,views:V,status,res,mine:V[ctx.seat]};
}
