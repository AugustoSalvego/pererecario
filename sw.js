/* Cache somente do app-shell local. Tiles OSM não são pré-baixados em massa. */
const VERSION='pererecario-v2-game-first-20261117';
const ASSETS=['/','/index.html','/src/app.js','/src/app.css','/src/db.js','/src/engine.js','/src/map.js','/src/sync.js','/data/campus.json','/assets/species.json','/assets/frogs_atlas.png','/assets/campus_pond.webp','/assets/icon-192.png','/assets/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin || url.pathname.startsWith('/api/'))return;
  // Navigation: network-first so published updates arrive; cached fallback when offline.
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(VERSION).then(c=>c.put('/index.html',copy));}return response;}).catch(()=>caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(VERSION).then(c=>c.put(req,copy));}return response;})));
});
