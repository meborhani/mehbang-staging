// Kahroba (Splendor) server engine: extracted verbatim from online.html's kb* functions,
// adapted to the same createEngine(env) shape as jz_engine.mjs so core_kb.mjs can run it on the server.
export function createEngine(env){
var M=null,DIFF=1;
var rint=function(n){return Math.floor(Math.random()*n);};
var kbClock=null;
function kbNow(){return kbClock?kbClock():Date.now();}
var KBC=[],KBN=[];
(function(){
  var T=[[4, 0, [1, 1, 1, 1, 0]], [4, 0, [1, 1, 2, 1, 0]], [4, 0, [0, 1, 2, 2, 0]], [4, 0, [1, 3, 0, 0, 1]], [4, 0, [2, 1, 0, 0, 0]], [4, 0, [2, 0, 0, 2, 0]], [4, 0, [3, 0, 0, 0, 0]], [4, 1, [0, 0, 4, 0, 0]], [2, 0, [1, 1, 0, 1, 1]], [2, 0, [1, 2, 0, 1, 1]], [2, 0, [2, 2, 0, 1, 0]], [2, 0, [3, 1, 1, 0, 0]], [2, 0, [0, 0, 0, 1, 2]], [2, 0, [2, 0, 0, 0, 2]], [2, 0, [0, 0, 0, 0, 3]], [2, 1, [0, 4, 0, 0, 0]], [3, 0, [1, 1, 1, 0, 1]], [3, 0, [2, 1, 1, 0, 1]], [3, 0, [2, 0, 2, 0, 1]], [3, 0, [0, 0, 1, 3, 1]], [3, 0, [0, 2, 0, 0, 1]], [3, 0, [0, 0, 2, 0, 2]], [3, 0, [0, 0, 3, 0, 0]], [3, 1, [4, 0, 0, 0, 0]], [0, 0, [0, 1, 1, 1, 1]], [0, 0, [0, 1, 1, 1, 2]], [0, 0, [0, 2, 1, 0, 2]], [0, 0, [1, 0, 3, 1, 0]], [0, 0, [0, 0, 1, 2, 0]], [0, 0, [0, 2, 2, 0, 0]], [0, 0, [0, 3, 0, 0, 0]], [0, 1, [0, 0, 0, 0, 4]], [1, 0, [1, 0, 1, 1, 1]], [1, 0, [1, 0, 1, 2, 1]], [1, 0, [1, 0, 0, 2, 2]], [1, 0, [0, 1, 0, 1, 3]], [1, 0, [1, 0, 2, 0, 0]], [1, 0, [0, 2, 0, 2, 0]], [1, 0, [0, 0, 0, 3, 0]], [1, 1, [0, 0, 0, 4, 0]], [4, 1, [2, 0, 2, 3, 0]], [4, 1, [3, 0, 0, 3, 2]], [4, 2, [4, 2, 1, 0, 0]], [4, 2, [5, 3, 0, 0, 0]], [4, 2, [0, 0, 0, 5, 0]], [4, 3, [0, 0, 0, 0, 6]], [2, 1, [2, 3, 2, 0, 0]], [2, 1, [3, 0, 2, 0, 3]], [2, 2, [0, 0, 3, 5, 0]], [2, 2, [0, 1, 0, 2, 4]], [2, 2, [0, 0, 5, 0, 0]], [2, 3, [0, 0, 6, 0, 0]], [3, 1, [3, 2, 0, 0, 2]], [3, 1, [0, 3, 3, 2, 0]], [3, 2, [1, 4, 0, 0, 2]], [3, 2, [0, 5, 0, 0, 3]], [3, 2, [0, 5, 0, 0, 0]], [3, 3, [0, 0, 0, 6, 0]], [0, 1, [2, 3, 0, 3, 0]], [0, 1, [0, 0, 3, 2, 2]], [0, 2, [0, 0, 2, 4, 1]], [0, 2, [3, 0, 5, 0, 0]], [0, 2, [5, 0, 0, 0, 0]], [0, 3, [6, 0, 0, 0, 0]], [1, 1, [0, 2, 0, 2, 3]], [1, 1, [0, 2, 3, 0, 3]], [1, 2, [2, 0, 4, 1, 0]], [1, 2, [0, 0, 0, 3, 5]], [1, 2, [0, 0, 0, 0, 5]], [1, 3, [0, 6, 0, 0, 0]], [4, 3, [5, 3, 3, 3, 0]], [4, 4, [0, 7, 0, 0, 0]], [4, 4, [3, 6, 0, 0, 3]], [4, 5, [0, 7, 0, 0, 3]], [2, 3, [3, 3, 0, 3, 5]], [2, 4, [0, 0, 0, 7, 0]], [2, 4, [0, 0, 3, 6, 3]], [2, 5, [0, 0, 3, 7, 0]], [3, 3, [3, 5, 3, 0, 3]], [3, 4, [0, 0, 0, 0, 7]], [3, 4, [0, 3, 0, 3, 6]], [3, 5, [0, 0, 0, 3, 7]], [0, 3, [0, 3, 3, 5, 3]], [0, 4, [0, 0, 7, 0, 0]], [0, 4, [3, 0, 6, 3, 0]], [0, 5, [3, 0, 7, 0, 0]], [1, 3, [3, 0, 5, 3, 3]], [1, 4, [7, 0, 0, 0, 0]], [1, 4, [6, 0, 3, 3, 0]], [1, 5, [7, 0, 0, 3, 0]]];
  T.forEach(function(r,id){KBC.push({l:id<40?0:(id<70?1:2),c:r[0],p:r[1],cost:r[2]});});
  KBN=[[0, 0, 4, 4, 0], [4, 0, 4, 0, 0], [4, 4, 0, 0, 0], [0, 4, 0, 0, 4], [0, 0, 0, 4, 4], [3, 0, 3, 3, 0], [3, 3, 3, 0, 0], [3, 3, 0, 0, 3], [0, 3, 0, 3, 3], [0, 0, 3, 3, 3]];
})();
function kbShuf(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=rint(i+1),t=a[i];a[i]=a[j];a[j]=t;}return a;}
function ordMake(n){var o=[],i,j,t;for(i=0;i<n;i++)o.push(i);for(i=n-1;i>0;i--){j=Math.floor(Math.random()*(i+1));t=o[i];o[i]=o[j];o[j]=t;}return o;}
function ordNext(x,s){var o=x&&x.ord;if(!o||o.length!==M.n)return (s+1)%M.n;var i=o.indexOf(s);return o[(i+1)%o.length];}
function kbInit(){
  var n=M.n,g=n===2?4:(n===3?5:7),dk=[[],[],[]],i;
  KBC.forEach(function(c,id){dk[c.l].push(id);});
  dk.forEach(function(d){var s=kbShuf(d);d.length=0;s.forEach(function(v){d.push(v);});});
  var rows=dk.map(function(d){var r=[];for(var k=0;k<4;k++)r.push(d.pop());return r;});
  var nb=kbShuf([0,1,2,3,4,5,6,7,8,9]).slice(0,n+1);
  var pl=[];for(i=0;i<n;i++)pl.push({t:[0,0,0,0,0,0],c:[],r:[],nb:[]});
  M.x={bank:[g,g,g,g,g,5],deck:dk,rows:rows,nob:nb,pl:pl,ph:'act',endAt:false,first:0,lg:'',nc:[],tn:0,dl:0};M.sub=[];M.miss=[];
  M.x.ord=ordMake(n);M.x.first=M.x.ord[0];
  M.turn=M.x.first;
}
function kbBonus(p){var b=[0,0,0,0,0];p.c.forEach(function(id){b[KBC[id].c]++;});return b;}
function kbPts(p){var s=3*p.nb.length;p.c.forEach(function(id){s+=KBC[id].p;});return s;}
function kbTot(p){return p.t.reduce(function(a,b){return a+b;},0);}
function kbPay(p,card,bon){
  bon=bon||kbBonus(p);var pay=[0,0,0,0,0,0],short=0;
  for(var c=0;c<5;c++){var need=Math.max(0,card.cost[c]-bon[c]),use=Math.min(need,p.t[c]);pay[c]=use;short+=need-use;}
  if(short>p.t[5])return null;
  pay[5]=short;return pay;
}
function kbTakeOk(bank,c){
  if(!Array.isArray(c)||c.length<1||c.length>3)return false;
  var i,j,A=0;for(i=0;i<5;i++)if(bank[i]>0)A++;
  for(i=0;i<c.length;i++)if(!(c[i]>=0&&c[i]<5&&c[i]%1===0))return false;
  if(c.length===2&&c[0]===c[1])return bank[c[0]]>=4;
  for(i=0;i<c.length;i++){if(bank[c[i]]<1)return false;for(j=i+1;j<c.length;j++)if(c[i]===c[j])return false;}
  return c.length===Math.min(3,A);
}
function kbLegal(seat){
  var x=M.x,p=x.pl[seat],out=[],i,j,k,l;
  if(x.ph==='disc'){for(i=0;i<6;i++)if(p.t[i]>0)out.push({a:'dc',c:i});return out;}
  if(x.ph==='noble'){x.nc.forEach(function(id){out.push({a:'nb',id:id});});return out;}
  var A=[];for(i=0;i<5;i++)if(x.bank[i]>0)A.push(i);
  for(i=0;i<5;i++)if(x.bank[i]>=4)out.push({a:'tk',c:[i,i]});
  if(A.length>=3){for(i=0;i<A.length;i++)for(j=i+1;j<A.length;j++)for(k=j+1;k<A.length;k++)out.push({a:'tk',c:[A[i],A[j],A[k]]});}
  else if(A.length)out.push({a:'tk',c:A.slice()});
  var bon=kbBonus(p);
  for(l=0;l<3;l++)for(i=0;i<4;i++){
    var id=x.rows[l][i];if(id<0)continue;
    if(kbPay(p,KBC[id],bon))out.push({a:'by',s:'row',l:l,i:i});
    if(p.r.length<3)out.push({a:'rs',s:'row',l:l,i:i});
  }
  p.r.forEach(function(q,ri){var qi=typeof q==='object'?q.id:q;if(qi>=0&&kbPay(p,KBC[qi],bon))out.push({a:'by',s:'res',i:ri});});
  if(p.r.length<3)for(l=0;l<3;l++)if(x.deck[l].length)out.push({a:'rs',s:'deck',l:l});
  if(!out.length)out.push({a:'ps'});
  return out;
}
function kbRefill(l,i){var x=M.x;x.rows[l][i]=x.deck[l].length?x.deck[l].pop():-1;}
/* ready-made banter: this list and kbSay() are a verbatim mirror of online.html's own client-embedded
   kb copy (kept there for local/offline play) -- extracted here so the SAME {a:'ct'} action the client
   already sends in server rooms actually gets relayed (it was dropped during the original server
   extraction, so every "say" click in a Kahroba server room silently no-opped). Chat is intentionally
   allowed on any turn (no M.turn gate), matching Jaliz's and Poker's own server-side 'ct' handling. */
var KB_CH=['این کارت رو از دست بدی، حسرتش می‌مونه!','گوهرهای بانک داره تموم می‌شه، عجله کن 😏','من که پیشاپیش شاهزاده رو برداشتم!','نوبتت رو زود بازی کن، خوابم برد 😴','با این تخفیف‌هات که نمی‌رسی!','کارت رزرو کردی؟ ترسیدی؟ 😂','امتیازت کجا بود؟ 🤔','این دور رو من می‌برم، ببین!','گوهر طلا رو بده من، تو که بلد نیستی!','تو فقط کارت‌های ارزون می‌خری 😅','شاهزاده مال منه، دست نزن!','آفرین، حرکت خوبی بود 👏','بازی رو جدی بگیر، رقیب قدرتمندی داری!','اگه ببازی، شام با تو! 🍽️','کی گفته گوهر سیاه بی‌ارزشه؟','همین الان تخفیف سبز رو کامل می‌کنم!','قشنگ بود، ولی من جلوترم 😎','کهربا مال کسیه که صبر کنه!','این بازی رو از همین حالا بردم 🏆','یه حرکت خفن در راهه، منتظر باش!','نگران نباش، باخت هم درس خوبیه 😉','بازی عالی! ادامه بده 👌','حواست به پشته‌های سطح ۳ باشه!','تو بخر، من برنده می‌شم 😄'];
function kbSay(seat,i){var x=M.x;x.cn=(x.cn|0)+1;x.ch={s:seat,i:i,n:x.cn};}
function kbAct(seat,kind,m){return kbAct0(seat,kind,m);}
function kbAct0(seat,kind,m){
  var x=M.x;
  if(kind==='kb'&&m&&typeof m==='object'&&m.a==='ct'&&!M.over&&!M.wait){
    var ci=m.i;if(ci%1!==0||ci<0||ci>=KB_CH.length)return false;
    var nwt=kbNow();x.cl=x.cl||{};if(x.cl[seat]&&nwt-x.cl[seat]<1500)return false;x.cl[seat]=nwt;
    kbSay(seat,ci);return true;
  }
  if(kind!=='kb'||!m||typeof m!=='object'||M.over||M.wait||seat!==M.turn)return false;
  var p=x.pl[seat],a=m.a,ok=false,nm=M.names[seat];
  if(x.ph==='disc'){
    if(a!=='dc')return false;var c=m.c|0;if(!(c>=0&&c<6)||p.t[c]<1)return false;
    p.t[c]--;x.bank[c]++;if(kbTot(p)<=10)return kbPost(seat);
    return true;
  }
  if(x.ph==='noble'){
    if(a!=='nb'||x.nc.indexOf(m.id|0)<0)return false;
    kbGetNoble(seat,m.id|0);x.nc=[];return kbPost(seat,true);
  }
  if(a==='tk'){
    if(!kbTakeOk(x.bank,m.c))return false;
    m.c.forEach(function(c){x.bank[c]--;p.t[c]++;});
    x.lg=nm+' '+m.c.length+' مهره برداشت';stAdd(seat,'take',m.c.length);ok=true;
  }else if(a==='by'||a==='rs'){
    var l=m.l|0,id,card;
    if(a==='by'&&m.s==='res'){
      var ri=m.i|0;if(!p.r[ri])return false;id=p.r[ri].id;card=KBC[id];
      var pay=kbPay(p,card);if(!pay)return false;
      p.r.splice(ri,1);kbSpend(p,pay);p.c.push(id);
    }else{
      if(m.s==='deck'){
        if(a!=='rs'||!(l>=0&&l<3)||p.r.length>=3||!x.deck[l].length)return false;
        id=x.deck[l].pop();p.r.push({id:id,v:false});kbGold(p);stAdd(seat,'res');x.lg=nm+' یک کارت پنهان رزرو کرد';
      }else{
        var ci=m.i|0;if(!(l>=0&&l<3&&ci>=0&&ci<4)||m.s!=='row')return false;
        id=x.rows[l][ci];if(id<0)return false;card=KBC[id];
        if(a==='by'){
          var py=kbPay(p,card);if(!py)return false;
          kbSpend(p,py);p.c.push(id);kbRefill(l,ci);stAdd(seat,'buy');if(card.p)stAdd(seat,'bpt',card.p);x.lg=nm+' کارتی خرید';
        }else{
          if(p.r.length>=3)return false;
          p.r.push({id:id,v:true});kbRefill(l,ci);kbGold(p);stAdd(seat,'res');x.lg=nm+' یک کارت رزرو کرد';
        }
      }
    }
    ok=true;
  }else if(a==='ps'){
    var lg=kbLegal(seat);if(lg.length!==1||lg[0].a!=='ps')return false;
    x.lg=nm+' ردّ کرد';ok=true;
  }
  if(!ok)return false;
  return kbPost(seat);
}
function kbSpend(p,pay){var x=M.x;for(var c=0;c<6;c++){p.t[c]-=pay[c];x.bank[c]+=pay[c];}}
function kbGold(p){var x=M.x;if(x.bank[5]>0){x.bank[5]--;p.t[5]++;}}
function kbGetNoble(seat,id){var x=M.x,p=x.pl[seat];x.nob.splice(x.nob.indexOf(id),1);p.nb.push(id);stAdd(seat,'nob');x.lg=M.names[seat]+' اشراف‌زاده‌ای جذب کرد';}
function kbPost(seat,skipNoble){
  var x=M.x,p=x.pl[seat];
  if(kbTot(p)>10){x.ph='disc';return true;}
  if(!skipNoble){
    var bon=kbBonus(p),el=x.nob.filter(function(id){var rq=KBN[id];for(var c=0;c<5;c++)if(bon[c]<rq[c])return false;return true;});
    if(el.length===1)kbGetNoble(seat,el[0]);
    else if(el.length>1){x.ph='noble';x.nc=el;return true;}
  }
  x.ph='act';x.nc=[];
  if(kbPts(p)>=15)x.endAt=true;
  var nx=ordNext(x,seat);
  if(nx===x.first&&x.endAt){
    var best=-1,w=[],bc=0;
    x.pl.forEach(function(q,i){var s=kbPts(q);if(s>best||(s===best&&q.c.length<bc)){best=s;bc=q.c.length;w=[i];}else if(s===best&&q.c.length===bc)w.push(i);});
    M.over=true;M.res=w.length===1?w[0]:'draw';if(w.length===1)M.wins[w[0]]++;
  }else M.turn=nx;
  return true;
}
function kbNeedGems(p,card,bon){var m=[0,0,0,0,0],k=0;for(var c=0;c<5;c++){var d=Math.max(0,card.cost[c]-bon[c]-p.t[c]);m[c]=d;k+=d;}return {m:m,k:Math.max(0,k-p.t[5])};}
var KB_AI=[
 {n:'مهران',  wp:1.5, ch:.7,  nb:.8,  rs:2.2, bl:1.4, tk:.8,  no:.8},
 {n:'لیلا',   wp:.7,  ch:1.5, nb:1,   rs:.35, bl:.4,  tk:1.2, no:.7},
 {n:'سینا',   wp:.9,  ch:1,   nb:2.6, rs:.9,  bl:.8,  tk:1,   no:.9},
 {n:'نگار',   wp:1,   ch:1.1, nb:1,   rs:1.4, bl:2.6, tk:.9,  no:.9},
 {n:'بهرام',  wp:1.05,ch:1,   nb:1.1, rs:1,   bl:1,   tk:1,   no:1.6}
];
function kbAi(seat){
  var x=M.x,p=x.pl[seat],lg=kbLegal(seat),bon=kbBonus(p),d=DIFF;
  var pp=KB_AI[M.pp&&M.pp[seat]!==undefined?M.pp[seat]:4]||KB_AI[4];
  if(lg.length===1)return lg[0];
  if(d===0&&Math.random()<.25)return lg[rint(lg.length)];
  if(x.ph==='disc'){
    var best=null,bs=1e9;
    var tg0=kbTargets(p),w0=kbWant(p,tg0);
    lg.forEach(function(a){var s=a.c===5?100:w0[a.c]*3-p.t[a.c]*.1+Math.random();if(s<bs){bs=s;best=a;}});
    return best;
  }
  if(x.ph==='noble')return lg[0];
  var tg=kbTargets(p),want=kbWant(p,tg);
  var wb=[0,0,0,0,0];
  KBN.forEach(function(rq,id){if(x.nob.indexOf(id)<0)return;for(var c=0;c<5;c++)if(rq[c]>bon[c])wb[c]+=1;});
  var bestA=null,bsc=-1e9;
  var opps=x.pl.filter(function(q,j){return j!==seat;});
  lg.forEach(function(a){
    var s=0;
    if(a.a==='by'){
      var id=a.s==='res'?p.r[a.i].id:x.rows[a.l][a.i],cd=KBC[id],pay=kbPay(p,cd,bon);
      var sp=pay.reduce(function(u,v){return u+v;},0);
      s=60+cd.p*14*pp.wp+wb[cd.c]*5*pp.nb+(want[cd.c]>0?3:0)-sp*1.1*pp.ch+(p.c.length<5?5:0);
      if(kbPts(p)+cd.p>=15)s+=1000;
    }else if(a.a==='tk'){
      a.c.forEach(function(c){s+=(3+want[c]*5+wb[c]*1.5*pp.nb)*pp.tk;});
      if(a.c.length===2)s+=want[a.c[0]]>=2?6:-2;
      var over=Math.max(0,kbTot(p)+a.c.length-10);s-=over*5;
      if(a.c.length<3&&a.c.length!==2)s-=6;
    }else if(a.a==='rs'){
      var cid=a.s==='deck'?-1:x.rows[a.l][a.i];
      s=(4+(x.bank[5]>0?6:0))*pp.rs-p.r.length*4+(kbTot(p)>=9?-8:0);
      if(cid>=0){var cc=KBC[cid];s+=cc.p>=3?3:0;
        if(d>=1)opps.forEach(function(q){if(kbPay(q,cc))s+=(cc.p>=2?(d===2?14:6):2)*pp.bl;});
        var nd=kbNeedGems(p,cc,bon).k;if(nd<=3)s+=cc.p*2;}
    }else s=-50;
    s+=Math.random()*[30,7,1.5][d]*pp.no;
    if(s>bsc){bsc=s;bestA=a;}
  });
  return bestA;
}
function kbTargets(p){
  var x=M.x,bon=kbBonus(p),list=[];
  x.rows.forEach(function(r){r.forEach(function(id){if(id>=0)list.push(id);});});
  p.r.forEach(function(q){list.push(q.id);});
  list=list.map(function(id){var cd=KBC[id],nd=kbNeedGems(p,cd,bon);return {id:id,v:(cd.p*3+2)/(1+nd.k),nd:nd};});
  list.sort(function(a,b){return b.v-a.v;});
  return list;
}
function kbWant(p,tg){
  var w=[0,0,0,0,0];
  tg.slice(0,3).forEach(function(t,i){for(var c=0;c<5;c++)w[c]+=t.nd.m[c]/(1+i);});
  return w;
}
/* ---- server timer: one deadline per turn; call kbArm() whenever the active seat/phase changes ---- */
var KB_MS=60000;
function kbArm(){var x=M.x;x.dl=M.tmr?kbNow()+KB_MS:0;}
function kbTimers(){
  var x=M.x;if(!x||M.over||M.wait||!M.tmr||!x.dl||kbNow()<x.dl)return false;
  x.dl=0;var s=M.turn,p=x.pl[s];
  if(x.ph==='disc'){
    x.lg='زمان تمام شد؛ مهرهٔ اضافه برگشت';var guard=12,i;
    while(x.ph==='disc'&&M.turn===s&&kbTot(p)>10&&guard-->0){var c=-1,mx=0;for(i=0;i<5;i++)if(p.t[i]>mx){mx=p.t[i];c=i;}if(c<0)c=5;if(!kbAct(s,'kb',{a:'dc',c:c}))break;}
    /* forced discard can land on a multi-noble choice for the SAME turn (M.turn===s unchanged) --
       resolve it immediately too, so a single timeout always finishes the turn in one shot, exactly
       like the 'noble' branch below already guarantees on its own. Without this, the caller would see
       kbTimers() return true with the turn unchanged and no legitimate reason to arm a new deadline,
       leaving the player stuck in 'noble' phase with no timer at all. */
    if(x.ph==='noble'&&M.turn===s)kbAct(s,'kb',{a:'nb',id:x.nc[0]});
  }else if(x.ph==='noble'){
    x.lg='زمان تمام شد؛ شاهزاده خودکار';kbAct(s,'kb',{a:'nb',id:x.nc[0]});
  }else{
    x.lg='زمان تمام شد؛ نوبت رد شد';x.nc=[];kbPost(s,true);
  }
  return true;
}
function kbNeed(){return M.ai[M.turn]?M.turn:-1;}
function kbAiStep(seat){var a=kbAi(seat);if(a)kbAct(seat,'kb',a);}
function kbView(seat){
  var x=M.x;
  return {bank:x.bank,rows:x.rows,dk:x.deck.map(function(d){return d.length;}),nob:x.nob,
    pl:x.pl.map(function(p,i){return {t:p.t,c:p.c,r:p.r.map(function(q){return (i===seat||q.v)?q.id:-1;}),nb:p.nb};}),
    ph:x.ph,ea:x.endAt?1:0,fi:x.first,lg:x.lg,nc:x.nc,tn:x.tn|0,ch:x.ch||null,rem:(x.dl>0?Math.max(0,Math.min(61000,x.dl-kbNow())):0)};
}
function stInit(){M.st={t0:Date.now(),c:[]};for(var i=0;i<M.n;i++)M.st.c.push({});}
function stAdd(seat,k,v){if(!M||!M.st||seat<0||!M.st.c[seat])return;var o=M.st.c[seat];o[k]=(o[k]||0)+(v===undefined?1:v);}
function mgReport(){
  var n=M.n,st=M.st||{c:[]},c=function(i,k){return (st.c[i]&&st.c[i][k])||0;},rows=[],sum=[];
  function all(f){var a=[];for(var i=0;i<n;i++)a.push(f(i));return a;}
  function row(l,v,h){rows.push({l:l,v:v,h:h||0});}
  function sec(l){rows.push({l:l,v:null});}
  sec('خلاصه');
  row('نتیجه',all(function(i){return M.res==='draw'?'مساوی':(M.res===i?'برد':'باخت');}));
  sec('کهربا');
  row('امتیاز',all(function(i){return kbPts(M.x.pl[i]);}),1);
  row('کارت‌های خریده‌شده',all(function(i){return M.x.pl[i].c.length;}));
  row('اشراف‌زاده',all(function(i){return M.x.pl[i].nb.length;}));
  row('مهره برداشته‌شده',all(function(i){return c(i,'take');}));
  row('کارت رزرو‌شده',all(function(i){return c(i,'res');}));
  return {v:1,id:'kahroba',g:'کهربا',t:Date.now(),n:n,names:M.names.slice(0,n),ai:M.ai.slice(0,n),res:M.res,rows:rows,sum:sum,rn:M.rn};
}
return {get M(){return M;},set M(v){M=v;},kbInit:kbInit,kbAct:kbAct,kbNeed:kbNeed,kbAiStep:kbAiStep,kbTimers:kbTimers,kbArm:kbArm,kbView:kbView,
  mgReport:mgReport,stInit:stInit,setClock:function(f){kbClock=f;},setDiff:function(d){DIFF=d;}};
}
