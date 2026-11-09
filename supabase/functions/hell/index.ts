import {run,validateAction} from './hell_core.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';

const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const out=(o:unknown)=>new Response(JSON.stringify(o),{headers:H});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:H});
  let b:any;try{b=await req.json();}catch{return out({ok:false,why:'bad'});}
  const {op,token,code,m}=b||{};
  if(!['start','act','tick'].includes(op)||typeof token!=='string'||token.length!==48||!/^[0-9]{5}$/.test(String(code))||(op==='act'&&!validateAction(m)))return out({ok:false,why:'bad'});
  for(let attempt=0;attempt<5;attempt++){
    const {data:ctx,error}=await sb.rpc('hell_ctx',{p_token:token,p_code:code});
    if(error||!ctx||!ctx.ok)return out({ok:false,why:(ctx&&ctx.why)||'err'});
    if(op!=='start'&&ctx.status!=='play')return out({ok:true,status:ctx.status});
    const result=run(op,m,ctx,Date.now());
    if(!result.ok&&!result.changed)return out({ok:false,why:result.why||'invalid'});
    let ver=ctx.ver;
    if(result.changed){
      const {data:saved,error:saveError}=await sb.rpc('hell_save',{p_code:code,p_ver:ctx.ver,p_st:result.st,p_views:result.views,p_status:result.status});
      if(saveError||!saved)continue;
      ver=ctx.ver+1;
      if(result.res)await sb.rpc('hell_done',{p_code:code,p_res:result.res});
    }
    return out({ok:result.ok,why:result.why,status:result.status,ver,view:result.mine});
  }
  return out({ok:false,why:'busy'});
});
