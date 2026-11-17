// Meu Brejo: todas as pererecas capturadas (inclusive repetidas).
import { frogImg, species, rarityBadge, getCatalog } from '../catalog.js';
import { store } from '../store.js';
import { icons } from './icons.js';
import { $, $$, esc, openSheet, closeSheet, fmtDate, fmtDateTime, fmtCm } from './common.js';
import { sfx } from '../audio.js';

let sort = 'recent';

export function mountPond(el) {
  el.innerHTML = `<div class="screen-head head-pond">
      <h2>Meu Brejo</h2><p class="sub"></p>
    </div>
    <div class="screen-body">
      <div class="filters">
        <button data-s="recent" class="on">Recentes</button><button data-s="rarity">Raridade</button>
        <button data-s="size">Tamanho</button><button data-s="fav">★ Favoritas</button>
      </div>
      <div class="grid2 specimens"></div>
    </div>`;
  $$('.filters button', el).forEach((b) => b.addEventListener('click', () => {
    sort = b.dataset.s;
    sfx.tap();
    $$('.filters button', el).forEach((x) => x.classList.toggle('on', x === b));
    renderPond(el);
  }));
  $('.specimens', el).addEventListener('click', async (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.stopPropagation();
      const c = store.view.captures.find((x) => x.spawnId === fav.dataset.fav);
      if (c) { sfx.tap(); await store.toggleFavorite(c); }
      return;
    }
    const card = e.target.closest('[data-spawn]');
    if (card) { sfx.tap(); openSpecimen(card.dataset.spawn); }
  });
}

const tierRank = { special: 0, rare: 1, uncommon: 2, common: 3 };

export function renderPond(el) {
  const v = store.view;
  let list = [...v.captures];
  if (sort === 'rarity') list.sort((a, b) => tierRank[species(a.speciesId).tier] - tierRank[species(b.speciesId).tier] || b.caughtAt - a.caughtAt);
  if (sort === 'size') list.sort((a, b) => b.sizeCm - a.sizeCm);
  if (sort === 'fav') list = list.filter((c) => c.favorite);
  const pending = v.captures.filter((c) => c.pending).length;
  $('.sub', el).textContent = `${v.captures.length} perereca${v.captures.length === 1 ? '' : 's'}${pending ? ` · ${pending} aguardando sincronizar` : ''}`;
  const grid = $('.specimens', el);
  if (!list.length) {
    grid.style.display = 'block';
    grid.innerHTML = `<div class="empty">${frogImg('frog_moss', 110)}<h3>${sort === 'fav' ? 'Nenhuma favorita ainda' : 'Seu brejo está vazio'}</h3>
      <p>${sort === 'fav' ? 'Toque na estrela de uma perereca para favoritar.' : 'Vá até um brejo do campus e capture sua primeira perereca!'}</p></div>`;
    return;
  }
  grid.style.display = '';
  const cat = getCatalog();
  grid.innerHTML = list.map((c) => {
    const s = species(c.speciesId);
    return `<div class="card spec-card ${c.pending ? 'pending' : ''}" data-spawn="${esc(c.spawnId)}" style="--tier:${cat.tiers[s.tier].color}">
      ${c.pending ? `<span class="sync-tag">${icons.cloud}pendente</span>` : ''}
      ${c.kind === 'gift' ? '<span class="gift-tag">🎁</span>' : ''}
      <div class="stage">${frogImg(c.speciesId, 70)}</div>
      <div class="row"><div><div class="nm">${esc(s.name)}</div><div class="meta">${fmtCm(c.sizeCm)} · ${fmtDate(c.caughtAt)}</div></div>
      <button class="fav-btn ${c.favorite ? 'on' : ''}" data-fav="${esc(c.spawnId)}" aria-label="Favoritar">${icons.star}</button></div>
    </div>`;
  }).join('');
}

function openSpecimen(spawnId) {
  const c = store.view.captures.find((x) => x.spawnId === spawnId);
  if (!c) return;
  const s = species(c.speciesId);
  const cat = getCatalog();
  const brejo = store.brejos.find((b) => b.id === c.brejoId);
  const friend = store.view.friends.find((f) => f.id === c.friendId);
  const sheet = openSheet(`
    <div class="stage-lg" style="--tier:${cat.tiers[s.tier].color}">${frogImg(c.speciesId, 150)}</div>
    <h3>${esc(s.name)}</h3>${rarityBadge(c.speciesId)}
    <div class="kv">
      <div><span>Tamanho</span><b>${fmtCm(c.sizeCm)}</b></div>
      <div><span>XP ganho</span><b>+${store.view.perCapture.get(c.id)?.xp || 0}</b></div>
      <div style="grid-column:span 2"><span>Capturada em</span><b>${fmtDateTime(c.caughtAt)}</b></div>
      <div style="grid-column:span 2"><span>Origem</span><b>${c.kind === 'gift' ? `🎁 Presente de ${esc(friend?.displayName || 'um amigo')}` : `📍 ${esc(brejo?.name || 'Brejo do campus')}`}</b></div>
      <div><span>Aparelho</span><b style="font-size:13px">${esc(c.deviceId)}${c.deviceId === store.deviceId ? ' (este)' : ''}</b></div>
      <div><span>Servidor</span><b style="font-size:14px">${c.pending ? '☁️ pendente' : '✅ sincronizada'}</b></div>
    </div>
    <button class="btn ${c.favorite ? 'ghost' : 'sun'} block" data-act="fav">${c.favorite ? 'Remover dos favoritos' : '★ Favoritar'}</button>
  `);
  $('[data-act=fav]', sheet).addEventListener('click', async () => { await store.toggleFavorite(c); closeSheet(); });
}
