const assert = require('assert');
(async () => {
  const core = await import('../supabase/functions/hell/hell_core.mjs');
  const engine = (await import('../supabase/functions/hell/hell_engine.mjs')).HellEscapeEngine;
  const now = 200000;
  const ctx = {status:'play', host:true, n:2, code:'54321', seats:[
    {seat:0,name:'human',av:-1}, {seat:1,name:'bot',av:-1}
  ], seat:0, st:null};
  const game = engine.createGame(2,['human','bot'],()=>0.1);
  game.phase='bet';
  game.players[0].wealth=0; game.players[1].wealth=200;
  game.players[0].isAI=false; game.players[1].isAI=true;
  game.players[0].roomSeat=0; game.players[1].roomSeat=1;
  ctx.st={game,srv:{deadline:0,pactDeadline:0,nextAt:now,disconnectAt:{},sub:{},acted:{},roundReveals:[],done:false}};
  const out=core.run('act',{a:'lock'},ctx,now);
  assert(out.ok,'zero-wealth player must be allowed to lock a zero wager');
  assert.strictEqual(out.st.game.players[0].locked,true);
  console.log('hell zero-wealth lock regression: ok');
})().catch(err=>{console.error(err);process.exit(1);});
