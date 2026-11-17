import { loadCatalog } from './catalog.js';
import { store } from './store.js';
import { sync } from './sync.js';
import { renderLogin } from './ui/login.js';
import { startGame } from './ui/game.js';
import { toast } from './ui/common.js';

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
    });
  }
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').insertAdjacentHTML('beforeend',
    `<div style="position:absolute;inset:auto 16px 24px;background:#fff;border-radius:16px;padding:16px;z-index:200;font-weight:500">Não foi possível iniciar o jogo: ${String(e.message || e)}</div>`);
});
