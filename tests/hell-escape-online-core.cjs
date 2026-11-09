const assert=require('node:assert/strict');
async function main(){
const {run,TURN_MS,validateAction}=await import('../supabase/functions/hell/hell_core.mjs');
const base={code:'12345',n:2,host:true,seat:0,status:'wait',ver:0,seats:[{seat:0,name:'ابراهیم',av:2,age:0,gone:false}]};
const started=run('start',null,base,1000);
assert.equal(started.ok,true);
assert.equal(started.status,'play');
assert.equal(started.st.game.players.length,2,'unoccupied seats are filled by the server');
assert.equal(started.st.game.players[1].isAI,true);
assert.equal(started.mine.x.players[0].name,'ابراهیم','each view puts the requesting seat first');
assert.ok(started.mine.x.coals.every(c=>!c.revealed&&(c.kind==='hidden'||c.kind==='coal'||c.kind==='devil')),'unrevealed coal details are not disclosed');
assert.ok(started.mine.x.players[1].wagerHidden,'other wagers stay hidden during betting');
assert.equal(TURN_MS,60000);
assert.equal(validateAction({a:'reveal',id:0}),true);
assert.equal(validateAction({a:'set-score',score:9999}),false);

const humans={...base,n:2,seats:[...base.seats,{seat:1,name:'مهمان',av:4,age:0,gone:false}]};
let state=run('start',null,humans,1050).st;
let q=run('act',{a:'wager-add',value:100},{...humans,status:'play',st:state},1100);assert.equal(q.ok,true);state=q.st;
let seatOne=run('act',{a:'wager-add',value:50},{...humans,status:'play',seat:1,host:false,st:state},1200);assert.equal(seatOne.ok,true);state=seatOne.st;
assert.equal(seatOne.mine.x.players[0].wager,50,'each player sees their own hidden wager');
assert.equal(seatOne.mine.x.players[1].wager,0,'each player sees opponents’ hidden wagers as private');
q=run('act',{a:'lock'},{...humans,status:'play',st:state},1300);assert.equal(q.ok,true);state=q.st;
seatOne=run('act',{a:'lock'},{...humans,status:'play',seat:1,host:false,st:state},1400);assert.equal(seatOne.ok,true);state=seatOne.st;
assert.equal(state.game.phase,'play','locking all wagers starts the coal round');
assert.ok(seatOne.mine.x.players.every(p=>!p.wagerHidden),'wagers are shown after all seats lock');
assert.equal(seatOne.mine.x.turnDeadlineAt,1400+TURN_MS,'the active turn gets a server-side one-minute deadline');
const active=state.game.turn;
const noCoal=run('act',{a:'end-turn'},{...humans,status:'play',seat:active,host:active===0,st:state},1500);
assert.equal(noCoal.ok,false,'a player cannot pass before revealing a coal');
const badId=run('act',{a:'reveal',id:999},{...humans,status:'play',seat:active,host:active===0,st:state},1600);
assert.equal(badId.ok,false,'the server rejects a nonexistent coal');
const timed=run('tick',null,{...humans,status:'play',seat:active,host:active===0,st:state},1400+TURN_MS+100);
assert.ok(timed.st.game.players.some(p=>p.reveals.length),'the server resolves an idle turn after the deadline');
assert.equal(timed.st.game.players[active].isAI,true,'an idle online seat is temporarily taken over by the server bot');

const wrongSeat=run('act',{a:'lock'},Object.assign({},base,{status:'play',host:false,seat:1,st:started.st}),1200);
assert.equal(wrongSeat.ok,false,'unauthenticated seat action cannot lock another seat');

const badWager=run('act',{a:'wager-add',value:9999},Object.assign({},base,{status:'play',st:started.st}),1300);
assert.equal(badWager.ok,false,'wagers outside the game chip values are rejected');
console.log('Hell Escape online core authorization, redaction, AI seats and turn clock: PASS');
}
main().catch(e=>{console.error(e);process.exit(1);});
