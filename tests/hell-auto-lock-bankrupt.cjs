const assert = require('assert');
(async () => {
  const core = await import('../supabase/functions/hell/hell_core.mjs');
  const engine = (await import('../supabase/functions/hell/hell_engine.mjs')).HellEscapeEngine;
  const now = 300000;
  const ctx = {status:'play',host:true,n:2,code:'11111',seat:0,seats:[{seat:0,name:'human',av:-1},{seat:1,name:'bot',av:-1}],st:null};
  const game=engine.createGame(2,['human','bot'],()=>0.1); game.phase='bet';
  game.players[0].wealth=0; game.players[1].wealth=0;
  game.players.forEach((p,i)=>{p.isAI=i===1;p.roomSeat=i;});
  ctx.st={game,srv:{deadline:0,pactDeadline:0,nextAt:now,disconnectAt:{},sub:{},acted:{},roundReveals:[],done:false}};
  const out=core.run('tick',null,ctx,now);
  assert(out.ok); assert.strictEqual(out.st.game.phase,'play','bankrupt players should auto-lock and start the round');
  assert(out.st.game.players.every(p=>p.locked));
  console.log('hell auto-lock bankrupt regression: ok');
})().catch(e=>{console.error(e);process.exit(1);});
