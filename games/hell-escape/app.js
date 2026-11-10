(function(){
  'use strict';
  var E=window.HellEscapeEngine;
  var $=function(s,r){return (r||document).querySelector(s);};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  var SAVE_KEY='mb-hell-escape-save-v1',HISTORY_KEY='mb-hell-escape-history-v1';
  var CHIP_VALUES=[10,20,50,100,200,500,1000],CHIP_COLORS={10:'#d71920',20:'#a9a7ac',50:'#15994d',100:'#e2a900',200:'#1467dc',500:'#df6b0e',1000:'#20242b'};
  var FALLBACK=['assets/avatars/avatar_ali.webp','assets/avatars/avatar_male2.webp','assets/avatars/avatar_maryam.webp','assets/avatars/avatar_sara.webp'];
  var CPU_NAMES=['کاوه','رها','سارا'];
  var AI_PERSONALITIES=[{id:'risk',name:'ریسک‌پذیر'},{id:'cautious',name:'محتاط'},{id:'smart',name:'باهوش'},{id:'dumb',name:'خنگ'},{id:'normal',name:'نرمال'},{id:'alternating',name:'متناوب'}];
  var BOT_CHIPS=[500,200,100,50,20,10];
  var PAWN_COLORS=['#f2c95b','#ef4944','#35c9dc','#4ccc70'];
  var g=null,avatarUrls=FALLBACK.slice(),difficulty=1,roundStartedAt=0,autoTimer=null,toastTimer=null,lastTurnKey='',lastGuidanceKey='',reportSent=false,profileName='بازیکن',roundReveals=[],vibrationEnabled=localStorage.getItem('mb-hell-vibration')!=='0',tutorialMode=false,tutorialRound=0,tutorialFinished=false,onlineMode=false,onlineSeat=0;
  var rows=[4,6,7,8,8,7,5,3];
  var coalPoints=[]; (function(){var cy=520,yy=-189,id=0;rows.forEach(function(count){var gap=56,start=500-(count-1)*gap/2;for(var i=0;i<count;i++)coalPoints.push({id:id++,x:start+i*gap,y:cy+yy});yy+=59;});})();
  var SCORE_BOXES=[
    {label:'۰–۵۰',show:true,x:870,y:785,a:20,px:870,py:835},{label:'۵۰–۲۰۰',show:true,x:665,y:885,a:0,px:665,py:885},{label:'۲۰۰',show:true,x:490,y:890,a:0,px:490,py:890},
    {label:'۲۰۰–۳۰۰ / ۳۰۰',show:true,x:330,y:890,a:0,px:330,py:890},{label:'۳۰۰–۵۰۰',show:true,x:110,y:700,a:-4,px:110,py:700},
    {label:'۵۰۰',show:true,x:92,y:600,a:90,px:92,py:600},{label:'۵۰۰–۷۵۰',show:true,x:100,y:495,a:90,px:100,py:495},{label:'۷۵۰',show:true,x:112,y:405,a:90,px:112,py:405},
    {label:'۷۵۰–۱۰۰۰',show:true,x:120,y:310,a:78,px:120,py:310},{label:'۱۰۰۰',show:true,x:165,y:240,a:58,px:165,py:240},{label:'۱۰۰۰–۱۳۰۰',show:true,x:300,y:168,a:20,px:300,py:168},
    {label:'۱۳۰۰',show:true,x:485,y:158,a:0,px:485,py:158},{label:'۱۳۰۰–۱۶۰۰',show:true,x:675,y:165,a:-4,px:675,py:165},{label:'۱۶۰۰',show:true,x:870,y:170,a:-10,px:870,py:170}
  ];
  function fa(n){try{return new Intl.NumberFormat('fa-IR').format(n);}catch(e){return String(n);}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function msgParent(data){try{if(parent!==window)parent.postMessage(data,location.origin);}catch(e){}}
  function fromParent(d){
    if(!d)return;
    if(d.type==='hell:set-avatars'){if(d.profile)avatarUrls[0]=d.profile;if(Array.isArray(d.opponents))for(var i=1;i<4;i++)if(d.opponents[i-1])avatarUrls[i]=d.opponents[i-1];persist();render();return;}
    if(d.type==='hell:state'){applyOnlineState(d.view);return;}
  }
  window.addEventListener('message',function(e){if(e.origin===location.origin)fromParent(e.data);});
  function sendAction(a){msgParent({type:'hell:action',action:a});}
  function applyOnlineState(view){
    if(!view||!view.x)return;
    onlineSeat=view.you|0;
    g=view.x;
    showGame();render();
    if(view.over&&!reportSent){
      reportSent=true;g.reportSent=true;
      var rp=view.rp||makeReport();
      msgParent({type:'hell:report',report:rp,result:view.res===0?'w':(view.res==='draw'?'d':'l'),gameId:g.gameId,opponents:g.players.slice(1).map(function(p){return p.name;})});
      renderSummary();
    }
    if(g.phase==='settlement'&&g.pactOffer===0)showPact();
  }
  function toast(s){var el=$('#toast');if(el.classList.contains('show')&&el.textContent===s)return;el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('show');setTimeout(function(){if(!el.classList.contains('show'))el.textContent='';},220);},3000);}
  function safeRead(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
  function persist(){if(!g||tutorialMode||onlineMode)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,game:g,difficulty:difficulty,avatarNames:g.players.map(function(p){return p.name;}),roundReveals:roundReveals}));}catch(e){toast('ذخیرهٔ بازی در این دستگاه ممکن نشد');}}
  function validSave(){var s=safeRead(SAVE_KEY);return !!(s&&s.version===1&&E.validate(s.game)&&!s.game.gameOver);}
  function normalizeSave(s){
    var game=s.game,logged=Array.isArray(s.roundReveals)?s.roundReveals:[],safeTotal=logged.reduce(function(sum,r){return sum+(r.kind==='coal'?(+r.value||0):0);},0);
    if(!Array.isArray(game.pactOffers))game.pactOffers=game.pactOffer==null?[]:[game.pactOffer];E.normalizePactHolder(game);game.players.forEach(function(p,i){if(i>0&&!p.aiPersonality)p.aiPersonality=AI_PERSONALITIES[(i-1)%AI_PERSONALITIES.length].id;});
    game.players.forEach(function(p,i){
      var rows=logged.filter(function(r){return r.seat===i;});
      if(!Array.isArray(p.reveals))p.reveals=rows.map(function(r,index){return {id:index,kind:r.kind,value:r.value,round:game.round};});
      if(rows.length){p.haul=rows.reduce(function(sum,r){return sum+(r.kind==='coal'?(+r.value||0):0);},0);p.coalCount=rows.filter(function(r){return r.kind==='coal';}).length;p.foundDevil=rows.some(function(r){return r.kind==='devil';});p.busted=p.foundDevil;}
    });
    if(!Number.isFinite(game.totalSafeHaul))game.totalSafeHaul=safeTotal||game.players.reduce(function(sum,p){return sum+(p.haul||0);},0);
    if(game.settled&&!Number.isFinite(game.settled.totalSafeHaul))game.settled.totalSafeHaul=safeTotal||game.players.reduce(function(sum,p){return sum+(p.haul||0);},0);
    if(game.settled){
      var summary=game.settled;
      (summary.players||[]).forEach(function(row,i){var wager=+row.wager||0,success=typeof row.success==='boolean'?row.success:wager<=summary.totalSafeHaul,doubled=typeof row.doubled==='boolean'?row.doubled:(success&&wager===summary.bestWager);row.success=success;row.doubled=doubled;if(!Number.isFinite(row.payout))row.payout=success?wager*(doubled?2:1):0;if(!Number.isFinite(row.burned))row.burned=success?0:wager;});
    }
    return s;
  }
  function readHistory(){var h=safeRead(HISTORY_KEY);return Array.isArray(h)?h:[];}
  function storeHistory(rec){var h=readHistory();if(!h.some(function(x){return x.id===rec.id;})){h.push(rec);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(-30)));}catch(e){}}}
  function getNames(n){var a=[profileName];for(var i=1;i<n;i++)a.push(CPU_NAMES[(i-1)%CPU_NAMES.length]+' (رایانه)');return a;}
  function basePersonality(p){return AI_PERSONALITIES.find(function(x){return x.id===(p&&p.aiPersonality);})||AI_PERSONALITIES[4];}
  function personality(p){var id=basePersonality(p).id;if(id==='alternating')id=g.round%2?'risk':'cautious';return AI_PERSONALITIES.find(function(x){return x.id===id;})||AI_PERSONALITIES[4];}
  function assignPersonalities(){var offset=Math.floor(Math.random()*AI_PERSONALITIES.length);g.players.forEach(function(p,i){if(i>0){p.isAI=true;p.aiPersonality=AI_PERSONALITIES[(offset+i-1)%AI_PERSONALITIES.length].id;}});}
  function npcWager(seat,maxValue){var p=g.players[seat];if(p.wealth<10){p.wager=0;p.locked=true;p.wagerHidden=true;return true;}var style=personality(p).id,cap=Math.max(10,Math.min(p.wealth,maxValue||p.wealth)),r=Math.random(),fraction;
    if(style==='alternating')style=personality(p).id;
    if(style==='risk')fraction=.78+r*.2;
    else if(style==='cautious')fraction=.3+r*.22;
    else if(style==='smart'){var past=(g.history||[]).slice(-3),estimate=past.length?past.reduce(function(sum,h){return sum+(+h.maxHaul||0);},0)/past.length:100;fraction=Math.min(.8,Math.max(.35,estimate/cap*.72));}
    else if(style==='dumb')fraction=.12+r*.88;
    else fraction=.5+r*.3;
    var remaining=Math.max(10,Math.min(cap,Math.floor(cap*fraction/10)*10));BOT_CHIPS.forEach(function(v){while(remaining>=v&&p.wealth-p.wager>=v){E.addWager(g,seat,v);remaining-=v;}});
    if(p.wager<10&&p.wealth-p.wager>=10)E.addWager(g,seat,10);return E.lockBet(g,seat);
  }
  function avatarFor(i){return avatarUrls[i]||FALLBACK[i%FALLBACK.length];}
  function showGame(){ $('#setup').hidden=true;$('#game').hidden=false; }
  function showSetup(){ $('#game').hidden=true;$('#setup').hidden=false;document.body.dataset.phase='setup'; }
  function sendBack(){msgParent({type:'hell:back'});if(parent===window)showSetup();}
  function startGame(n,training){
    tutorialMode=!!training;tutorialRound=training?1:0;tutorialFinished=false;lastGuidanceKey='';
    n=n||+$('[data-count].selected').dataset.count||4;
    roundReveals=[];g=E.createGame(n,getNames(n));g.gameId='hell-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);g.startedAt=Date.now();var chosenDifficulty=+$('[data-difficulty].selected').dataset.difficulty;difficulty=Number.isFinite(chosenDifficulty)?chosenDifficulty:1;assignPersonalities();reportSent=false;
    for(var i=1;i<n;i++)npcWager(i,100+difficulty*50);
    roundStartedAt=Date.now();
    showGame();render();
  }
  function resumeGame(){var s=safeRead(SAVE_KEY);if(!s||!E.validate(s.game)){toast('ذخیرهٔ قابل ادامه پیدا نشد');return;}s=normalizeSave(s);g=s.game;roundReveals=Array.isArray(s.roundReveals)?s.roundReveals:[];difficulty=s.difficulty|0;reportSent=!!g.reportSent;if(g.phase==='play'&&!g.available.length&&g.turn>=0&&g.players[g.turn].coalCount<1)E.forcePassEmpty(g);persist();showGame();render();if(g.phase==='play')scheduleAI();else if(g.phase==='settlement'){if(!g.settled)maybeSettle();else maybeCpuPact();}}
  function chipSvg(v){return '<img src="assets/chip-'+v+'.svg" alt="چیپ '+v+'" draggable="false">';}
  function chipCounts(amount){var left=Math.max(0,Math.floor(amount)),out=[];CHIP_VALUES.slice().reverse().forEach(function(v){var n=Math.floor(left/v);if(n){out.push({v:v,n:n});left-=n*v;}});return out;}
  function playerChipRow(){
    var p=g.players[0],available=p.locked?p.wealth:p.wealth-p.wager,selected=chipCounts(p.wager),selectedCounts={};selected.forEach(function(c){selectedCounts[c.v]=c.n;});var html='';
    CHIP_VALUES.forEach(function(v){html+= '<button class="chip-button'+(selectedCounts[v]?' selected':'')+'" data-chip="'+v+'" aria-label="افزودن چیپ '+v+'" '+(g.phase!=='bet'||p.locked||available<v?'disabled':'')+'>'+chipSvg(v)+'</button>';});
    if(!html)html='<span class="empty-chip">چیپی برای شرط باقی نمانده</span>';
    return html;
  }
  function wagerRow(){var p=g.players[0],counts=chipCounts(p.wager),html='';counts.forEach(function(c){for(var i=0;i<Math.min(c.n,8);i++)html+='<img class="bet-chip-icon" src="assets/chip-'+c.v+'.svg" alt="'+c.v+'">';});return html||'<span class="bet-empty">هنوز شرطی نگذاشتی</span>';}
  function playerRevealRow(p){return (p.reveals||[]).map(function(r){return '<span class="coal-reveal-badge'+(r.kind==='devil'?' devil-reveal':'')+'" data-player-reveal aria-label="'+(r.kind==='devil'?'شیطان':fa(r.value))+'">'+(r.kind==='devil'?'شیطان':fa(r.value))+'</span>';}).join('');}
  function opponentCard(i){var p=g.players[i],active=g.phase==='play'&&g.turn===i;var bet=p.wagerHidden?'شرط مخفی':('شرط '+fa(p.wager));var colors=['#f2c95b','#ef4944','#35c9dc','#4ccc70'];
    return '<article class="opponent'+(active?' is-active':'')+'" id="seat-'+i+'" data-seat="'+i+'"><span class="turn-light" aria-hidden="true"></span><img class="op-avatar" src="'+esc(avatarFor(i))+'" alt=""><span class="op-name"><span class="op-label">'+esc(p.name)+'</span>'+(p.pact?'<em class="pact-mark" title="هم‌پیمان شیطان" aria-label="هم‌پیمان شیطان"><img src="assets/pact-badge.png" alt=""></em>':'')+'</span><span class="op-meta"><span class="op-bet-text">'+bet+'</span><span class="op-haul-total"></span></span><small class="pawn-key opponent-pawn-key"><i style="background:'+colors[i%colors.length]+'"></i>مهره '+fa(i+1)+'</small><span class="player-reveal-row opponent-player-reveals" aria-label="زغال‌های رو شدهٔ '+esc(p.name)+'"></span></article>';
  }
  function renderOpponents(){var o=$('#opponents');o.style.gridTemplateColumns='repeat('+Math.max(1,g.players.length-1)+',minmax(0,1fr))';o.innerHTML=g.players.slice(1).map(function(p,j){return opponentCard(j+1);}).join('');}
  function polyPoint(pos,seat,count){
    var path=[[830,895],[690,920],[540,925],[390,910],[250,875],[145,800],[78,680],[50,530],[75,380],[155,255],[285,155],[425,115],[575,115],[720,130]];
    var dist=pos/1600*(path.length-1),idx=Math.min(path.length-2,Math.floor(dist)),t=dist-idx,dx=path[idx+1][0]-path[idx][0],dy=path[idx+1][1]-path[idx][1],len=Math.sqrt(dx*dx+dy*dy)||1,spread=(seat-(count-1)/2)*24,x=path[idx][0]+dx*t-dy/len*spread,y=path[idx][1]+dy*t+dx/len*spread;return {x:Math.max(42,Math.min(958,x)),y:Math.max(55,Math.min(945,y))};
  }
  function renderPawns(){var h='',pawnAssets=['gold','red','cyan','green'],colors=['#f2c95b','#ef4944','#35c9dc','#4ccc70'],groups={};g.players.forEach(function(p){var score=Number.isFinite(p.scorePos)?p.scorePos:p.wealth,index=E.scoreBoxIndex(score);groups[index]=(groups[index]||0)+1;});g.players.forEach(function(p,i){var position=Number.isFinite(p.scorePos)?p.scorePos:p.wealth,index=E.scoreBoxIndex(position),box=SCORE_BOXES[index],size=groups[index]===1?84:groups[index]===2?68:60,offsets=groups[index]===1?[[0,0]]:groups[index]===2?[[-36,16],[36,16]]:[[-30,-20],[30,-20],[-30,24],[30,24]],prior=g.players.slice(0,i).filter(function(other){return E.scoreBoxIndex(Number.isFinite(other.scorePos)?other.scorePos:other.wealth)===index;}).length,off=offsets[prior]||[0,0],x=box.px+off[0],y=box.py+off[1];var pw=size*(400/730);h+='<g class="pawn-piece pawn-seat-'+i+' score-box-'+index+'" transform="translate('+x+' '+y+')" aria-label="'+esc(p.name)+' · مهرهٔ '+fa(i+1)+' · '+SCORE_BOXES[index].label+' · '+fa(position)+'"><title>'+esc(p.name)+' · مهرهٔ '+fa(i+1)+' · '+SCORE_BOXES[index].label+' · '+fa(position)+'</title><image href="assets/pawn-'+pawnAssets[i%pawnAssets.length]+'.svg" x="'+(-pw/2)+'" y="'+(-size/2)+'" width="'+pw+'" height="'+size+'"/></g>';});$('#pawns').innerHTML=h;var key=$('#myPawnKey');key.innerHTML='<i style="background:'+colors[0]+'"></i> مهرهٔ شما';}
  function renderLabels(){$('#trackLabels').innerHTML='';}
  function fitBoard(){var zone=$('.board-zone'),board=$('#boardSvg');if(!zone||!board)return;var css=getComputedStyle(zone),width=zone.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),height=zone.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom),side=Math.floor(Math.min(width,height));if(side>0){board.style.width=side+'px';board.style.height=side+'px';}}
  function coalSvg(token,pt){var unavailable=g.available.indexOf(token.id)<0,cls='coal-token'+(unavailable?' not-available':' available')+(token.revealed?' is-revealed':'')+(token.revealed&&token.kind==='devil'?' is-devil':'');
    var body=token.revealed&&token.kind==='coal'?'<text class="coal-value" x="0" y="2">'+fa(token.value)+'</text>':'';
    var face='<g class="devil-face"><image href="assets/devil-coal.svg" x="-33" y="-33" width="66" height="66"/></g>';
    return '<g class="'+cls+'" data-coal-id="'+token.id+'" role="button" tabindex="0" aria-label="'+(unavailable?'زغال برداشته شد':'انتخاب زغال')+'" transform="translate('+pt.x+' '+pt.y+')"><circle class="selection-ring" r="35"></circle><circle class="hit" r="36"></circle><image class="coal-body" href="assets/coal.svg" x="-33" y="-33" width="66" height="66"></image>'+body+face+'</g>';
  }
  function renderCoals(){var h='';g.coals.forEach(function(t){h+=coalSvg(t,coalPoints[t.id]);});$('#coals').innerHTML=h;}
  function drawDescription(r){return r.kind==='devil'?'شیطان رو شد!':'زغال '+fa(r.value);}
  function allReveals(){var all=[];(g.history||[]).forEach(function(round){(round.reveals||[]).forEach(function(r){all.push(Object.assign({round:round.round},r));});});roundReveals.forEach(function(r){all.push(Object.assign({round:g.round},r));});return all;}
  function renderPlayerReveals(){g.players.forEach(function(p,i){var safe=E.playerSafeHaul(p),totalText=(p.foundDevil||p.busted?'شیطان':fa(safe));if(i===0){var target=$('#myPlayerReveals');if(target)target.innerHTML='<span class="safe-haul-total" title="مجموع زغال امنی که خودش پیش از شیطان در این دست رو کرده">'+totalText+'</span>'+playerRevealRow(p);}else{var row=$('#seat-'+i+' .opponent-player-reveals'),totalEl=$('#seat-'+i+' .op-haul-total');if(row)row.innerHTML=playerRevealRow(p);if(totalEl)totalEl.innerHTML='<span class="safe-haul-total" title="مجموع زغال امنی که خودش پیش از شیطان در این دست رو کرده">'+totalText+'</span>';}});}
  function renderSafeHaul(){var max=0;g.players.forEach(function(p){max=Math.max(max,E.playerSafeHaul(p));});$('#maxSafeHaul').textContent=fa(max);$('#totalRevealedHaul').textContent=fa(E.playerSafeHaul(g.players[0]));}
  function recordReveal(seat,token){
    roundReveals.push({seat:seat,name:g.players[seat].name,kind:token.kind,value:token.value});
  }
  function activeStep(){var step=g.phase==='bet'?'bet':g.phase==='play'?'coal':g.phase==='settlement'?'settle':'move';$$('[data-step]').forEach(function(el){el.classList.toggle('active',el.dataset.step===step);});}
  function renderDock(){var p=g.players[0],mine=g.phase==='play'&&g.turn===0&&!p.turnDone;
    var dock=$('#seat-0');dock.classList.toggle('is-active',mine);dock.classList.remove('show-bet');dock.classList.remove('compact-play');
    $('#myAvatar').src=avatarFor(0);$('#myName').textContent=p.name;$('#myWealth').textContent=fa(p.wealth);$('#myWager').textContent=p.wager?fa(p.wager):'۰';$('#chips').innerHTML=playerChipRow();$('#myBetChips').innerHTML=wagerRow();$('#myPact').hidden=!p.pact;
    var lock=$('[data-lock]'),end=$('[data-end-turn]'),next=$('[data-next]'),undo=$('[data-undo]');
    lock.hidden=g.phase!=='bet'||p.locked;lock.disabled=!p.wager||p.locked;
    undo.style.display=g.phase==='bet'&&!p.locked&&p.wager?'block':'none';
    end.hidden=!mine;end.disabled=!mine||p.coalCount<1;
    next.hidden=g.phase!=='settlement'&&g.phase!=='game-over';next.textContent=tutorialMode&&tutorialFinished?'پایان آموزش':g.gameOver?'بازی تمام شد':'دست بعد';next.disabled=(g.gameOver&&!tutorialFinished)||!!(g.pactOffers&&g.pactOffers.length);
    $('#bankValue').textContent=fa(g.bank);$('#coalCount').textContent=fa(g.available.length);$('#myRoundWager').textContent=fa(p.wager||0);var devils=g.coals.filter(function(c){return c.kind==='devil';}),revealedDevils=devils.filter(function(c){return c.revealed;}).length;$('#devilCount').textContent=fa(revealedDevils)+'/'+fa(devils.length);
  }
  function statusText(){
    if(g.phase==='bet')return g.players[0].locked?'شرط تو قفل شد؛ پس از قفل‌شدن شرط همه، مبلغ‌ها آشکار می‌شوند و دست آغاز می‌شود.':'چیپ‌های شرط را انتخاب کن و «قفل شرط» را بزن؛ مبلغت تا شروع دست مخفی می‌ماند.';
    if(g.phase==='bet-reveal')return 'شرط‌ها آشکار شدند؛ آغازگر این دست: '+g.players[g.turn].name+'؛ نوبت‌ها به‌ترتیب می‌چرخد.';
    if(g.phase==='play'){if(g.turn===0)return g.players[0].coalCount?'زغال امن رو شد؛ می‌توانی زغال دیگری برداری یا نوبت را تمام کنی. رو شدن شیطان، نوبتت را تمام می‌کند.':'از کوره یک زغال بردار؛ پس از برداشت امن می‌توانی نوبت را تمام کنی. رو شدن شیطان، نوبتت را تمام می‌کند.';return g.players[g.turn].name+' در حال انتخاب زغال است؛ زغال‌های رو‌شده برای همه روی صفحه می‌مانند.';}
    if(g.phase==='settlement')return g.gameOver?'بازی به پایان رسید؛ نتیجه و امتیاز نهایی را در خلاصه بازی ببین.':'دست '+fa(g.round)+' تمام شد؛ خلاصهٔ امتیازها را ببین یا برای ادامه «دست بعد» را بزن.';
    if(g.phase==='game-over')return 'بازی تمام شد';
    return '';
  }
  function tutorialMessage(){if(!tutorialMode||!g)return '';var p=g.players[0],round=tutorialRound;if(g.phase==='bet')return 'چیپ‌ها را انتخاب کن و «قفل شرط» را بزن؛ رایانه هم شرط می‌بندد و تا آن موقع مبلغ‌ها مخفی‌اند.';if(g.phase==='bet-reveal')return 'شرط‌ها رو شدند. بیشترین شرط آغازگر است؛ حالا ترتیب نوبت‌ها را دنبال کن.';if(g.phase==='play'){if(g.turn!==0)return 'به انتخاب رایانه دقت کن: زغال امن به مجموع دست اضافه می‌شود و با شیطان نوبتش تمام می‌شود.';if(round===1)return p.coalCount?'زغال امن رو شد. می‌توانی زغال دیگری برداری یا «پایان نوبت» را بزنی؛ شرطت با بیشترین برداشت امنِ هر بازیکن، حتی حریف، سنجیده می‌شود.':'برای شروع، یکی از زغال‌های وسط را لمس کن؛ فقط زغال رو‌شده مقدارش را نشان می‌دهد.';if(round===2)return p.coalCount?'دست دوم: بعد از برداشت امن تصمیم بگیر ادامه بدهی یا متوقف شوی؛ اگر شیطان رو شود برداشت امن این دستت از بین می‌رود.':'دست دوم روی ریسک تمرکز دارد: زغال بردار و تفاوت زغال امن و شیطان را ببین.';return p.coalCount?'دست سوم: نتیجهٔ امن همه و پاداش بیشترین برداشت را دنبال کن؛ اگر پیمان داری، رو شدن شیطان توسط حریف ۵۰ چیپ منتقل می‌کند.':'دست سوم: پیمان، انتقال ۵۰ چیپی و باقی‌ماندن زغال‌های کوره را در تسویه بررسی می‌کنیم.';}if(g.phase==='settlement'){var best=g.settled?g.settled.bestWager:0,max=g.settled?g.settled.maxHaul:0;return 'تسویهٔ دست '+fa(round)+' · بیشترین برداشت امن '+fa(max)+'، بالاترین شرط '+fa(best)+'؛ شرط‌های موفق پرداخت می‌گیرند و شرط ناموفق می‌سوزد.'+(round===3?' سه دست تمام شد؛ «پایان آموزش» را بزن.':' نتیجه را بخوان و برای درس بعد «دست بعد» را بزن.');}return tutorialFinished?'سه دست تمام شد؛ آموزش را ببند یا از خلاصه بازی نتیجه‌ها را مرور کن.':'';}
  function announceGuidance(){if(!g)return;var active=g.players[g.turn]||g.players[0],key=[g.phase,g.round,g.turn,g.turnIndex,g.phase==='bet'&&g.players[0].locked,g.turn===0?active.coalCount:''].join(':');if(key===lastGuidanceKey)return;lastGuidanceKey=key;var message=tutorialMode?'دست '+fa(tutorialRound)+' از ۳ · '+tutorialMessage():statusText();if(message)toast(message);}
  function render(){if(!g)return;document.body.dataset.phase=g.phase;$('#app').dataset.phase=g.phase;$('#roundLabel').textContent=fa(g.round);renderOpponents();renderLabels();renderPawns();renderCoals();renderDock();renderPlayerReveals();renderSafeHaul();activeStep();requestAnimationFrame(fitBoard);announceGuidance();persist();
    if(g.phase==='play'){var key=g.round+':'+g.turnIndex;if(key!==lastTurnKey){lastTurnKey=key;if(g.turn===0&&vibrationEnabled)try{navigator.vibrate&&navigator.vibrate([100,45,100]);}catch(e){}}}
  }
  function maybeSettle(){if(g.phase!=='settlement')return;var summary=E.settle(g);if(summary){summary.reveals=roundReveals.slice();if(tutorialMode){tutorialFinished=tutorialRound>=3;if(g.gameOver){g.gameOver=false;g.winners=[];g.phase='settlement';E.offerPact(g);}}render();if(g.gameOver){if(!tutorialMode)finishGame();}else maybeCpuPact();}}
  function showPact(){var d=$('#pactModal');if(!d.open){$('#pactText').textContent='تو در کمترین موجودی این دست هستی و می‌توانی برای دست بعد پیمان ببندی.';d.showModal();}}
  function maybeCpuPact(){var s=E.offerPact(g);if(s===0){showPact();return;}if(s!=null&&s>0){var current=g;setTimeout(function(){if(g!==current||E.offerPact(g)!==s)return;var style=personality(g.players[s]).id,odds=style==='risk'?.9:style==='cautious'?.42:style==='smart'?.72:style==='dumb'?.5:style==='normal'?.62:.55;var take=Math.random()<odds;if(take)E.acceptPact(g,s);else E.declinePact(g,s);render();maybeCpuPact();},700);}}
  function renderSummary(){
    var content=$('#summaryContent'),html='<div class="summary-note">دست‌های ثبت‌شده: '+fa(g.history.length)+' · دست جاری: '+fa(g.round)+'</div>';
    function roundBlock(s,current){
      var reveals=s.reveals||[],roundNo=s.round||g.round,bySeat=g.players.map(function(p,i){return reveals.filter(function(r){return r.seat===i;});});
      var out='<article class="history-round"><h3 class="summary-section-title">دست '+fa(roundNo)+(current?' · جاری':'')+'</h3><div class="summary-draws">'+g.players.map(function(p,i){var rr=bySeat[i],stored=s.players&&s.players[i],name=stored&&stored.name||p.name;return '<div class="summary-player-draw"><b><i class="pawn-dot pawn-'+i+'"></i>'+esc(name)+'</b><span>'+(rr.length?rr.map(function(r){return r.kind==='devil'?'شیطان':fa(r.value);}).join('، '):'برداشتی ندارد')+'</span></div>';}).join('')+'</div>';
      if(!current&&s.players){out+='<div class="summary-note">مجموع زغال امن: '+fa(s.totalSafeHaul)+' · بیشترین برداشت: '+fa(s.maxHaul)+' · بالاترین شرط: '+fa(s.bestWager)+'</div><table class="summary-table"><tr><th>بازیکن</th><th>شرط</th><th>برداشت امن</th><th>تسویه</th><th>موجودی</th></tr>'+s.players.map(function(p,i){return '<tr><td><i class="pawn-dot pawn-'+i+'"></i>'+esc(p.name)+(p.busted?' · شیطان':'')+'</td><td>'+fa(p.wager)+'</td><td>'+fa(p.haul)+'</td><td>'+(p.success?(p.doubled?'دوبرابر +'+fa(p.payout):'موفق +'+fa(p.payout)):'سوخت '+fa(p.burned))+'</td><td>'+fa(p.wealth)+'</td></tr>';}).join('')+'</table>';if(s.transfers&&s.transfers.length)out+='<div class="summary-note">انتقال پیمان: '+s.transfers.map(function(x){return esc(g.players[x.from].name)+' ← '+fa(x.amount)+' → '+esc(g.players[x.to].name);}).join('، ')+'</div>';if(s.highHaulPlayers&&s.highHaulPlayers.length)out+='<div class="summary-note">پاداش بیشترین برداشت امن: '+s.highHaulPlayers.map(function(i){return esc(g.players[i].name);}).join('، ')+' · هر نفر ۵۰ چیپ</div>';}
      else if(reveals.length)out+='<div class="summary-note">این دست هنوز تسویه نشده است.</div>';
      return out+'</article>';
    }
    if(!g.gameOver&&g.phase!=='settlement'&&(!g.history.length||g.history[g.history.length-1].round!==g.round))html+=roundBlock({round:g.round,reveals:roundReveals},true);
    if(g.settled&&!(g.history||[]).some(function(s){return s.round===g.settled.round;}))html+=roundBlock(g.settled,false);
    (g.history||[]).slice().reverse().forEach(function(s){html+=roundBlock(s,false);});
    if(g.gameOver)html+='<div class="summary-note">برنده: '+g.winners.map(function(i){return esc(g.players[i].name)+' ('+fa(g.players[i].wealth)+')';}).join('، ')+'</div>';
    content.innerHTML=html;
  }
  function summaryOpen(){renderSummary();if(!$('#summaryModal').open)$('#summaryModal').showModal();}
  function makeReport(){var n=g.players.length,rowsReport=[{l:'امتیاز نهایی',v:g.players.map(function(p){return p.wealth;}),h:1}];g.history.forEach(function(r){rowsReport.push({l:'دست '+r.round+' · شرط',v:r.players.map(function(p){return p.wager;})});rowsReport.push({l:'دست '+r.round+' · برداشت امن بازیکن',v:r.players.map(function(p){return p.haul;})});});var winners=g.winners||[],res=winners.length===1?winners[0]:'draw';return {id:'hell',gid:g.gameId,g:'فرار از جهنم',t:Date.now(),dur:Date.now()-(g.startedAt||Date.now()),n:n,names:g.players.map(function(p){return p.name;}),ai:g.players.map(function(p){return !!p.isAI;}),res:res,rows:rowsReport,sum:['موجودی بانک: '+fa(g.bank),'مجموع زغال امن دست آخر: '+fa(g.settled?g.settled.totalSafeHaul:0)],rounds:g.history};}
  function finishGame(){if(reportSent)return;reportSent=true;g.reportSent=true;var report=makeReport(),winner=g.winners.indexOf(0)>=0,rec={id:g.gameId,when:new Date().toLocaleDateString('fa-IR'),won:winner,rounds:g.history,names:g.players.map(function(p){return p.name;}),finalWealth:g.players[0].wealth,report:report};storeHistory(rec);persist();msgParent({type:'hell:report',report:report,result:winner?'w':'l',gameId:g.gameId,opponents:g.players.slice(1).map(function(p){return p.name;})});renderSummary();$('#summaryModal').showModal();}
  function reveal(id){if(!g||g.phase!=='play'||g.turn!==0)return;if(onlineMode){sendAction({a:'reveal',id:+id});return;}var ok=E.revealCoal(g,0,+id);if(!ok){toast('این زغال دیگر در دسترس نیست');return;}recordReveal(0,g.coals[+id]);if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}}
  function npcShouldStop(p){if(p.coalCount<1)return false;var totalSafe=Math.max(0,+g.totalSafeHaul||0);if(totalSafe<p.wager)return false;var style=personality(p).id,top=g.players.reduce(function(m,x){return Math.max(m,x.busted?0:x.haul);},0),hiddenDevils=9-g.coals.filter(function(c){return c.revealed&&c.kind==='devil';}).length,risk=hiddenDevils/Math.max(1,g.available.length),hasMet=p.haul>=p.wager,otherLocked=g.players.some(function(x,i){return i!==g.turn&&x.turnDone&&!x.busted&&x.haul>=p.wager;});if(style==='smart'){if(otherLocked)return true;if(hasMet&&p.haul>=top&&risk>=.1)return true;return p.coalCount>=3&&hasMet&&risk>.22;}if(style==='cautious')return otherLocked||hasMet||(p.coalCount>=3&&p.haul>=top&&risk>.1);if(style==='risk')return (hasMet&&Math.random()<.32)||(p.coalCount>=5&&Math.random()<.25);if(style==='dumb')return p.coalCount>=2&&Math.random()<.3;return otherLocked||(hasMet&&p.coalCount>=(difficulty===0?1:2)&&Math.random()<.55)||(p.coalCount>=4&&Math.random()<.3);}
  function scheduleAI(){clearTimeout(autoTimer);if(!g||g.phase!=='play'||g.turn<=0)return;var seat=g.turn,round=g.round;autoTimer=setTimeout(function(){if(!g||g.phase!=='play'||g.turn!==seat||g.round!==round)return;var p=g.players[seat],available=g.available.slice();if(!available.length){if(p.coalCount>0)E.endTurn(g,seat);else E.forcePassEmpty(g);if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}return;}var revealedToken=null;if(npcShouldStop(p)){E.endTurn(g,seat);toast(p.name+' نوبتش را تمام کرد');}else{var id=available[Math.floor(Math.random()*available.length)];revealedToken=g.coals[id];E.revealCoal(g,seat,id);}
      if(revealedToken)recordReveal(seat,revealedToken);if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}
    },1000+Math.floor(Math.random()*4001));}
  function endUserTurn(){if(!g)return;if(onlineMode){sendAction({a:'end-turn'});return;}if(!E.endTurn(g,0))return;toast('نوبتت تمام شد');if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}}
  function lockUser(){if(!g)return;if(onlineMode){sendAction({a:'lock'});return;}var p=g.players[0],ok;if(p.wealth<10){p.wager=0;p.wagerHidden=true;p.locked=true;if(g.players.every(function(x){return x.locked;}))g.phase='bet-reveal';ok=true;}else{ok=E.lockBet(g,0);}if(!ok){toast('برای بستن شرط دست‌کم ۱۰ چیپ انتخاب کن');return;}if(g.phase==='bet-reveal'){E.startRound(g);roundStartedAt=Date.now();toast('شرط‌ها آشکار شد · آغازگر '+g.players[g.turn].name);render();scheduleAI();}else{toast('شرطت قفل شد؛ منتظر رایانه بمان');render();}}
  function beginNextRound(){if(!g)return;if(onlineMode){sendAction({a:'next-round'});return;}if(!E.nextRound(g))return;if(tutorialMode){tutorialRound=Math.min(3,tutorialRound+1);tutorialFinished=false;}roundReveals=[];if($('#summaryModal').open)$('#summaryModal').close();for(var i=1;i<g.players.length;i++)npcWager(i,100+difficulty*50);g.players[0].wager=0;g.players[0].locked=false;g.players[0].wagerHidden=true;g.phase='bet';lastTurnKey='';roundStartedAt=Date.now();render();if(!tutorialMode)toast('دست '+fa(g.round)+' شروع شد؛ شرط خودت را ببند');}
  function choosePact(take){if(!g)return;if(onlineMode){$('#pactModal').close();sendAction({a:'pact',take:!!take});return;}var ok=take?E.acceptPact(g,0):E.declinePact(g,0);if(ok){$('#pactModal').close();render();maybeCpuPact();}}
  function startTutorial(){if(onlineMode)return;tutorialMode=true;tutorialRound=1;tutorialFinished=false;roundReveals=[];$('#helpModal').close();startGame(2,true);}
  function events(){
    $$('[data-count]').forEach(function(b){b.addEventListener('click',function(){$$('[data-count]').forEach(function(x){x.classList.toggle('selected',x===b);});});});
    $$('[data-difficulty]').forEach(function(b){b.addEventListener('click',function(){$$('[data-difficulty]').forEach(function(x){x.classList.toggle('selected',x===b);});difficulty=+b.dataset.difficulty;});});
    $('[data-start]').addEventListener('click',function(){startGame(+$('[data-count].selected').dataset.count,false);});
    $('[data-resume]').addEventListener('click',resumeGame);
    $$('[data-back]').forEach(function(b){b.addEventListener('click',sendBack);});
    document.addEventListener('click',function(e){var chip=e.target.closest('[data-chip]');if(chip&&g&&g.phase==='bet'&&!g.players[0].locked){if(onlineMode){sendAction({a:'wager-add',value:+chip.dataset.chip});return;}if(!E.addWager(g,0,+chip.dataset.chip))toast('موجودی چیپ برای این شرط کافی نیست');render();return;}var coal=e.target.closest('[data-coal-id]');if(coal){reveal(coal.dataset.coalId);return;}if(e.target.closest('[data-lock]')){lockUser();return;}if(e.target.closest('[data-end-turn]')){endUserTurn();return;}if(e.target.closest('[data-next]')){if(tutorialMode&&tutorialFinished){$('#tutorialDoneModal').showModal();return;}if(g.gameOver){summaryOpen();return;}beginNextRound();return;}if(e.target.closest('[data-summary]')){summaryOpen();return;}if(e.target.closest('[data-settings]')){$('#settingsModal').showModal();return;}if(e.target.closest('[data-help]')){$('#helpModal').showModal();return;}if(e.target.closest('[data-start-tutorial]')){startTutorial();return;}if(e.target.closest('[data-tutorial-exit]')){tutorialMode=false;tutorialFinished=false;g=null;$('#tutorialDoneModal').close();sendBack();return;}if(e.target.closest('[data-vibration]')){vibrationEnabled=!vibrationEnabled;localStorage.setItem('mb-hell-vibration',vibrationEnabled?'1':'0');e.target.closest('[data-vibration]').textContent='لرزش نوبت: '+(vibrationEnabled?'روشن':'خاموش');return;}if(e.target.closest('[data-undo]')){if(g&&g.phase==='bet'&&!g.players[0].locked){if(onlineMode){sendAction({a:'clear-wager'});return;}g.players[0].wager=0;render();}return;}var close=e.target.closest('[data-close]');if(close){var d=close.closest('dialog');if(d)d.close();return;}var pact=e.target.closest('[data-pact]');if(pact){choosePact(pact.dataset.pact==='yes');return;}});
    document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-coal-id]')){e.preventDefault();reveal(e.target.dataset.coalId);}});
  }
  function init(){var params=new URLSearchParams(location.search);onlineMode=params.get('online')==='1'||params.has('room');$('[data-start-tutorial]').hidden=onlineMode;$('[data-vibration]').textContent='لرزش نوبت: '+(vibrationEnabled?'روشن':'خاموش');profileName=(params.get('player')||'بازیکن').slice(0,24);$('#myName').textContent=profileName;events();window.addEventListener('resize',fitBoard,{passive:true});if(window.visualViewport)window.visualViewport.addEventListener('resize',fitBoard,{passive:true});
    if(onlineMode){$('.setup-lead').textContent='در حال اتصال به اتاق…';return;}
    if(validSave())$('[data-resume]').hidden=false;if(params.has('resume')&&validSave())resumeGame();}
  init();
})();
