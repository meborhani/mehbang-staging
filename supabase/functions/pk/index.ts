// Poker server: loads room state, runs the shared engine (pk_core.mjs), saves with version CAS.
import {run} from "https://raw.githubusercontent.com/meborhani/mehbang-staging/PIN_COMMIT/supabase/functions/pk/pk_core.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.45.4";
const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const out=(o:unknown)=>new Response(JSON.stringify(o),{headers:H});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  let b:any;try{b=await req.json();}catch{return out({ok:false,why:"bad"});}
  const {op,token,code,m}=b||{};
  if(!["start","act","tick"].includes(op)||typeof token!=="string"||token.length!==48||!/^[0-9]{5}$/.test(String(code)))return out({ok:false,why:"bad"});
  for(let a=0;a<4;a++){
    const {data:ctx,error}=await sb.rpc("pk_ctx",{p_token:token,p_code:code});
    if(error||!ctx||!ctx.ok)return out({ok:false,why:(ctx&&ctx.why)||"err"});
    if(op!=="start"&&ctx.status!=="play")return out({ok:true,status:ctx.status});
    const r=run(op,m,ctx,Date.now());
    if(!r.ok&&!r.changed)return out({ok:false,why:r.why});
    let ver=ctx.ver;
    if(r.changed){
      const {data:saved}=await sb.rpc("pk_save",{p_code:code,p_ver:ctx.ver,p_st:r.st,p_views:r.views,p_status:r.status});
      if(!saved)continue;
      ver=ctx.ver+1;
      if(r.res)await sb.rpc("pk_done",{p_code:code,p_res:r.res});
    }
    return out({ok:r.ok,why:r.why,status:r.status,ver,view:r.mine});
  }
  return out({ok:false,why:"busy"});
});
