/* offline cache for the game; the version stamp changes with every release.
   ASSETS is a separate, non-versioned cache for static media (assets/img,
   hub-assets, per-game assets folders): these files don't change when the
   app code is updated, so they must NOT be wiped on every deploy -- only
   the small CORE cache (app shell/html) is tied to VER and rotated. Bump
   ASSETS_VER by hand only if the image files themselves are replaced. */
var VER='20261115081449',CORE='datis-core-'+VER,RUN='datis-run';
var ASSETS_VER='v1',ASSETS='datis-assets-'+ASSETS_VER;
var ASSET_RE=/\/(assets|hub-assets)\//;
var FILES=['./','index.html','manifest.webmanifest','peerjs.min.js','mb-192.png','mb-512.png','mb-maskable.png','mb-apple.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CORE).then(function(c){return c.addAll(FILES);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return (k.indexOf('datis-core-')===0&&k!==CORE)||(k.indexOf('datis-assets-')===0&&k!==ASSETS);}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET')return;
  var u=new URL(r.url);
  if(u.origin===location.origin){
    /* page: try the network first so updates arrive, fall back to the saved copy offline */
    if(r.mode==='navigate'){
      e.respondWith(fetch(r.url,{cache:'no-cache',credentials:'same-origin'}).then(function(res){var cp=res.clone();caches.open(CORE).then(function(c){c.put('index.html',cp);});return res;}).catch(function(){return caches.match('index.html').then(function(m){return m||caches.match('./');});}));
      return;
    }
    if(/\/(jaliz\.json|sb-config\.js)$/.test(u.pathname)){e.respondWith(fetch(r,{cache:'no-cache'}).then(function(res){var cp=res.clone();caches.open(CORE).then(function(c){c.put(r,cp);});return res;}).catch(function(){return caches.match(r);}));return;}
    /* static media: cache-first in the version-independent ASSETS cache, so it survives app deploys */
    if(ASSET_RE.test(u.pathname)){
      e.respondWith(caches.open(ASSETS).then(function(c){return c.match(r).then(function(m){return m||fetch(r).then(function(res){if(res&&res.ok)c.put(r,res.clone());return res;});});}));
      return;
    }
    e.respondWith(caches.match(r).then(function(m){return m||fetch(r).then(function(res){var cp=res.clone();caches.open(CORE).then(function(c){c.put(r,cp);});return res;});}));
    return;
  }
  /* fonts and other third-party files: show the saved copy at once and refresh it quietly */
  if(/fonts\.(googleapis|gstatic)\.com$|unpkg\.com$|jsdelivr\.net$/.test(u.hostname)){
    e.respondWith(caches.open(RUN).then(function(c){return c.match(r).then(function(m){
      var net=fetch(r).then(function(res){if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res;}).catch(function(){return m;});
      return m||net;
    });}));
  }
});
