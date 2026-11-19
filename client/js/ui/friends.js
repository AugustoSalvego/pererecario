// Amigos: interação entre jogadores por QR code (computação ubíqua por proximidade).
// Escanear o QR de alguém (pessoalmente) cria a amizade e solta uma perereca-presente.
import { getCatalog, frogImg, species, rarityBadge } from '../catalog.js';
import { store } from '../store.js';
import { api } from '../api.js';
import { giftFor, dayOf, maskFromSpecies, frogPrice, BALANCO } from '../shared/game.js';
import { icons } from './icons.js';
import { charHtml, lookOf } from './sprites.js';
import { coinBurst } from './jobs.js';
import { $, $$, h, esc, openSheet, closeSheet, toast, fmtDate, fmtCm } from './common.js';
import { sfx, vibrate } from '../audio.js';

const PREFIX = 'PERERECARIO:1:';
let ctx = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function myPayload() {
  const v = store.view;
  const mask = maskFromSpecies(getCatalog(), [...v.discovered]);
  return `${PREFIX}${v.player.id}:${mask}:${v.player.avatar || 'frog_leaf'}:${encodeURIComponent(v.player.displayName)}`;
}

function parsePayload(text) {
  if (!text || !text.startsWith(PREFIX)) return null;
  const [id, mask, avatar, ...rest] = text.slice(PREFIX.length).split(':');
  if (!id) return null;
  return { id, mask: Number(mask) >>> 0, avatar: species(avatar) ? avatar : 'frog_leaf', displayName: decodeURIComponent(rest.join(':') || 'Amigo') };
}

export function mountFriends(el, context) {
  ctx = context;
  el.innerHTML = `<div class="screen-head head-friends">
      <h2>Amigos</h2><p>Encontrou outro jogador? Escaneiem o QR um do outro!</p>
    </div>
    <div class="screen-body">
      <div class="card qr-card">
        <div class="qr-box"><div class="qr-svg"></div><div class="qr-frog"></div></div>
        <div class="code-pill"></div>
        <div style="font-size:14px;color:var(--ink-soft);font-weight:500;margin-bottom:14px">Mostre seu QR para um amigo escanear</div>
        <button class="btn block" data-act="scan" style="--c:#8f5ee0;--d:#6a3fc0">${icons.scan} Escanear QR de amigo</button>
        <div class="inline-input" style="margin-top:12px"><input placeholder="ou digite o código" maxlength="8" autocapitalize="characters" spellcheck="false"><button class="btn small ghost" data-act="code">OK</button></div>
      </div>
      <div class="trades-box hidden">
        <div class="section-title">Trocas <small class="ntrades"></small></div>
        <div class="list trade-list"></div>
      </div>
      <div class="section-title">Parceiros de brejo <small class="nfriends"></small></div>
      <div class="list friend-list"></div>
      <p class="friend-tip">Toque num parceiro para ver o perfil dele e oferecer uma troca. Cada parceiro novo vale <b>B$ ${BALANCO.porAmigo}</b>!</p>
      <div class="past-box hidden">
        <div class="section-title">Últimas trocas</div>
        <div class="list trade-list"></div>
      </div>
    </div>`;
  $('[data-act=scan]', el).addEventListener('click', () => { sfx.tap(); openScanner(); });
  $('.friend-list', el).addEventListener('click', (e) => {
    const row = e.target.closest('[data-friend]');
    if (row) { sfx.tap(); openFriendProfile(row.dataset.friend); }
  });
  $$('.trade-list', el).forEach((list) => list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-trade]');
    if (row) { sfx.tap(); openTrade(row.dataset.trade); }
  }));
  $('[data-act=code]', el).addEventListener('click', () => byCode($('.inline-input input', el)));
  $('.inline-input input', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') byCode(e.target); });
}

export async function renderFriends(el) {
  const v = store.view;
  if (!v.player) return;
  $('.code-pill', el).textContent = v.player.friendCode || '······';
  $('.qr-frog', el).innerHTML = frogImg(v.player.avatar || 'frog_leaf', 44);
  try {
    await loadScript('vendor/qrcode.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(myPayload());
    qr.make();
    $('.qr-svg', el).innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { $('.qr-svg', el).textContent = 'QR indisponível'; }

  const day = dayOf(store.now());
  // trocas andando ficam no alto; as últimas que terminaram ficam embaixo dos parceiros
  const past = v.trades.filter((t) => !v.activeTrades.includes(t)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  $('.trades-box', el).classList.toggle('hidden', !v.activeTrades.length);
  $('.ntrades', el).textContent = v.tradeActions ? `${v.tradeActions} esperando você` : '';
  $('.trades-box .trade-list', el).innerHTML = v.activeTrades.map(tradeRow).join('');
  $('.past-box', el).classList.toggle('hidden', !past.length);
  $('.past-box .trade-list', el).innerHTML = past.map(tradeRow).join('');

  $('.nfriends', el).textContent = v.friends.length ? `${v.friends.length}` : '';
  $('.friend-tip', el).classList.toggle('hidden', !v.friends.length);
  $('.friend-list', el).innerHTML = v.friends.length ? v.friends.map((f) => {
    const giftTaken = v.capturedSpawns.has(`gift:${v.player.id}:${f.id}:${day}`);
    const active = v.activeTrades.find((t) => t.friendId === f.id);
    return `<div class="card list-item friend-row" data-friend="${esc(f.id)}">
      <div class="avatar">${frogImg(f.avatar || 'frog_leaf', 34)}</div>
      <div class="grow"><div class="t">${esc(f.displayName)}${f.pending ? ' <small style="color:var(--water-dark)">☁️</small>' : ''}</div>
      <div class="s">${active ? '🔁 Troca em andamento' : giftTaken ? '🎁 Presente de hoje já recebido' : 'Escaneie o QR de novo para o presente de hoje'}</div></div>
      <div class="chev">${icons.back}</div>
    </div>`;
  }).join('') : `<div class="empty">${frogImg('frog_guava', 90)}<h3>Nenhum parceiro ainda</h3><p>Escaneie o QR de outro jogador: vocês dois ganham <b>B$ ${BALANCO.porAmigo}</b> e você leva uma perereca-presente!</p></div>`;
}

// ---------------- trocas ----------------
const STATUS = {
  invited: 'Convite enviado', open: 'Escolhendo', finishing: 'Trocando…', done: 'Troca feita',
  declined: 'Recusada', cancelled: 'Cancelada', failed: 'Desfeita', expired: 'Venceu',
};
const frogOrQ = (pick, size = 40) => (pick ? frogImg(pick.speciesId, size) : '<span class="tq">?</span>');

function tradeLine(t) {
  const who = esc(t.friendName || 'Amigo');
  if (t.status === 'invited') return t.dir === 'in' ? `<b>${who}</b> quer trocar com você` : `Esperando <b>${who}</b> aceitar`;
  if (t.status === 'open') return !t.mine ? 'Escolha a perereca que você vai dar' : `Esperando <b>${who}</b> escolher`;
  if (t.status === 'finishing') return 'As duas escolhidas: trocando…';
  if (t.status === 'done') return `Você trocou com <b>${who}</b>`;
  if (t.status === 'declined') return t.dir === 'out' ? `<b>${who}</b> recusou` : 'Você recusou';
  if (t.status === 'cancelled') return t.cancelledByMe ? 'Você cancelou' : `<b>${who}</b> cancelou`;
  if (t.status === 'failed') return 'Uma das pererecas saiu do brejo antes';
  return 'Ninguém terminou a tempo';
}

function tradeRow(t) {
  const act = (t.dir === 'in' && t.status === 'invited') || (t.status === 'open' && !t.mine);
  const live = ['invited', 'open', 'finishing'].includes(t.status);
  return `<div class="card list-item trade-row ${act ? 'act' : ''} ${live ? '' : 'past'}" data-trade="${esc(t.id)}">
    <div class="tr-frogs"><span class="tf">${frogOrQ(t.mine, 30)}</span><span class="tx">⇄</span><span class="tf">${frogOrQ(t.theirs, 30)}</span></div>
    <div class="grow"><div class="t">${t.status === 'invited' && t.dir === 'in' ? 'Convite recebido' : esc(STATUS[t.status] || t.status)}${t.pending ? ' <small>☁️</small>' : ''}</div><div class="s">${tradeLine(t)}</div></div>
    ${act ? '<span class="tr-dot"></span>' : ''}
  </div>`;
}

const priceOf = (p) => frogPrice(getCatalog(), p.speciesId, p.sizeCm);
function slot(pick, label, empty) {
  if (!pick) return `<div class="tslot empty"><div class="ts-frog"><span class="tq">?</span></div><small>${label}</small><b>${empty}</b></div>`;
  const s = species(pick.speciesId);
  return `<div class="tslot"><div class="ts-frog" style="--tier:${getCatalog().tiers[s.tier].color}">${frogImg(pick.speciesId, 64)}</div>
    <small>${label}</small><b>${esc(s.name)}</b><span class="ts-meta">${fmtCm(pick.sizeCm)} · vale B$ ${priceOf(pick)}</span></div>`;
}

// a troca aberta: o que cada um vai dar e os botões do momento
export function openTrade(id) {
  const t = store.view.trades.find((x) => x.id === id);
  if (!t) return;
  const who = esc(t.friendName || 'Amigo');
  const live = ['invited', 'open'].includes(t.status);
  const canPick = (t.status === 'open') || (t.status === 'invited' && t.dir === 'out');
  let actions = '';
  if (t.dir === 'in' && t.status === 'invited') {
    actions = `<button class="btn block" data-act="accept">Aceitar e escolher a minha</button><button class="btn ghost block" data-act="decline">Recusar</button>`;
  } else if (live) {
    actions = `${canPick ? `<button class="btn block" data-act="pick">${t.mine ? 'Trocar a minha escolha' : 'Escolher a minha perereca'}</button>` : ''}
      <button class="btn ghost block" data-act="cancel">Cancelar a troca</button>`;
  }
  const sheet = openSheet(`
    <h3 class="trade-title">🔁 Troca com ${who}</h3>
    <p class="lead trade-lead">${tradeLine(t)}${t.status === 'failed' && t.reason ? `: ${esc(t.reason)}` : ''}.</p>
    <div class="trade-pair">
      ${slot(t.mine, 'Você dá', t.status === 'invited' && t.dir === 'in' ? 'aceite para escolher' : 'escolha a sua')}
      <div class="tp-arrow">⇄</div>
      ${slot(t.theirs, `${who} dá`, live ? `${who} vai escolher` : '—')}
    </div>
    ${live ? '<p class="trade-note">Cada um escolhe a perereca que vai dar. Quando os dois tiverem escolhido, elas trocam de dono na hora. Favoritas não entram em troca.</p>' : ''}
    <div class="trade-actions">${actions}</div>`, { cls: 'trade-sheet' });
  $('[data-act=accept]', sheet)?.addEventListener('click', async () => {
    await store.respondTrade(t, true);
    sfx.pop();
    closeSheet(true);
    pickFor(t.id);
  });
  $('[data-act=decline]', sheet)?.addEventListener('click', async () => {
    await store.respondTrade(t, false);
    closeSheet();
    toast(`Você recusou a troca com ${who}.`, '', null, 2500);
  });
  $('[data-act=pick]', sheet)?.addEventListener('click', () => { closeSheet(true); pickFor(t.id); });
  $('[data-act=cancel]', sheet)?.addEventListener('click', async () => {
    await store.cancelTrade(t);
    closeSheet();
    toast('Troca cancelada.', '', null, 2500);
  });
}

// escolher a perereca que vai dar: as da bolsa, menos favoritas e as que já estão em outra troca
function pickFor(id) {
  const t = store.view.trades.find((x) => x.id === id);
  if (!t) return;
  const v = store.view;
  const cat = getCatalog();
  const mineNow = t.mine?.captureId;
  const options = v.bag.filter((c) => !c.favorite && (!v.reserved.has(c.id) || c.id === mineNow))
    .sort((a, b) => priceOf(b) - priceOf(a));
  const favs = v.bag.filter((c) => c.favorite).length;
  let chosen = mineNow || null;
  const sheet = openSheet(`
    <h3 class="trade-title">Qual perereca você vai dar?</h3>
    <p class="lead">${t.theirs ? `${esc(t.friendName)} vai te dar: <b>${esc(species(t.theirs.speciesId).name)}</b> (${fmtCm(t.theirs.sizeCm)}).` : `${esc(t.friendName)} ainda vai escolher a dele.`}</p>
    ${options.length ? `<div class="pick-grid">${options.map((c) => {
      const s = species(c.speciesId);
      return `<button class="pick-card ${c.id === chosen ? 'on' : ''}" data-cap="${esc(c.id)}" style="--tier:${cat.tiers[s.tier].color}">
        ${frogImg(c.speciesId, 54)}<b>${esc(s.name)}</b><small>${fmtCm(c.sizeCm)} · B$ ${priceOf(c)}</small></button>`;
    }).join('')}</div>` : `<div class="empty small"><p>Você não tem perereca para trocar${favs ? ' (as favoritas ficam guardadas: tire dos favoritos para trocar)' : ''}. Capture uma no mapa!</p></div>`}
    ${favs && options.length ? '<p class="trade-note">As favoritas (★) não aparecem aqui: ficam guardadas.</p>' : ''}
    <button class="btn block" data-act="give" ${chosen ? '' : 'disabled'}>Dar esta perereca</button>`, { cls: 'trade-sheet' });
  const give = $('[data-act=give]', sheet);
  $$('.pick-card', sheet).forEach((b) => b.addEventListener('click', () => {
    chosen = b.dataset.cap;
    sfx.tap();
    $$('.pick-card', sheet).forEach((x) => x.classList.toggle('on', x === b));
    give.disabled = false;
  }));
  give.addEventListener('click', async () => {
    const cap = v.bag.find((c) => c.id === chosen);
    const cur = store.view.trades.find((x) => x.id === id);
    if (!cap || !cur) return;
    await store.pickTrade(cur, cap);
    vibrate(20);
    sfx.pop();
    closeSheet();
    toast(cur.theirs ? 'Escolhida! Trocando…' : `Escolhida! Agora é a vez de ${esc(cur.friendName)}.`, 'ok', null, 3000);
  });
}

// perfil do parceiro: nível, XP, Brejais, espécies e o botão de oferecer troca
async function openFriendProfile(id) {
  const f = store.view.friends.find((x) => x.id === id);
  if (!f) return;
  const active = () => store.view.activeTrades.find((t) => t.friendId === id);
  const sheet = openSheet(`
    <div class="fp-head">
      <div class="fp-char">${charHtml(lookOf(f), { dir: 'down', scale: 2.6 })}</div>
      <div><h3>${esc(f.displayName)}</h3><p>parceiro de brejo desde ${fmtDate(f.since)}</p></div>
    </div>
    <div class="fp-stats"><p class="muted" style="text-align:center;grid-column:1/-1">Carregando o perfil…</p></div>
    <div class="fp-actions"></div>`, { cls: 'friend-sheet' });
  const actions = () => {
    const t = active();
    $('.fp-actions', sheet).innerHTML = t
      ? `<button class="btn block" data-act="see">🔁 Ver a troca em andamento</button>`
      : `<button class="btn block" data-act="offer">🔁 Oferecer uma troca</button><p class="trade-note">${esc(f.displayName)} recebe o convite. Se aceitar, cada um escolhe uma perereca e elas trocam de dono.</p>`;
    $('[data-act=see]', sheet)?.addEventListener('click', () => { closeSheet(true); openTrade(t.id); });
    $('[data-act=offer]', sheet)?.addEventListener('click', async () => {
      const tid = await store.offerTrade(f);
      sfx.pop();
      closeSheet(true);
      toast(`Convite enviado para ${esc(f.displayName)}! Já pode escolher a sua perereca.`, 'ok', null, 3500);
      pickFor(tid);
    });
  };
  actions();
  try {
    const p = await api.get(`/api/friends/profile?id=${encodeURIComponent(id)}`, { timeout: 15000 });
    $('.fp-char', sheet).innerHTML = charHtml(lookOf(p), { dir: 'down', scale: 2.6 });
    $('.fp-stats', sheet).innerHTML = [
      ['Nível', p.level], ['XP', p.xp], ['Brejais ganhos', `B$ ${p.gold}`], ['Espécies', `${p.species}/${getCatalog().species.length}`], ['Capturas', p.captures],
    ].map(([k, val], i) => `<div class="fp-stat ${i === 0 ? 'lv' : ''}"><b>${val}</b><span>${k}</span></div>`).join('');
  } catch (e) {
    $('.fp-stats', sheet).innerHTML = `<p class="muted" style="text-align:center;grid-column:1/-1">${e.kind === 'offline' ? 'Sem internet: o nível e o XP aparecem quando conectar. A troca funciona mesmo assim.' : esc(e.message)}</p>`;
  }
}

// troca feita: comemoração com as duas pererecas trocando de lado
export function showTradeDone(t) {
  if (!t?.mine || !t?.theirs) return;
  const got = species(t.theirs.speciesId);
  const gave = species(t.mine.speciesId);
  sfx.win();
  vibrate([30, 60, 30]);
  const sheet = openSheet(`
    <h3 class="trade-title">🎉 Troca feita!</h3>
    <div class="swap-anim">
      <div class="sw a">${frogImg(t.mine.speciesId, 74)}</div>
      <div class="sw b">${frogImg(t.theirs.speciesId, 74)}</div>
    </div>
    <p class="lead" style="text-align:center">Você deu <b>${esc(gave.name)}</b> e recebeu <b>${esc(got.name)}</b> de <b>${esc(t.friendName)}</b>.</p>
    <div style="text-align:center;margin-bottom:12px">${rarityBadge(t.theirs.speciesId)}</div>
    <button class="btn block" data-act="pond">Ver no Meu Brejo</button>`, { cls: 'trade-sheet' });
  $('[data-act=pond]', sheet).addEventListener('click', () => { closeSheet(); ctx?.showPond?.(); });
}

async function byCode(input) {
  const code = input.value.trim().toUpperCase();
  if (code.length < 4) return;
  try {
    const f = await api.get(`/api/players/code?code=${encodeURIComponent(code)}`);
    input.value = '';
    await handleFriend(f);
  } catch (e) {
    toast(e.kind === 'offline' || e.kind === 'server-down' ? 'O código precisa de internet. Offline, use o QR!' : e.message, 'warn');
  }
}

export async function handleFriend(friend) {
  const v = store.view;
  if (friend.id === v.player.id) { toast('Esse é o seu próprio QR! 😄', 'warn'); return; }
  const isNew = await store.addFriend(friend);
  vibrate(30);
  sfx.pop();
  if (isNew) {
    const paid = store.view.friends.length <= BALANCO.amigosQuePagam;
    toast(`Você e ${esc(friend.displayName)} agora são parceiros de brejo!${paid ? ` <b>+B$ ${BALANCO.porAmigo}</b>` : ''}`, 'ok', 'friends', 3500);
    if (paid) { coinBurst($('.money-pill') || document.body, 8); sfx.coin?.(); }
  }
  const gift = giftFor(v.player.id, friend.id, dayOf(store.now()), friend.mask >>> 0, getCatalog());
  if (store.view.capturedSpawns.has(gift.id)) {
    toast(`Você já pegou o presente de hoje de ${esc(friend.displayName)}. Volte amanhã!`, '', 'clock');
    ctx?.refresh?.();
    return;
  }
  const sheet = openSheet(`
    <div class="stage-lg unknown">${frogImg(gift.speciesId, 150)}</div>
    <h3>🎁 Presente de ${esc(friend.displayName)}!</h3>
    <p class="lead">Uma perereca pulou do QR do seu amigo. Pegue antes que ela fuja para o brejo!</p>
    <button class="btn sun block" data-act="catch">Capturar!</button>
  `);
  $('[data-act=catch]', sheet).addEventListener('click', () => {
    closeSheet(true);
    ctx?.capture({ ...gift, mask: friend.mask >>> 0, friendId: friend.id });
  });
  ctx?.refresh?.();
}

async function openScanner() {
  const app = $('#app');
  const el = h(`<div class="scanner">
    <video playsinline muted></video><div class="frame"></div>
    <div class="scan-top"><button class="icon-btn" data-act="close">${icons.close}</button><b>Escanear amigo</b><span style="width:48px"></span></div>
    <div class="scan-bottom">Aponte para o QR code no celular do seu amigo</div>
  </div>`);
  app.appendChild(el);
  const video = $('video', el);
  let stream = null, timer = null, stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    el.remove();
  };
  $('[data-act=close]', el).addEventListener('click', stop);

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    stop();
    toast('Não consegui abrir a câmera. Permita o acesso ou digite o código do amigo.', 'warn', 'scan', 4500);
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {}
  }
  if (!detector) await loadScript('vendor/jsQR.js').catch(() => {});
  const canvas = document.createElement('canvas');
  const c2d = canvas.getContext('2d', { willReadFrequently: true });

  const tick = async () => {
    if (stopped) return;
    let text = null;
    try {
      if (video.readyState >= 2) {
        if (detector) {
          const codes = await detector.detect(video);
          text = codes[0]?.rawValue || null;
        } else if (window.jsQR) {
          const scale = Math.min(1, 480 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          c2d.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = c2d.getImageData(0, 0, canvas.width, canvas.height);
          text = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
        }
      }
    } catch {}
    const friend = parsePayload(text);
    if (friend) { stop(); handleFriend(friend); return; }
    if (text) $('.scan-bottom', el).textContent = 'Esse QR não é do Pererecário. Tente o QR do perfil do amigo.';
    timer = setTimeout(tick, 220);
  };
  tick();
}
