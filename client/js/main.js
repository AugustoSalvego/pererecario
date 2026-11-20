import { loadCatalog } from './catalog.js';
import { store } from './store.js';
import { sync } from './sync.js';
import { renderLogin } from './ui/login.js';
import { startGame } from './ui/game.js';
import { toast } from './ui/common.js';
import { setTileProvider } from './ui/map.js';
import { api } from './api.js';
import * as db from './db.js';

// iPhone: o Safari ignora o "não ampliar" da página; estes eventos de gesto são só dele.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });


async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW não registrado', e));
    const hadController = !!navigator.serviceWorker.controller;
    let shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || shown) return;
      shown = true;
      toast('Nova versão do jogo instalada. Ela será usada na próxima vez que abrir.', 'ok', 'sparkle', 4000);
    });
  }
  // pede ao navegador para não apagar os dados locais (IndexedDB) quando faltar espaço
  navigator.storage?.persist?.().catch(() => {});

  await loadCatalog();
  await store.init();
  // provedor do mapa: pergunta ao servidor (com tempo curto) e guarda para usar offline
  let config = await db.kvGet('config');
  try { config = await api.get('/api/config', { timeout: 2500 }); await db.kvSet('config', config); } catch {}
  setTileProvider(config || {});

  const splash = document.getElementById('splash');
  splash.classList.add('fade');
  setTimeout(() => splash.remove(), 450);

  if (store.session) {
    startGame();
    sync.start();
  } else {
    renderLogin((isNew) => {
      startGame({ firstTime: isNew });
      sync.start();
    }, config || {});
  }
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').insertAdjacentHTML('beforeend',
    `<div style="position:absolute;inset:auto 16px 24px;background:#fff;border-radius:16px;padding:16px;z-index:200;font-weight:500">Não foi possível iniciar o jogo: ${String(e.message || e)}</div>`);
});
