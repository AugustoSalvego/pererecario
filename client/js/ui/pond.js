// Meu Brejo: a "bolsa" com as pererecas capturadas (inclusive repetidas), que podem ser vendidas
// por Brejais (B$). O preço vem de frogPrice (raridade + tamanho), igual no celular e no servidor.
// Favoritas ficam guardadas: não dá para vender sem tirar dos favoritos.
// Pererecas escolhidas numa troca em andamento ficam "em troca": não dá para vender nem favoritar.
import { findBrejo, frogPrice } from '../shared/game.js';
import { frogImg, species, rarityBadge, getCatalog } from '../catalog.js';
import { store } from '../store.js';
import { icons } from './icons.js';
import { coinBurst } from './jobs.js';
import { openTrade } from './friends.js';
import { $, $$, esc, setHtml, toast, openSheet, closeSheet, fmtDate, fmtDateTime, fmtCm } from './common.js';
import { sfx, vibrate } from '../audio.js';

let sort = 'recent';

const coin = (n) => `<span class="bcoin">B$</span>&nbsp;${n}`;
const priceOf = (c) => frogPrice(getCatalog(), c.speciesId, c.sizeCm);

export function mountPond(el) {
  el.innerHTML = `<div class="screen-head head-pond">
      <h2>Meu Brejo</h2><p class="sub"></p>
      <div class="bag-value hidden"></div>
    </div>
    <div class="screen-body">
      <div class="sell-dupes hidden"></div>
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
      const c = store.view.bag.find((x) => x.spawnId === fav.dataset.fav);
      if (c && store.view.reserved.has(c.id)) { sfx.error(); toast('Essa perereca está numa troca. Cancele a troca para guardar ela.', 'warn', null, 3000); return; }
      if (c) { sfx.tap(); await store.toggleFavorite(c); }
      return;
    }
    const card = e.target.closest('[data-spawn]');
    if (card) { sfx.tap(); openSpecimen(card.dataset.spawn, el); }
  });
  $('.sell-dupes', el).addEventListener('click', (e) => {
    if (e.target.closest('[data-act=dupes]')) { sfx.tap(); openSellDupes(el); }
  });
}

const tierRank = { special: 0, rare: 1, uncommon: 2, common: 3 };

// repetidas: de cada espécie fica uma (a favorita, senão a maior); o resto pode ser vendido.
// Favoritas e as que estão numa troca nunca entram na lista.
export function duplicatesOf(bag, reserved = store.view?.reserved || new Set()) {
  const bySp = new Map();
  for (const c of bag) {
    if (!bySp.has(c.speciesId)) bySp.set(c.speciesId, []);
    bySp.get(c.speciesId).push(c);
  }
  const out = [];
  for (const list of bySp.values()) {
    if (list.length < 2) continue;
    const keep = list.find((c) => c.favorite) || [...list].sort((a, b) => b.sizeCm - a.sizeCm || b.caughtAt - a.caughtAt)[0];
    for (const c of list) if (c !== keep && !c.favorite && !reserved.has(c.id)) out.push(c);
  }
  return out;
}

export function renderPond(el) {
  const v = store.view;
  const bag = v.bag;
  let list = [...bag];
  if (sort === 'rarity') list.sort((a, b) => tierRank[species(a.speciesId).tier] - tierRank[species(b.speciesId).tier] || b.caughtAt - a.caughtAt);
  if (sort === 'size') list.sort((a, b) => b.sizeCm - a.sizeCm);
  if (sort === 'fav') list = list.filter((c) => c.favorite);
  const pending = bag.filter((c) => c.pending).length;
  const worth = bag.filter((c) => !c.favorite && !v.reserved.has(c.id)).reduce((s, c) => s + priceOf(c), 0);
  $('.sub', el).textContent = `${bag.length} perereca${bag.length === 1 ? '' : 's'} na bolsa${pending ? ` · ${pending} aguardando sincronizar` : ''}`;
  const bv = $('.bag-value', el);
  bv.classList.toggle('hidden', !bag.length);
  setHtml(bv, `<span>Vale</span><b>${coin(worth)}</b>`);
  // vender repetidas
  const dupes = duplicatesOf(bag);
  const sd = $('.sell-dupes', el);
  sd.classList.toggle('hidden', !dupes.length);
  if (dupes.length) {
    const total = dupes.reduce((s, c) => s + priceOf(c), 0);
    setHtml(sd, `<div class="sd-frogs">${[...new Set(dupes.map((c) => c.speciesId))].slice(0, 3).map((id) => frogImg(id, 34)).join('')}</div>
      <div class="sd-txt"><b>${dupes.length} repetida${dupes.length === 1 ? '' : 's'}</b><small>Fica a maior de cada espécie</small></div>
      <button class="btn small sun" data-act="dupes">Vender por ${coin(total)}</button>`);
  }
  const grid = $('.specimens', el);
  if (!list.length) {
    grid.style.display = 'block';
    setHtml(grid, `<div class="empty">${frogImg('frog_moss', 110)}<h3>${sort === 'fav' ? 'Nenhuma favorita ainda' : 'Seu brejo está vazio'}</h3>
      <p>${sort === 'fav' ? 'Toque na estrela de uma perereca para favoritar. Favoritas ficam guardadas e não são vendidas.' : (v.sales.length ? 'Você vendeu todas! Vá até uma lagoinha ou procure no mato para pegar mais.' : 'Vá até uma lagoinha do mapa e capture sua primeira perereca!')}</p></div>`);
    return;
  }
  grid.style.display = '';
  const cat = getCatalog();
  setHtml(grid, list.map((c) => {
    const s = species(c.speciesId);
    const inTrade = v.reserved.has(c.id);
    return `<div class="card spec-card ${c.pending ? 'pending' : ''} ${inTrade ? 'in-trade' : ''}" data-spawn="${esc(c.spawnId)}" data-cap="${esc(c.id)}" style="--tier:${cat.tiers[s.tier].color}">
      ${c.pending ? `<span class="sync-tag">${icons.cloud}pendente</span>` : ''}
      ${c.kind === 'gift' ? '<span class="gift-tag">🎁</span>' : c.kind === 'trade' ? '<span class="gift-tag" title="Veio de uma troca">🔁</span>' : ''}
      <span class="price-tag ${c.favorite || inTrade ? 'kept' : ''}">${inTrade ? '🔁 em troca' : c.favorite ? '★ guardada' : coin(priceOf(c))}</span>
      <div class="stage">${frogImg(c.speciesId, 70)}</div>
      <div class="row"><div><div class="nm">${esc(s.name)}</div><div class="meta">${fmtCm(c.sizeCm)} · ${fmtDate(c.caughtAt)}</div></div>
      <button class="fav-btn ${c.favorite ? 'on' : ''}" data-fav="${esc(c.spawnId)}" aria-label="Favoritar">${icons.star}</button></div>
    </div>`;
  }).join(''));
}

// animação da venda: as pererecas pulam para fora do cartão, as moedas sobem e o saldo do topo pisca
function sellFx(el, caps, from) {
  for (const c of caps) {
    const card = el && $(`[data-cap="${CSS.escape(c.id)}"]`, el);
    if (card) card.classList.add('sold-out');
  }
  if (from) coinBurst(from, Math.min(14, 6 + caps.length * 2));
  sfx.coin();
  setTimeout(() => sfx.coin(), 160);
  vibrate([20, 40, 20]);
}

function sizeNote(c) {
  const s = species(c.speciesId);
  const cat = getCatalog();
  const [a, b] = s.sizeCm || cat.tiers[s.tier].sizeCm;
  const f = b > a ? (c.sizeCm - a) / (b - a) : 0;
  if (f >= 0.8) return 'Grandona! Vale mais';
  if (f <= 0.2) return 'Pequenininha';
  return 'Tamanho médio';
}

function openSpecimen(spawnId, el) {
  const c = store.view.bag.find((x) => x.spawnId === spawnId);
  if (!c) return;
  const s = species(c.speciesId);
  const cat = getCatalog();
  const brejo = c.brejoId ? findBrejo(c.brejoId, store.brejos, store.view.player?.id || '') : null;
  const friend = store.view.friends.find((f) => f.id === c.friendId);
  const price = priceOf(c);
  const trade = store.view.activeTrades.find((t) => t.mine?.captureId === c.id);
  const cameFrom = c.kind === 'trade' ? store.view.trades.find((t) => c.spawnId === `trade:${t.id}`) : null;
  const origin = c.kind === 'gift' ? `🎁 Presente de ${esc(friend?.displayName || 'um amigo')}`
    : c.kind === 'trade' ? `🔁 Troca com ${esc(friend?.displayName || cameFrom?.friendName || 'um amigo')}`
    : `📍 ${esc(brejo?.name || 'Lagoinha')}`;
  const sheet = openSheet(`
    <div class="stage-lg" style="--tier:${cat.tiers[s.tier].color}">${frogImg(c.speciesId, 150)}</div>
    <h3>${esc(s.name)}</h3>${rarityBadge(c.speciesId)}
    <div class="kv">
      <div><span>Tamanho</span><b>${fmtCm(c.sizeCm)}</b></div>
      <div><span>XP ganho</span><b>${c.kind === 'trade' ? '— (troca)' : `+${store.view.perCapture.get(c.id)?.xp || 0}`}</b></div>
      <div style="grid-column:span 2"><span>${c.kind === 'trade' ? 'Chegou em' : 'Capturada em'}</span><b>${fmtDateTime(c.caughtAt)}</b></div>
      <div style="grid-column:span 2"><span>Origem</span><b>${origin}</b></div>
      <div><span>Aparelho</span><b style="font-size:13px">${esc(c.deviceId)}${c.deviceId === store.deviceId ? ' (este)' : ''}</b></div>
      <div><span>Servidor</span><b style="font-size:14px">${c.pending ? '☁️ pendente' : '✅ sincronizada'}</b></div>
    </div>
    ${trade ? `<div class="sell-box kept in-trade">
      <div class="sb-info"><span>🔁 Em troca com ${esc(trade.friendName)}</span><b>${coin(price)}</b><small>Ela vai para ${esc(trade.friendName)} quando a troca fechar</small></div>
      <button class="btn" data-act="trade">Ver troca</button>
    </div>` : `<div class="sell-box ${c.favorite ? 'kept' : ''}">
      <div class="sb-info"><span>${c.favorite ? 'Favorita: fica guardada' : 'Vale na venda'}</span><b>${coin(price)}</b><small>${c.favorite ? 'Tire dos favoritos para poder vender' : `${esc(cat.tiers[s.tier].label)} · ${sizeNote(c)}`}</small></div>
      <button class="btn sun" data-act="sell" ${c.favorite ? 'disabled' : ''}>Vender</button>
    </div>
    <button class="btn ghost block" data-act="fav">${c.favorite ? 'Remover dos favoritos' : '★ Favoritar (guardar)'}</button>`}
  `);
  $('[data-act=trade]', sheet)?.addEventListener('click', () => { closeSheet(true); openTrade(trade.id); });
  $('[data-act=fav]', sheet)?.addEventListener('click', async () => { await store.toggleFavorite(c); closeSheet(); });
  $('[data-act=sell]', sheet)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    $('.stage-lg', sheet).classList.add('hop-away');
    sellFx(el, [c], btn);
    await store.sell(c);
    setTimeout(() => {
      closeSheet();
      toast(`+${coin(price)} · ${esc(s.name)} vendida!`, 'ok', null, 2600);
    }, 650);
  });
}

function openSellDupes(el) {
  const dupes = duplicatesOf(store.view.bag);
  if (!dupes.length) return;
  const total = dupes.reduce((s, c) => s + priceOf(c), 0);
  const groups = new Map();
  for (const c of dupes) groups.set(c.speciesId, (groups.get(c.speciesId) || 0) + 1);
  const sheet = openSheet(`
    <h3 style="margin-top:4px">Vender repetidas</h3>
    <p class="muted" style="margin:4px 0 12px">De cada espécie fica a maior (ou a favorita). As favoritas nunca são vendidas.</p>
    <div class="dupe-grid">${[...groups.entries()].map(([id, n]) => `<div class="dg-item">${frogImg(id, 52)}<b>${n}×</b><small>${esc(species(id).name)}</small></div>`).join('')}</div>
    <div class="sell-total"><span>Você recebe</span><b>${coin(total)}</b></div>
    <button class="btn sun block" data-act="go">Vender ${dupes.length} perereca${dupes.length === 1 ? '' : 's'}</button>
    <button class="btn ghost block" data-act="no">Agora não</button>
  `);
  $('[data-act=no]', sheet).addEventListener('click', () => closeSheet());
  $('[data-act=go]', sheet).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    $$('.dg-item', sheet).forEach((d, i) => setTimeout(() => d.classList.add('hop-away'), i * 70));
    sellFx(el, dupes, btn);
    await store.sell(dupes);
    setTimeout(() => {
      closeSheet();
      toast(`+${coin(total)} · ${dupes.length} repetida${dupes.length === 1 ? '' : 's'} vendida${dupes.length === 1 ? '' : 's'}!`, 'ok', null, 3000);
    }, 750);
  });
}
