// Pererecário: o álbum das 15 espécies (silhueta "???" até ser descoberta).
import { getCatalog, frogImg, rarityBadge, species } from '../catalog.js';
import { store } from '../store.js';
import { icons } from './icons.js';
import { $, $$, h, esc, openSheet, closeSheet, fmtDateTime, fmtCm, toast } from './common.js';
import { sfx } from '../audio.js';

let filter = 'all';

export function mountAlbum(el) {
  el.innerHTML = `<div class="screen-head head-album">
      <h2>Pererecário</h2><p class="sub"></p><div class="progress"><i></i></div>
    </div>
    <div class="screen-body">
      <div class="filters">
        <button data-f="all" class="on">Todas</button><button data-f="common">Comuns</button>
        <button data-f="uncommon">Incomuns</button><button data-f="rare">Raras</button><button data-f="special">Especial</button>
      </div>
      <div class="grid3 dex"></div>
    </div>`;
  $$('.filters button', el).forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    sfx.tap();
    $$('.filters button', el).forEach((x) => x.classList.toggle('on', x === b));
    renderAlbum(el);
  }));
  $('.dex', el).addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) { sfx.tap(); openSpecies(card.dataset.id); }
  });
}

export function renderAlbum(el) {
  const cat = getCatalog();
  const v = store.view;
  const total = cat.species.length;
  const found = v.discovered.size;
  $('.sub', el).textContent = `${found} de ${total} espécies descobertas`;
  $('.progress i', el).style.width = `${(found / total) * 100}%`;
  $('.dex', el).innerHTML = [...cat.species].sort((a, b) => a.index - b.index)
    .filter((s) => filter === 'all' || s.tier === filter)
    .map((s) => {
      const known = v.discovered.has(s.id);
      const n = v.bySpecies.get(s.id)?.count || 0;
      const t = cat.tiers[s.tier];
      return `<button class="card dex-card ${known ? `known p-${s.albumInteraction?.type}` : 'unknown'}" data-id="${s.id}" style="--tier:${t.color}">
        <span class="num">#${String(s.index).padStart(2, '0')}</span>
        ${known && n > 1 ? `<span class="owned">×${n}</span>` : ''}
        <div class="stage">${frogImg(s.id, 84)}</div>
        <div class="nm">${known ? esc(s.name) : '???'}</div>
      </button>`;
    }).join('');
}

export function openSpecies(id) {
  const s = species(id);
  const cat = getCatalog();
  const v = store.view;
  const known = v.discovered.has(id);
  const info = v.bySpecies.get(id);
  const t = cat.tiers[s.tier];
  const isAvatar = v.player?.avatar === id;
  const sheet = openSheet(`
    <div class="stage-lg ${known ? `p-${s.albumInteraction?.type}` : 'unknown'}" style="--tier:${t.color}">${frogImg(id, 160)}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h3>${known ? esc(s.name) : '???'}</h3><span style="color:#a0b3a7;font-weight:700">#${String(s.index).padStart(2, '0')}</span>
    </div>
    ${rarityBadge(id)}
    ${known ? `
      <p class="lead" style="margin-top:10px">${esc(s.description)}</p>
      <div class="personality"><b>✨ ${esc(s.albumInteraction?.name || '')}</b>${esc(s.albumInteraction?.description || '')}</div>
      <div class="kv">
        <div><span>No seu brejo</span><b>${info.count}</b></div>
        <div><span>Maior encontrada</span><b>${fmtCm(info.biggest.sizeCm)}</b></div>
        <div style="grid-column:span 2"><span>Primeira captura</span><b>${fmtDateTime(info.first.caughtAt)}</b></div>
      </div>
      <button class="btn ${isAvatar ? 'ghost' : 'sun'} block" data-act="avatar" ${isAvatar ? 'disabled' : ''}>${isAvatar ? 'Já é o seu avatar' : 'Usar como avatar'}</button>`
    : `<p class="lead" style="margin-top:10px">Você ainda não encontrou esta perereca. Procure nos brejos do campus${s.tier === 'special' || s.tier === 'rare' ? ' (ela é difícil de achar: chacoalhe o celular perto das moitas!)' : ''}.</p>
      <button class="btn block" data-act="close">Vou procurar!</button>`}
  `);
  $('[data-act=close]', sheet)?.addEventListener('click', () => closeSheet());
  $('[data-act=avatar]', sheet)?.addEventListener('click', async () => {
    await store.setAvatar(id);
    toast(`${s.name} agora é o seu avatar!`, 'ok', 'check');
    closeSheet();
  });
}
