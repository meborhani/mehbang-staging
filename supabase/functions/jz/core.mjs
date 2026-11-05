// Jaliz server core: pure logic (no I/O). index.ts loads/saves state around run().
import {createEngine} from './jz_engine.mjs';
export const GRACE=10000, DET=6000, IDLE_MAX=3, AI_GAP=900, EV_T=40000;
const G={id:'jaliz',type:'jaliz',name:'جالیز'};
function mkEngine(st,now){
  const E=createEngine({});const T={v:now};E.setClock(()=>T.v);E.__T=T;
  E.M=st.M;return E;
}
export function newState(ctx,now){
  const n=ctx.n,names=[],ai=[],av=[],wins=[];
  for(let i=0;i<n;i++){names.push('رایانه');ai.push(true);av.push(-1);wins.push(0);}
  ctx.seats.forEach(s=>{names[s.seat]=s.name;ai[s.seat]=false;av[s.seat]=s.av;});
  const E=createEngine({});const T={v:now};E.setClock(()=>T.v);
  E.M={g:G,mode:'host',n,me:0,names,av,wins,ai,rn:0,over:false,res:null,line:[],wait:false,tmr:true,turn:0,b:[],x:null,t:null,sel:-1};
  E.stInit();E.jzInit();
  return {M:E.M,srv:{dc:{},sub:{},acted:{},idle:{},pz:{},nx:0,done:false,t0:now}};
}
function online(info,me,seat){
  if(seat===me)return true;
  return !!info&&!info.gone&&info.age<DET;
}
function presence(E,st,ctx,now){
  const M=E.M,x=M.x,s=st.srv;let ch=false;
  for(let i=0;i<M.n;i++){
    const info=ctx.seats.find(q=>q.seat===i);if(!info)continue; // computer seat
    const on=online(info,ctx.seat,i);
    if(on){
      if(s.dc[i]!=null){delete s.dc[i];ch=true;}
      if(s.pz[i]!=null){x.dl=now+Math.max(1,s.pz[i]);delete s.pz[i];ch=true;}
      if(s.sub[i]==='dc'){M.ai[i]=false;delete s.sub[i];ch=true;} // handback at once
    }else{
      if(s.dc[i]==null){s.dc[i]=now-Math.max(0,(info.gone?DET:info.age)-DET);ch=true;}
      if(!s.sub[i]&&(M.turn===i||x.hw===i)&&x.dl>0&&s.pz[i]==null){s.pz[i]=Math.max(1,x.dl-now);x.dl=0;ch=true;}
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
    const who=M.turn,dl0=M.x.dl;
    if(E.jzTimers()){
      ch=true;
      if(s.sub[who])s.acted[who]=true;
      else if(!M.ai[who]&&dl0>0){
        s.idle[who]=(s.idle[who]||0)+1;
        if(s.idle[who]>=IDLE_MAX){s.sub[who]='idle';M.ai[who]=true;}
      }
    }
    if(!M.over&&M.x.ev){ /* events have no engine timer: idle humans are stepped by the computer after 40 s */
      const key=M.rn+':'+M.x.rd+':'+M.x.ev.k;
      if(s.evk!==key){s.evk=key;s.evd=now+EV_T;}
      else if(now>=s.evd){
        M.x.ev.pend.slice().forEach(p=>{if(!M.ai[p]){E.jzAiStep(p);s.idle[p]=(s.idle[p]||0)+1;if(s.idle[p]>=IDLE_MAX){s.sub[p]='idle';M.ai[p]=true;}}});
        s.evd=now+EV_T;ch=true;
      }
    }else s.evk=null;
    if(!M.over&&now>=s.nx){
      const nd=E.jzNeed();
      if(nd>=0){E.jzAiStep(nd);s.nx=now+AI_GAP;ch=true;if(s.sub[nd])s.acted[nd]=true;}
    }
    if(!ch)break;any=true;
  }
  return any;
}
function views(E,st,ctx,now){
  const M=E.M,s=st.srv,x=M.x,out={};
  const off=[],sub=[];
  for(let i=0;i<M.n;i++){if(s.dc[i]!=null)off.push(i);if(s.sub[i])sub.push(i);}
  ctx.seats.forEach(q=>{
    const v=E.jzView(q.seat);
    v.dl=x.dl||0;v.pz=s.pz;v.off=off;v.sub=sub;
    out[q.seat]={t:'st',g:'jaliz',you:q.seat,n:M.n,names:M.names,av:M.av,wins:M.wins,ai:M.ai,rn:M.rn,turn:M.turn,over:M.over,res:M.res,line:M.line,b:M.b,x:v,sv:{dl:x.dl||0,off,sub,t:now},rp:M.over?M.rp:undefined};
  });
  return out;
}
function results(E,st,ctx){
  const M=E.M,s=st.srv;
  if(!M.rp){try{M.me=0;M.rp=E.mgReport();}catch(e){}}
  return ctx.seats.map(q=>{
    const r=M.res==='draw'?'d':(M.res===q.seat?'w':'l');
    return {seat:q.seat,r,pts:r==='w'?3:(r==='d'?1:0),reward:!s.acted[q.seat],rp:M.rp||null};
  });
}
// op: start | act | tick. returns {ok, st?, views?, status, res?, why?, changed}
export function run(op,m,ctx,now){
  let st=ctx.st;
  if(op==='start'){
    if(ctx.status!=='wait'||!ctx.host)return {ok:false,why:'نمی‌توانید شروع کنید'};
    if(ctx.seats.length<2)return {ok:false,why:'حداقل ۲ بازیکن لازم است'};
    st=newState(ctx,now);
  }else{
    if(ctx.status!=='play'||!st)return {ok:false,why:'closed'};
  }
  const E=mkEngine(st,now);E.__T.v=now;
  const s=st.srv;let ch=op==='start';
  ch=advance(E,st,ctx,now)||ch;
  if(op==='act'&&!E.M.over){
    const seat=ctx.seat;
    if(s.sub[seat]){E.M.ai[seat]=false;delete s.sub[seat];ch=true;}
    s.idle[seat]=0;
    if(m&&typeof m==='object'&&E.jzAct(seat,'jz',m)){ch=true;advance(E,st,ctx,now);}
    else return {ok:false,why:'bad',changed:ch,st:ch?st:undefined,views:ch?views(E,st,ctx,now):undefined,status:'play',mine:null};
  }
  let status='play',res;
  if(E.M.over){status='done';if(!s.done){s.done=true;res=results(E,st,ctx);ch=true;}}
  const V=views(E,st,ctx,now);
  return {ok:true,changed:ch,st,views:V,status,res,mine:V[ctx.seat]};
}
