// Service Worker: mantém o jogo disponível sem internet.
//  - "app shell" (HTML, CSS, JS, sprites) em cache na instalação;
//  - tiles do mapa e fontes guardados conforme são usados (cache-first);
//  - chamadas /api/* NUNCA passam pelo cache: o próprio app trata o offline
//    com IndexedDB e fila de sincronização.
const VERSION = 'pererecario-v1.12.0';
const SHELL = `${VERSION}-shell`;
const TILES = 'pererecario-tiles';
const FONTS = 'pererecario-fonts';
const MAX_TILES = 2500;

const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/api.js', 'js/db.js', 'js/store.js', 'js/sync.js', 'js/geo.js', 'js/sensors.js', 'js/audio.js', 'js/catalog.js',
  'js/shared/game.js',
  'js/ui/common.js', 'js/ui/icons.js', 'js/ui/login.js', 'js/ui/game.js', 'js/ui/map.js', 'js/ui/capture.js',
  'js/ui/album.js', 'js/ui/pond.js', 'js/ui/friends.js', 'js/ui/profile.js', 'js/ui/demo.js',
  'js/ui/sprites.js', 'js/ui/tutorial.js', 'js/ui/joystick.js', 'js/ui/others.js', 'js/ui/daynight.js', 'js/presence.js',
  'assets/species.json', 'assets/frogs_atlas.png',
  'assets/icons/icon-64.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png',
  'vendor/qrcode.js', 'vendor/jsQR.js',
  'assets/sprites/bubble-ex.png',
  'assets/sprites/bubble-q.png',
  'assets/sprites/bush-peek.png',
  'assets/sprites/bush.png',
  'assets/sprites/icon-book.png',
  'assets/sprites/icon-heart.png',
  'assets/sprites/lilypad.png',
  'assets/sprites/pond-big.png',
  'assets/sprites/pond-small.png',
  'assets/sprites/sparkle.png',
];

// bonecos: estilo-gênero-tom (mesma lista de LOOK_MODELS em js/shared/game.js)
for (const m of ['froghood', 'explorer', 'dartfrog', 'raincoat', 'scientist', 'fisher', 'sporty', 'farmer', 'student',
  'lantern', 'mage', 'royal', 'ninja', 'samurai', 'knight', 'pirate', 'magical', 'pilot']) {
  for (const g of ['masculino', 'feminino']) for (const t of ['clara', 'media', 'escura']) ASSETS.push(`assets/sprites/char-${m}-${g}-${t}.png`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.endsWith('-shell') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      cache.put(req, res.clone());
      if (cacheName === TILES && Math.random() < 0.02) trim(TILES, MAX_TILES);
    }
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

// app shell: responde do cache na hora e atualiza em segundo plano
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') return cache.match('index.html');
  return new Response('', { status: 504, statusText: 'offline' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname.startsWith('/admin')) return;
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.hostname.endsWith('basemaps.cartocdn.com') || url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(req, TILES));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONTS));
  }
});
