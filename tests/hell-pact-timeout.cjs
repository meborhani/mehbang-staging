const assert = require('assert');
(async () => {
  const core = await import('../supabase/functions/hell/hell_core.mjs');
  const now = 100000;
  const ctx = {status:'play', host:true, n:2, code:'12345', seats:[
    {seat:0,name:'human',av:-1}, {seat:1,name:'bot',av:-1}
  ], st:null};
  const engine = (await import('../supabase/functions/hell/hell_engine.mjs')).HellEscapeEngine;
  const game = engine.createGame(2,['human','bot'],()=>0.1);
  game.phase='settlement';
  game.players[0].wealth=100; game.players[1].wealth=200;
  game.players[0].isAI=false; game.players[1].isAI=true;
  game.players[0].roomSeat=0; game.players[1].roomSeat=1;
  game.pactOffers=[0]; game.pactOffer=0;
  game.settled={round:1,players:[]};
  ctx.st={game,srv:{deadline:0,pactDeadline:0,nextAt:now,disconnectAt:{},sub:{},acted:{},roundReveals:[],done:false}};
  const out=core.run('tick',null,ctx,now);
  assert(out.ok);
  assert(out.st.srv.pactDeadline>now,'human pact offer must receive a deadline even when settlement was entered indirectly');
  console.log('hell pact timeout regression: ok');
})().catch(err=>{console.error(err);process.exit(1);});
