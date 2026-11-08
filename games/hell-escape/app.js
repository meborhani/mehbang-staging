(function(){
  'use strict';
  var E=window.HellEscapeEngine;
  var $=function(s,r){return (r||document).querySelector(s);};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  var SAVE_KEY='mb-hell-escape-save-v1',HISTORY_KEY='mb-hell-escape-history-v1';
  var CHIP_VALUES=[10,20,50,100,200,500,1000],CHIP_COLORS={10:'#d71920',20:'#a9a7ac',50:'#15994d',100:'#e2a900',200:'#1467dc',500:'#df6b0e',1000:'#20242b'};
  var FALLBACK=['assets/avatars/avatar_ali.webp','assets/avatars/avatar_male2.webp','assets/avatars/avatar_maryam.webp','assets/avatars/avatar_sara.webp'];
  var CPU_NAMES=['کاوه','رها','سارا'];
  var PAWN_COLORS=['#f2c95b','#ef4944','#35c9dc','#4ccc70'];
  var g=null,avatarUrls=FALLBACK.slice(),difficulty=1,roundStartedAt=0,autoTimer=null,toastTimer=null,revealCloseTimer=null,lastTurnKey='',reportSent=false,profileName='بازیکن',roundReveals=[],vibrationEnabled=localStorage.getItem('mb-hell-vibration')!=='0';
  var rows=[4,6,7,8,8,7,5,3];
  var coalPoints=[]; (function(){var cy=520,yy=-189,id=0;rows.forEach(function(count){var gap=48,start=500-(count-1)*gap/2;for(var i=0;i<count;i++)coalPoints.push({id:id++,x:start+i*gap,y:cy+yy});yy+=54;});})();
  function fa(n){try{return new Intl.NumberFormat('fa-IR').format(n);}catch(e){return String(n);}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function msgParent(data){try{if(parent!==window)parent.postMessage(data,location.origin);}catch(e){}}
  function fromParent(d){if(!d||d.type!=='hell:set-avatars')return;if(d.profile)avatarUrls[0]=d.profile;if(Array.isArray(d.opponents))for(var i=1;i<4;i++)if(d.opponents[i-1])avatarUrls[i]=d.opponents[i-1];persist();render();}
  window.addEventListener('message',function(e){if(e.origin===location.origin)fromParent(e.data);});
  function toast(s){var el=$('#toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('show');},2100);}
  function safeRead(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
  function persist(){if(!g)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,game:g,difficulty:difficulty,avatarNames:g.players.map(function(p){return p.name;}),roundReveals:roundReveals}));}catch(e){toast('ذخیرهٔ بازی در این دستگاه ممکن نشد');}}
  function validSave(){var s=safeRead(SAVE_KEY);return !!(s&&s.version===1&&E.validate(s.game)&&!s.game.gameOver);}
  function normalizeSave(s){
    var game=s.game,logged=Array.isArray(s.roundReveals)?s.roundReveals:[],safeTotal=logged.reduce(function(sum,r){return sum+(r.kind==='coal'?(+r.value||0):0);},0);
    if(!Array.isArray(game.pactOffers))game.pactOffers=game.pactOffer==null?[]:[game.pactOffer];
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
  function avatarFor(i){return avatarUrls[i]||FALLBACK[i%FALLBACK.length];}
  function showGame(){ $('#setup').hidden=true;$('#game').hidden=false; }
  function showSetup(){ $('#game').hidden=true;$('#setup').hidden=false;document.body.dataset.phase='setup'; }
  function sendBack(){msgParent({type:'hell:back'});if(parent===window)showSetup();}
  function startGame(n){
    n=n||+$('[data-count].selected').dataset.count||4;
    roundReveals=[];g=E.createGame(n,getNames(n));g.gameId='hell-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);g.startedAt=Date.now();g.players.forEach(function(p,i){p.isAI=i>0;});var chosenDifficulty=+$('[data-difficulty].selected').dataset.difficulty;difficulty=Number.isFinite(chosenDifficulty)?chosenDifficulty:1;reportSent=false;
    for(var i=1;i<n;i++)E.addNpcWager(g,i,Math.random,100+difficulty*50);
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
  function playerRevealRow(p){return (p.reveals||[]).map(function(r){return '<span class="coal-reveal-badge'+(r.kind==='devil'?' devil-reveal':'')+'" data-player-reveal aria-label="'+(r.kind==='devil'?'شیطان':fa(r.value))+'"><img src="'+(r.kind==='devil'?'assets/devil.svg':'assets/coal.svg')+'" alt=""><small>'+(r.kind==='devil'?'♆':fa(r.value))+'</small></span>';}).join('');}
  function opponentCard(i){var p=g.players[i],active=g.phase==='play'&&g.turn===i;var bet=p.wagerHidden?'شرط مخفی':('شرط '+fa(p.wager)+' · امن '+fa(p.haul));var colors=['#f2c95b','#ef4944','#35c9dc','#4ccc70'];
    return '<article class="opponent'+(active?' is-active':'')+'" id="seat-'+i+'" data-seat="'+i+'"><span class="active-flames" aria-hidden="true"><i></i><i></i></span><img src="'+esc(avatarFor(i))+'" alt=""><span class="op-name">'+esc(p.name)+(p.pact?'<em class="pact-mark" title="هم‌پیمان شیطان">♆ پیمان</em>':'')+'</span><span class="op-meta">'+bet+(p.busted?' · شیطان':'')+'</span><small class="pawn-key opponent-pawn-key"><i style="background:'+colors[i%colors.length]+'"></i>مهره '+fa(i+1)+'</small><div class="op-reveals" aria-label="زغال‌های رو شدهٔ '+esc(p.name)+'">'+playerRevealRow(p)+'</div></article>';
  }
  function renderOpponents(){var o=$('#opponents');o.style.gridTemplateColumns='repeat('+Math.max(1,g.players.length-1)+',minmax(0,1fr))';o.innerHTML=g.players.slice(1).map(function(p,j){return opponentCard(j+1);}).join('');}
  function polyPoint(pos,seat,count){
    var path=[[830,895],[690,920],[540,925],[390,910],[250,875],[145,800],[78,680],[50,530],[75,380],[155,255],[285,155],[425,115],[575,115],[720,130],[850,195],[935,315],[950,465],[935,625],[900,775],[830,895]];
    var dist=pos/1600*(path.length-1),idx=Math.min(path.length-2,Math.floor(dist)),t=dist-idx,dx=path[idx+1][0]-path[idx][0],dy=path[idx+1][1]-path[idx][1],len=Math.sqrt(dx*dx+dy*dy)||1,spread=(seat-(count-1)/2)*64;return {x:path[idx][0]+dx*t-dy/len*spread,y:path[idx][1]+dy*t+dx/len*spread};
  }
  function renderPawns(){var h='',pawnAssets=['gold','red','cyan','green'],colors=['#f2c95b','#ef4944','#35c9dc','#4ccc70'];g.players.forEach(function(p,i){var position=Number.isFinite(p.scorePos)?p.scorePos:p.wealth,q=polyPoint(Math.max(0,Math.min(1600,position)),i,g.players.length);h+='<g class="pawn-piece pawn-seat-'+i+'" transform="translate('+q.x+' '+q.y+')" aria-label="'+esc(p.name)+' · مهره '+fa(i+1)+' · '+fa(position)+'"><title>'+esc(p.name)+' · مهره '+fa(i+1)+' · '+fa(position)+'</title><image href="assets/pawn-'+pawnAssets[i%pawnAssets.length]+'.svg" x="-26" y="-48" width="52" height="60"/></g>';});$('#pawns').innerHTML=h;var key=$('#myPawnKey');key.innerHTML='<i style="background:'+colors[0]+'"></i> مهرهٔ شما';}
  function renderLabels(){$('#trackLabels').replaceChildren();}
  function coalSvg(token,pt){var unavailable=g.available.indexOf(token.id)<0,cls='coal-token'+(unavailable?' not-available':' available')+(token.revealed?' is-revealed':'')+(token.revealed&&token.kind==='devil'?' is-devil':'');
    var body=token.revealed&&token.kind==='coal'?'<text class="coal-value" x="0" y="2">'+fa(token.value)+'</text>':'';
    var face='<g class="devil-face"><image href="assets/devil.svg" x="-21" y="-21" width="42" height="42"/><text class="coal-value" x="0" y="30">شیطان</text></g>';
    return '<g class="'+cls+'" data-coal-id="'+token.id+'" role="button" tabindex="0" aria-label="'+(unavailable?'زغال برداشته شد':'انتخاب زغال')+'" transform="translate('+pt.x+' '+pt.y+')"><circle class="hit" r="26"></circle><image class="coal-body" href="assets/coal.svg" x="-22" y="-22" width="44" height="44"></image>'+body+face+'</g>';
  }
  function renderCoals(){var h='';g.coals.forEach(function(t){h+=coalSvg(t,coalPoints[t.id]);});$('#coals').innerHTML=h;}
  function drawDescription(r){return r.kind==='devil'?'شیطان رو شد!':'زغال '+fa(r.value);}
  function renderRevealLog(){
    var list=$('#revealList'),notice=$('#drawNoticeText'),last=roundReveals[roundReveals.length-1];
    $('#revealCount').textContent=fa(roundReveals.length);
    if(!last){notice.textContent='هنوز برداشتی ثبت نشده';list.innerHTML='<p class="reveal-empty">با اولین برداشت، زغال‌های هر بازیکن اینجا به ترتیب دیده می‌شوند.</p>';$('#drawNotice').dataset.kind='empty';$('#drawStrip').innerHTML='';return;}
    $('#drawNotice').dataset.kind=last.kind;notice.textContent=last.name+' · '+drawDescription(last);
    list.innerHTML=roundReveals.map(function(r,index){var icon=r.kind==='devil'?'assets/devil.svg':'assets/coal.svg';return '<article class="reveal-entry'+(r.kind==='devil'?' is-devil':'')+'"><small>'+fa(index+1)+'</small><img src="'+icon+'" alt=""><span>'+esc(r.name)+'</span><b>'+(r.kind==='devil'?'شیطان':fa(r.value))+'</b></article>';}).join('');
    $('#drawStrip').innerHTML=roundReveals.map(function(r,index){return '<span class="draw-seq-item'+(r.kind==='devil'?' is-devil':'')+'" title="'+esc(r.name)+' · '+drawDescription(r)+'"><small>'+esc(r.name.split(/\s/)[0])+'</small><b>'+(r.kind==='devil'?'شیطان':fa(r.value))+'</b></span>';}).join('');
  }
  function recordReveal(seat,token){
    roundReveals.push({seat:seat,name:g.players[seat].name,kind:token.kind,value:token.value});renderRevealLog();
    if(seat!==0){clearTimeout(revealCloseTimer);summaryOpen('draws');revealCloseTimer=setTimeout(function(){var dialog=$('#summaryModal');if(dialog.open)dialog.close();},2800);}
  }
  function openRevealLog(){summaryOpen('draws');}
  function setSummaryTab(name){var selected=name==='draws'?'draws':'summary';$$('[data-summary-tab]').forEach(function(tab){var active=tab.dataset.summaryTab===selected;tab.setAttribute('aria-selected',active?'true':'false');tab.classList.toggle('active',active);});$('#summaryTab-summary').hidden=selected!=='summary';$('#summaryTab-draws').hidden=selected!=='draws';}
  function activeStep(){var step=g.phase==='bet'?'bet':g.phase==='play'?'coal':g.phase==='settlement'?'settle':'move';$$('[data-step]').forEach(function(el){el.classList.toggle('active',el.dataset.step===step);});}
  function renderDock(){var p=g.players[0],mine=g.phase==='play'&&g.turn===0&&!p.turnDone;
    var dock=$('#seat-0');dock.classList.toggle('is-active',mine);dock.classList.toggle('show-bet',g.phase==='play'||g.phase==='settlement'||g.phase==='game-over');
    $('#myAvatar').src=avatarFor(0);$('#myName').textContent=p.name;$('#myWealth').textContent=fa(p.wealth);$('#myHaul').textContent=fa(p.haul);$('#myWager').textContent=p.wager?fa(p.wager):'۰';$('#chips').innerHTML=playerChipRow();$('#myBetChips').innerHTML=wagerRow();$('#myReveals').innerHTML=playerRevealRow(p);$('#myReveals').classList.toggle('has-reveals',!!(p.reveals&&p.reveals.length));$('#myPact').hidden=!p.pact;
    var lock=$('[data-lock]'),end=$('[data-end-turn]'),next=$('[data-next]'),undo=$('[data-undo]');
    lock.hidden=g.phase!=='bet'||p.locked;lock.disabled=!p.wager||p.locked;
    undo.style.display=g.phase==='bet'&&!p.locked&&p.wager?'block':'none';
    end.hidden=!mine;end.disabled=!mine||p.coalCount<1;
    next.hidden=g.phase!=='settlement'&&g.phase!=='game-over';next.textContent=g.gameOver?'بازی تمام شد':'دست بعد';next.disabled=g.gameOver||!!(g.pactOffers&&g.pactOffers.length);
    $('#bankValue').textContent=fa(g.bank);
  }
  function statusText(){
    if(g.phase==='bet')return g.players[0].locked?'شرط‌ها قفل‌اند؛ منتظر بازشدن شرط‌ها':'با لمس چیپ‌ها شرط مخفی خودت را ببند';
    if(g.phase==='bet-reveal')return 'شرط‌ها آشکار شدند؛ آغازگر: '+g.players[g.turn].name;
    if(g.phase==='play'){if(g.turn===0)return 'یک زغال را انتخاب کن؛ پس از هر زغال می‌توانی نوبت را تمام کنی';return g.players[g.turn].name+' زغال برمی‌دارد…';}
    if(g.phase==='settlement')return g.gameOver?'بازی به پایان رسید':'دست '+fa(g.round)+' تمام شد · خلاصه بازی را ببین یا دست بعد را آغاز کن';
    if(g.phase==='game-over')return 'بازی تمام شد';
    return '';
  }
  function render(){if(!g)return;document.body.dataset.phase=g.phase;$('#app').dataset.phase=g.phase;$('#roundLabel').textContent='دست '+fa(g.round);$('#statusText').textContent=statusText();renderOpponents();renderLabels();renderPawns();renderCoals();renderDock();renderRevealLog();activeStep();persist();
    if(g.phase==='play'){var key=g.round+':'+g.turnIndex;if(key!==lastTurnKey){lastTurnKey=key;if(g.turn===0){if($('#summaryModal').open&&$('[data-summary-tab="draws"]').getAttribute('aria-selected')==='true'){clearTimeout(revealCloseTimer);revealCloseTimer=setTimeout(function(){if($('#summaryModal').open)$('#summaryModal').close();},1600);}if(vibrationEnabled)try{navigator.vibrate&&navigator.vibrate([100,45,100]);}catch(e){}}}}
  }
  function maybeSettle(){if(g.phase!=='settlement')return;var summary=E.settle(g);if(summary){render();if(g.gameOver)finishGame();else maybeCpuPact();}}
  function showPact(){var d=$('#pactModal');if(!d.open){$('#pactText').textContent='تو در کمترین موجودی این دست هستی و می‌توانی برای دست بعد پیمان ببندی.';d.showModal();}}
  function maybeCpuPact(){var s=E.offerPact(g);if(s===0){showPact();return;}if(s!=null&&s>0){var current=g;setTimeout(function(){if(g!==current||E.offerPact(g)!==s)return;var take=Math.random()<(difficulty===0?.3:difficulty===1?.55:.78);if(take)E.acceptPact(g,s);else E.declinePact(g,s);render();maybeCpuPact();},700);}}
  function renderSummary(){var content=$('#summaryContent'),html='',drawsBySeat=g.players.map(function(p,i){return roundReveals.filter(function(r){return r.seat===i;});});html+='<div class="summary-note">دست '+fa(g.round)+' · برداشت‌های ثبت‌شده: '+fa(roundReveals.length)+'</div><h3 class="summary-section-title">زغال‌های رو شدهٔ این دست</h3><div class="summary-draws">'+g.players.map(function(p,i){var draws=drawsBySeat[i];return '<div class="summary-player-draw"><b><i class="pawn-dot pawn-'+i+'"></i>'+esc(p.name)+'</b><span>'+(draws.length?draws.map(function(r){return r.kind==='devil'?'شیطان':fa(r.value);}).join('، '):'برداشتی ندارد')+'</span></div>';}).join('')+'</div>';if(g.settled){var s=g.settled;html+='<h3 class="summary-section-title">تسویهٔ دست</h3><div class="summary-note">مجموع زغال امن کل دست: '+fa(s.totalSafeHaul)+' · بیشترین برداشت امن یک بازیکن: '+fa(s.maxHaul)+' · بیشترین شرط: '+fa(s.bestWager)+'</div><table class="summary-table"><tr><th>بازیکن</th><th>شرط</th><th>برداشت امن</th><th>تسویه</th><th>موجودی</th></tr>'+s.players.map(function(p,i){return '<tr><td><i class="pawn-dot pawn-'+i+'"></i>'+esc(p.name)+(p.busted?' · شیطان':'')+'</td><td>'+fa(p.wager)+'</td><td>'+fa(p.haul)+'</td><td>'+(p.success?(p.doubled?'دوبرابر +'+fa(p.payout):'موفق +'+fa(p.payout)):'سوخت '+fa(p.burned))+'</td><td>'+fa(p.wealth)+'</td></tr>';}).join('')+'</table>';if(s.transfers.length)html+='<div class="summary-note">انتقال پیمان: '+s.transfers.map(function(x){return esc(g.players[x.from].name)+' ← '+fa(x.amount)+' → '+esc(g.players[x.to].name);}).join('، ')+'</div>';if(s.highHaulPlayers.length)html+='<div class="summary-note">پاداش بیشترین برداشت امن: '+s.highHaulPlayers.map(function(i){return esc(g.players[i].name);}).join('، ')+' · هر نفر ۵۰ چیپ</div>';}else html+='<div class="summary-note">تسویه پس از پایان نوبت همهٔ بازیکنان نمایش داده می‌شود.</div>';
    if(g.gameOver)html+='<div class="summary-note">برنده: '+g.winners.map(function(i){return esc(g.players[i].name)+' ('+fa(g.players[i].wealth)+')';}).join('، ')+'</div>';
    if(!html)html='<div class="summary-note">هنوز دستی تسویه نشده است.</div>';
    content.innerHTML=html;
  }
  function summaryOpen(tab){renderSummary();renderRevealLog();setSummaryTab(tab||'summary');if(!$('#summaryModal').open)$('#summaryModal').showModal();}
  function historyOpen(){var hist=readHistory(),html=hist.length?hist.slice().reverse().map(function(rec){return '<article class="history-round"><b>'+esc(rec.when||'بازی')+'</b> · '+(rec.won?'برد':'باخت')+' · '+fa(rec.rounds.length)+' دست · موجودی نهایی '+fa(rec.finalWealth||0)+'<br><small>'+esc(rec.names.join('، '))+'</small></article>';}).join(''):'هنوز بازی کاملی ثبت نشده است.';$('#historyContent').innerHTML=html;$('#summaryModal').close();$('#historyModal').showModal();}
  function makeReport(){var n=g.players.length,rowsReport=[{l:'امتیاز نهایی',v:g.players.map(function(p){return p.wealth;}),h:1}];g.history.forEach(function(r){rowsReport.push({l:'دست '+r.round+' · شرط',v:r.players.map(function(p){return p.wager;})});rowsReport.push({l:'دست '+r.round+' · برداشت امن بازیکن',v:r.players.map(function(p){return p.haul;})});});var winners=g.winners||[],res=winners.length===1?winners[0]:'draw';return {id:'hell',gid:g.gameId,g:'فرار از جهنم',t:Date.now(),dur:Date.now()-(g.startedAt||Date.now()),n:n,names:g.players.map(function(p){return p.name;}),ai:g.players.map(function(p){return !!p.isAI;}),res:res,rows:rowsReport,sum:['موجودی بانک: '+fa(g.bank),'مجموع زغال امن دست آخر: '+fa(g.settled?g.settled.totalSafeHaul:0)],rounds:g.history};}
  function finishGame(){if(reportSent)return;reportSent=true;g.reportSent=true;var report=makeReport(),winner=g.winners.indexOf(0)>=0,rec={id:g.gameId,when:new Date().toLocaleDateString('fa-IR'),won:winner,rounds:g.history,names:g.players.map(function(p){return p.name;}),finalWealth:g.players[0].wealth,report:report};storeHistory(rec);persist();msgParent({type:'hell:report',report:report,result:winner?'w':'l',gameId:g.gameId,opponents:g.players.slice(1).map(function(p){return p.name;})});renderSummary();$('#summaryModal').showModal();}
  function reveal(id){if(!g||g.phase!=='play'||g.turn!==0)return;var ok=E.revealCoal(g,0,+id);if(!ok){toast('این زغال دیگر در دسترس نیست');return;}recordReveal(0,g.coals[+id]);if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}}
  function scheduleAI(){clearTimeout(autoTimer);if(!g||g.phase!=='play'||g.turn<=0)return;var seat=g.turn,round=g.round;autoTimer=setTimeout(function(){if(!g||g.phase!=='play'||g.turn!==seat||g.round!==round)return;var p=g.players[seat],available=g.available.slice();if(!available.length){if(p.coalCount>0)E.endTurn(g,seat);else E.forcePassEmpty(g);if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}return;}var stopAfter=difficulty===0?1:(difficulty===1?2:3);var wantStop=p.coalCount>=stopAfter&&Math.random()<(difficulty===0?.65:difficulty===1?.45:.28),revealedToken=null;if(wantStop){E.endTurn(g,seat);toast(p.name+' نوبتش را تمام کرد');}else{var id=available[Math.floor(Math.random()*available.length)];revealedToken=g.coals[id];E.revealCoal(g,seat,id);}
      if(revealedToken)recordReveal(seat,revealedToken);if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}
    },1000+Math.floor(Math.random()*4001));}
  function endUserTurn(){if(!g||!E.endTurn(g,0))return;toast('نوبتت تمام شد');if(g.phase==='settlement')maybeSettle();else{render();scheduleAI();}}
  function lockUser(){if(!g||!E.lockBet(g,0)){toast('برای بستن شرط دست‌کم ۱۰ چیپ انتخاب کن');return;}if(g.phase==='bet-reveal'){E.startRound(g);roundStartedAt=Date.now();toast('شرط‌ها آشکار شد · آغازگر '+g.players[g.turn].name);render();scheduleAI();}else{toast('شرطت قفل شد؛ منتظر رایانه بمان');render();}}
  function beginNextRound(){if(!g||!E.nextRound(g))return;roundReveals=[];clearTimeout(revealCloseTimer);if($('#summaryModal').open)$('#summaryModal').close();for(var i=1;i<g.players.length;i++)E.addNpcWager(g,i,Math.random,100+difficulty*50);g.players[0].wager=0;g.players[0].locked=false;g.players[0].wagerHidden=true;g.phase='bet';lastTurnKey='';roundStartedAt=Date.now();render();toast('دست '+fa(g.round)+' شروع شد؛ شرط خودت را ببند');}
  function choosePact(take){if(!g)return;var ok=take?E.acceptPact(g,0):E.declinePact(g,0);if(ok){$('#pactModal').close();render();maybeCpuPact();}}
  function events(){
    $$('[data-count]').forEach(function(b){b.addEventListener('click',function(){$$('[data-count]').forEach(function(x){x.classList.toggle('selected',x===b);});});});
    $$('[data-difficulty]').forEach(function(b){b.addEventListener('click',function(){$$('[data-difficulty]').forEach(function(x){x.classList.toggle('selected',x===b);});difficulty=+b.dataset.difficulty;});});
    $('[data-start]').addEventListener('click',function(){startGame(+$('[data-count].selected').dataset.count);});
    $('[data-resume]').addEventListener('click',resumeGame);
    $$('[data-back]').forEach(function(b){b.addEventListener('click',sendBack);});
    document.addEventListener('click',function(e){var chip=e.target.closest('[data-chip]');if(chip&&g&&g.phase==='bet'&&!g.players[0].locked){if(!E.addWager(g,0,+chip.dataset.chip))toast('موجودی چیپ برای این شرط کافی نیست');render();return;}var coal=e.target.closest('[data-coal-id]');if(coal){reveal(coal.dataset.coalId);return;}if(e.target.closest('[data-summary-tab]')){setSummaryTab(e.target.closest('[data-summary-tab]').dataset.summaryTab);return;}if(e.target.closest('[data-reveals]')){openRevealLog();return;}if(e.target.closest('[data-lock]')){lockUser();return;}if(e.target.closest('[data-end-turn]')){endUserTurn();return;}if(e.target.closest('[data-next]')){if(g.gameOver){summaryOpen();return;}beginNextRound();return;}if(e.target.closest('[data-summary]')){summaryOpen();return;}if(e.target.closest('[data-settings]')){$('#settingsModal').showModal();return;}if(e.target.closest('[data-vibration]')){vibrationEnabled=!vibrationEnabled;localStorage.setItem('mb-hell-vibration',vibrationEnabled?'1':'0');e.target.closest('[data-vibration]').textContent='لرزش نوبت: '+(vibrationEnabled?'روشن':'خاموش');return;}if(e.target.closest('[data-history]')){historyOpen();return;}if(e.target.closest('[data-undo]')){if(g&&g.phase==='bet'&&!g.players[0].locked){g.players[0].wager=0;render();}return;}var close=e.target.closest('[data-close]');if(close){var d=close.closest('dialog');if(d)d.close();return;}var pact=e.target.closest('[data-pact]');if(pact){choosePact(pact.dataset.pact==='yes');return;}});
    document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-coal-id]')){e.preventDefault();reveal(e.target.dataset.coalId);}});
  }
  function init(){var params=new URLSearchParams(location.search);$('[data-vibration]').textContent='لرزش نوبت: '+(vibrationEnabled?'روشن':'خاموش');profileName=(params.get('player')||'بازیکن').slice(0,24);$('#myName').textContent=profileName;events();if(validSave())$('[data-resume]').hidden=false;if(params.has('resume')&&validSave())resumeGame();}
  init();
})();
