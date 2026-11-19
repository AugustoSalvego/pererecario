// Tela principal: mapa + HUD + navegação entre Pererecário, Meu Brejo, Amigos e Perfil.
import { GameMap, tilesAround, tileProvider } from './map.js';
import { openCapture } from './capture.js';
import { mountAlbum, renderAlbum, openSpecies } from './album.js';
import { mountPond, renderPond } from './pond.js';
import { mountFriends, renderFriends } from './friends.js';
import { mountProfile, renderProfile, loadRanking, renderSyncCard } from './profile.js';
import { openDemo } from './demo.js';
import { openTutorial } from './tutorial.js';
import { mountJoystick } from './joystick.js';
import { mountOthers } from './others.js';
import { skyPhase } from './daynight.js';
import { presence } from '../presence.js';
import { openJobTalk, runJobGame, startDelivery, deliveryState, cancelDelivery, finishDelivery, npcSprite } from './jobs.js';
import { openShop, carSprite, faceBubble } from './shop.js';
import { icons } from './icons.js';
import { charHtml, headHtml, img, lookOf, sparkleHtml, bearing, dirFromBearing } from './sprites.js';
import { $, $$, esc, toast, openSheet, closeSheet, fmtDist, ago } from './common.js';
import { getCatalog, frogImg, species } from '../catalog.js';
import { store } from '../store.js';
import { sync } from '../sync.js';
import { geo } from '../geo.js';
import { sensors } from '../sensors.js';
import { api } from '../api.js';
import { sfx, vibrate, unlockAudio } from '../audio.js';
import {
  spawnsFor, windowOf, windowEnd, distanceM, hash32, captureRange, REVEAL_RANGE_M, brejosNear, moitasNear, findBrejo, visibleInMode,
  FROG_VIEW_M, POND_VIEW_M, jobsNear, JOB_VIEW_M, JOB_RANGE_M, DELIVERY_RANGE_M, carById,
} from '../shared/game.js';

// ponto de referência para o raio de visão: o jogador (ou o centro do mapa, sem GPS)
const viewPoint = () => geo.pos || map?.center;
// cada jogador tem as suas lagoinhas e pererecas (a semente do sorteio é o id dele)
const seed = () => store.view.player?.id || '';
// lagoinhas em volta do jogador: as automáticas (que existem em qualquer lugar) e as
// cadastradas à mão. Recalcula só quando o jogador anda uns 20 m ou os brejos mudam.
let shownCache = { key: null, list: [] };
function brejosShown() {
  const vp = viewPoint();
  if (!vp) return [];
  const key = `${seed()}|${store.brejosVersion}|${store.brejos.length}|${Math.round(vp.lat * 5000)}|${Math.round(vp.lng * 5000)}`;
  if (shownCache.key !== key) shownCache = { key, list: brejosNear(store.brejos, vp, POND_VIEW_M + 60, seed()) };
  return shownCache.list;
}

// moitinhas por perto (pererecas soltas no mato, fora das lagoinhas). Não aparecem no mapa:
// só as pererecas (ou o matinho com "?") delas.
let moitaCache = { key: null, list: [] };
function moitasShown() {
  const vp = viewPoint();
  if (!vp) return [];
  const key = `${seed()}|${Math.round(vp.lat * 5000)}|${Math.round(vp.lng * 5000)}`;
  if (moitaCache.key !== key) moitaCache = { key, list: moitasNear(vp, FROG_VIEW_M + 40, seed()) };
  return moitaCache.list;
}

let map, current = 'map', ctx, lastWin = null, walkingTimer = null;
let playerDir = 'down', walking = false, lastPos = null, justRevealed = new Set();
let lastBalance = null;   // para animar o saldo quando entra dinheiro
const revealing = new Set(); // matinhos no meio da animação (espiando por 1 s antes de virar perereca)
const screens = {};

export function startGame({ firstTime = false } = {}) {
  const root = $('#game');
  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="map-host"></div>
    <div class="hud-top">
      <div class="left-col"><div class="lc-row"><button class="player-chip" data-nav="profile" aria-label="Perfil"><div class="avatar-wrap"><div class="avatar"></div><span class="lvl"></span></div><div class="who"><div class="name"></div><div class="xpbar"><i></i></div></div></button><button class="sky-badge" aria-label="Dia ou noite"></button></div><div class="nearby-chip hidden"></div></div>
      <div class="status-col"><button class="status-pill" aria-label="Estado da conexão"></button><button class="mode-btn" aria-label="Modo de andar"></button><button class="money-pill" aria-label="Saldo e loja"></button><div class="gps-chip"></div></div>
    </div>
    <div class="hint-bubble hidden"></div>
    <button class="compass hidden" aria-label="Lagoinha mais próxima"><span class="arrow">➤</span><span class="txt"></span></button>
    <button class="hud-expedition" data-nav="profile"></button>
    <div class="joystick hidden"></div>
    <div class="hud-right">
      <button class="icon-btn shop-btn" aria-label="Loja">${icons.bag}</button>
      <button class="icon-btn shake-btn hidden" aria-label="Chacoalhar">${icons.shake}</button>
      <button class="icon-btn recenter hidden" aria-label="Centralizar">${icons.locate}</button>
    </div>
    <section class="screen" data-screen="album"></section>
    <section class="screen" data-screen="pond"></section>
    <section class="screen" data-screen="friends"></section>
    <section class="screen" data-screen="profile"></section>
    <nav class="navbar">
      <button data-nav="album">${img('icon-book.png', 30, 'px-icon')}<span>Pererecário</span></button>
      <button data-nav="pond">${img('pond-small.png', 38, 'px-icon')}<span>Meu Brejo</span><b class="badge hidden"></b></button>
      <button data-nav="map" class="nav-map on"><span class="orb">${icons.map}</span><span>Mapa</span></button>
      <button data-nav="friends">${img('icon-heart.png', 27, 'px-icon')}<span>Amigos</span></button>
      <button data-nav="profile"><span class="nav-head"></span><span>Perfil</span></button>
    </nav>`;

  ctx = {
    refresh: () => { refreshObjects(); renderAll(); },
    capture: (spawn) => startCapture(spawn),
    openDemo: () => openDemo(ctx),
    openTutorial: () => openTutorial({ first: false, onDone: () => { refreshObjects(); renderAll(); } }),
    showMap: (follow) => { openScreen('map'); if (follow) recenter(); },
  };

  map = new GameMap($('.map-host', root), {
    onTapObject: onTapObject,
    onTapGround: (ll) => {
      unlockAudio();
      if (geo.mode === 'sim') { geo.walkTo(ll.lat, ll.lng); sfx.tap(); }
    },
    onUserMove: () => $('.recenter', root).classList.remove('hidden'),
    onRender: placeLight,
  });
  mountJoystick($('.joystick', root));
  mountOthers(map);
  presence.addEventListener('change', renderNearby);
  const start = geo.pos || store.settings.simPos || store.brejos[0];
  if (start) map.setCenter(start.lat, start.lng);

  for (const name of ['album', 'pond', 'friends', 'profile']) screens[name] = $(`[data-screen=${name}]`, root);
  mountAlbum(screens.album);
  mountPond(screens.pond);
  mountFriends(screens.friends, ctx);
  mountProfile(screens.profile, ctx);

  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { unlockAudio(); sfx.tap(); openScreen(nav.dataset.nav); }
  });
  $('.recenter', root).addEventListener('click', recenter);
  $('.status-pill', root).addEventListener('click', statusSheet);
  $('.compass', root).addEventListener('click', () => {
    const dl = deliveryState();
    if (dl) { map.follow = false; $('.recenter', root).classList.remove('hidden'); map.setCenter(dl.job.dest.lat, dl.job.dest.lng, true); return; }
    const b = findBrejo($('.compass', root).dataset.target, store.brejos, seed());
    if (b) { map.follow = false; $('.recenter', root).classList.remove('hidden'); map.setCenter(b.lat, b.lng, true); }
  });
  $('.shake-btn', root).addEventListener('click', () => doShake());
  $('.mode-btn', root).addEventListener('click', toggleMode);
  $('.money-pill', root).addEventListener('click', () => { sfx.tap(); openShop(); });
  $('.shop-btn', root).addEventListener('click', () => { sfx.tap(); openShop(); });
  $('.sky-badge', root).addEventListener('click', () => {
    sfx.tap();
    toast(skyNow === 'night' ? '🌙 É noite aqui: o mapa fica azulado e os vaga-lumes aparecem.' : '☀️ É dia aqui. Quando o sol se pôr, o mapa vira noite.', '', null, 2600);
  });

  // eventos do jogo
  let lastLevel = store.view.level.level;
  let lastLook = lookOf(store.view.player);
  store.addEventListener('change', () => {
    if (!store.view.player) return;   // saindo da conta: a tela vai recarregar
    refreshObjects();
    renderAll();
    const lv = store.view.level.level;
    if (lv > lastLevel) { setTimeout(() => { sfx.win(); toast(`⭐ Você subiu para o nível ${lv}!`, 'ok', null, 3500); }, 1200); }
    lastLevel = lv;
    if (lookOf(store.view.player) !== lastLook) { lastLook = lookOf(store.view.player); drawPlayer(true); }
  });
  store.addEventListener('brejos', () => { refreshObjects(); prefetchTiles(); });
  store.addEventListener('revealed', () => refreshObjects());
  store.addEventListener('settings', () => { renderStatus(); renderGpsChip(); applySky(); });
  sync.addEventListener('status', () => { renderStatus(); if (current === 'profile') renderSyncCard(screens.profile); });
  sync.addEventListener('synced', () => { if (current === 'profile') renderSyncCard(screens.profile); });
  sync.addEventListener('conflict', (e) => {
    const { op, result } = e.detail;
    if (op.type === 'job.done') return toast('Esse trabalho já tinha sido pago em outro aparelho: não paga duas vezes.', 'conflict', 'sync', 5000);
    if (op.type === 'shop.buy') return toast('Esse carro já tinha sido comprado em outro aparelho: não foi cobrado de novo.', 'conflict', 'sync', 5000);
    if (op.type === 'frog.sell') return toast(`Essa ${esc(species(op.payload.speciesId)?.name || 'perereca')} já tinha sido vendida em outro aparelho: o dinheiro entrou uma vez só.`, 'conflict', 'sync', 5000);
    const name = species(op.payload.speciesId)?.name || 'perereca';
    if (result.status === 'conflict') toast(`Conflito resolvido: a ${esc(name)} já tinha sido capturada antes no aparelho ${esc(result.conflict.kept.deviceId)}. Ficou a primeira captura.`, 'conflict', 'sync', 6000);
    else toast(`Conflito resolvido: sua captura da ${esc(name)} foi a primeira e substituiu a do outro aparelho.`, 'conflict', 'sync', 6000);
  });
  sync.addEventListener('rejected', (e) => {
    const { op, result } = e.detail;
    if (op.type === 'shop.buy') return toast(`Compra desfeita: ${esc(result.error)}. Seu dinheiro não saiu.`, 'warn', 'cloudOff', 6000);
    if (op.type === 'frog.sell') return toast(`Venda desfeita: ${esc(result.error)}. A perereca voltou para o brejo.`, 'warn', 'cloudOff', 6000);
    toast(`O servidor recusou uma operação: ${esc(result.error)}`, 'warn', 'cloudOff', 5000);
  });
  store.addEventListener('resend', (e) => {
    toast(`O servidor estava sem ${e.detail.count} ${e.detail.count === 1 ? 'ação sua' : 'ações suas'}: este celular está mandando de novo.`, 'warn', 'sync', 5000);
  });
  if (store.unparked) {
    toast(`${store.unparked} ${store.unparked === 1 ? 'ação guardada' : 'ações guardadas'} neste celular ${store.unparked === 1 ? 'voltou' : 'voltaram'} para a fila e já ${store.unparked === 1 ? 'vai' : 'vão'} subir.`, 'ok', 'sync', 4500);
    store.unparked = 0;
  }
  sync.addEventListener('auth-expired', async () => {
    toast('Sessão expirada. Entre de novo com a mesma conta: nada do que está no aparelho foi perdido.', 'warn', 'cloudOff', 4000);
    await store.expireSession();
    setTimeout(() => location.reload(), 3000);
  });
  geo.addEventListener('change', onGeo);
  geo.addEventListener('error', () => renderHint());
  geo.addEventListener('mode', () => { renderGpsChip(); renderHint(); renderHud(); refreshObjects(); drawPlayer(true); });
  sensors.addEventListener('shake', () => doShake());

  setInterval(tick, 1000);
  refreshObjects();
  renderAll();
  applySky();

  if (!store.settings.tutorialDone) {
    openTutorial({ first: true, firstTime, onDone: () => { geo.start(); refreshObjects(); renderAll(); setTimeout(askTerms, 800); } });
  } else {
    geo.start();
    if (!sensors.needsPermission()) sensors.request();
  }
  presence.start();
  store.ensureExpedition();
  prefetchTiles();
  // quem já tinha conta antes dos termos (ou quando os termos mudam) vê o resumo e marca "li e concordo"
  setTimeout(askTerms, 1500);
  sync.addEventListener('synced', () => setTimeout(askTerms, 600));
}

// ---------- telas ----------
function openScreen(name) {
  current = name;
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('open', k === name);
  $$('.navbar [data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === name));
  if (name === 'profile') loadRanking(screens.profile);
  renderAll();
}

function renderAll() {
  renderHud();
  if (current === 'album') renderAlbum(screens.album);
  if (current === 'pond') renderPond(screens.pond);
  if (current === 'friends') renderFriends(screens.friends);
  if (current === 'profile') renderProfile(screens.profile);
}

function renderHud() {
  const v = store.view;
  if (!v.player) return;
  const mp = $('.money-pill');
  mp.innerHTML = `<span class="bcoin">B$</span> ${v.balance}`;
  // entrou dinheiro (trabalho, venda): o saldo pula e sobe um "+B$" embaixo dele
  if (lastBalance != null && v.balance > lastBalance && mp.getBoundingClientRect().width > 0) {
    mp.classList.remove('bump'); void mp.offsetWidth; mp.classList.add('bump');
    const r = mp.getBoundingClientRect();
    const plus = document.createElement('div');
    plus.className = 'money-plus';
    plus.innerHTML = `+<span class="bcoin">B$</span> ${v.balance - lastBalance}`;
    plus.style.left = `${r.left + r.width / 2}px`;
    plus.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(plus);
    setTimeout(() => plus.remove(), 1400);
  }
  lastBalance = v.balance;
  const car = geo.mode === 'sim' ? carById(v.vehicle) : null;
  geo.joySpeed = car ? car.speed : 3.5;
  const look = lookOf(v.player);
  const av = $('.player-chip .avatar');
  if (av.dataset.look !== look) { av.innerHTML = headHtml(look, 1.7); av.dataset.look = look; }   // 1.7: a cabeça inteira (com a aba do chapéu) cabe na bolinha
  const nh = $('.navbar .nav-head');
  if (nh.dataset.look !== look) { nh.innerHTML = headHtml(look, 1.7); nh.dataset.look = look; }
  $('.player-chip .lvl').textContent = v.level.level;
  $('.player-chip .name').textContent = v.player.displayName;
  $('.player-chip .name').classList.toggle('long', v.player.displayName.length > 10);
  $('.player-chip .xpbar i').style.width = `${(v.level.into / v.level.need) * 100}%`;
  const badge = $('.navbar .badge');
  const newOnes = v.captures.filter((c) => c.pending).length;
  badge.textContent = newOnes;
  badge.classList.toggle('hidden', !newOnes);
  renderStatus();
  renderExpedition();
  renderGpsChip();
  renderHint();
}

// Indicador de conexão: ponto verde "Online", ponto vermelho "Offline" (com quantas ações estão
// guardadas no celular), "Sincronizando…" ao voltar e "Tudo salvo" quando o servidor confirma.
// O "Sincronizando" fica pelo menos 1,2 s na tela, para dar para ver mesmo quando é rápido.
const pillState = { view: null, since: 0, timer: null, savedUntil: 0, worth: false };
function renderStatus() {
  const pill = $('.status-pill');
  if (!pill) return;
  const n = store.outbox.length;
  let st = sync.status === 'starting' ? (api.isOffline() ? 'offline' : 'syncing') : sync.status;
  const t = Date.now();
  clearTimeout(pillState.timer);
  if (st === 'syncing') {
    if (pillState.view !== 'syncing') {
      // vale mostrar "Tudo salvo" no fim se havia algo para mandar ou se a internet acabou de voltar
      pillState.worth = n > 0 || pillState.view === 'offline' || pillState.view === 'server-down';
      pillState.since = t;
    }
  } else if (st === 'online' && pillState.view === 'syncing') {
    const left = pillState.since + 1200 - t;
    if (left > 0) { pillState.timer = setTimeout(renderStatus, left); st = 'syncing'; }
    else if (pillState.worth) pillState.savedUntil = t + 2600;
  }
  if (st === 'online' && t < pillState.savedUntil) {
    st = 'saved';
    pillState.timer = setTimeout(renderStatus, pillState.savedUntil - t + 20);
  } else if (st !== 'online' && st !== 'saved') pillState.savedUntil = 0;
  pillState.view = st === 'saved' ? 'online' : st;
  pill.className = `status-pill ${st}`;
  const kept = n ? `<span class="count" title="guardadas no celular">${n}</span>` : '';
  pill.innerHTML = {
    online: '<span class="dot"></span><span class="lbl">Online</span>',
    saved: `<span class="ok">${icons.check}</span><span class="lbl">Tudo salvo</span>`,
    syncing: `<span class="spin"></span><span class="lbl">Sincronizando…</span>${kept}`,
    offline: `<span class="dot"></span><span class="lbl">Offline</span>${kept}`,
    'server-down': `<span class="dot"></span><span class="lbl">Servidor fora</span>${kept}`,
  }[st] || st;
  pill.setAttribute('aria-label', {
    online: 'Online: tudo salvo no servidor', saved: 'Tudo salvo no servidor', syncing: 'Sincronizando com o servidor',
    offline: `Offline: ${n} ações guardadas no celular`, 'server-down': `Servidor fora do ar: ${n} ações guardadas no celular`,
  }[st] || st);
}

function renderGpsChip() {
  const chip = $('.gps-chip');
  if (!chip) return;
  const parts = [];
  if (store.settings.forcedOffline) parts.push(`<span class="chip">${icons.cloudOff}Modo avião simulado</span>`);
  chip.innerHTML = parts.join('');
  const ctl = geo.mode === 'sim';
  const btn = $('.mode-btn');
  btn.className = `mode-btn ${ctl ? 'controle' : ''}`;
  btn.innerHTML = ctl ? `${icons.gamepad}Controle` : `${icons.gps}GPS`;
  $('#game').classList.toggle('controle', ctl);
  $('.joystick').classList.toggle('hidden', !ctl);
  $('.shake-btn').classList.toggle('hidden', !(ctl || !sensors.hasMotion));
}

// GPS: anda de verdade e aparecem todas as pererecas. Controle: joystick, menos raras.
async function toggleMode() {
  unlockAudio();
  sfx.tap();
  if (geo.mode === 'real') {
    await geo.setMode('sim');
    toast('🎮 Modo controle: ande com o joystick. Aqui aparecem menos pererecas raras.', '', null, 4000);
  } else {
    await geo.setMode('real');
    toast('📍 Modo GPS: ande de verdade e todas as pererecas aparecem, inclusive as raras!', 'ok', null, 4000);
  }
}

function renderNearby() {
  const el = $('.nearby-chip');
  if (!el) return;
  const n = presence.others.size;
  el.classList.toggle('hidden', !n);
  el.innerHTML = `${icons.people}${n} ${n === 1 ? 'jogador' : 'jogadores'} por perto`;
}

// céu do mapa conforme a altura do sol no lugar e na hora (ou forçado no painel)
let skyNow = null;
function applySky() {
  if (!map) return;
  const phase = skyPhase(new Date(), geo.pos || map.center);
  if (phase === skyNow) return;
  const first = skyNow === null;
  skyNow = phase;
  map.el.classList.toggle('night', phase === 'night');
  document.documentElement.dataset.sky = phase;
  const ico = $('.sky-badge');
  if (ico) { ico.innerHTML = phase === 'night' ? icons.moon : icons.sun; ico.classList.toggle('night', phase === 'night'); }
  if (!first && phase === 'night') toast('🌙 Anoiteceu no brejo. Os vaga-lumes saíram!', '', null, 3000);
  if (!first && phase === 'day') toast('☀️ Amanheceu no brejo!', 'ok', null, 3000);
}

// a luz da noite fica em volta do boneco (mesmo quando o mapa é arrastado)
function placeLight() {
  const pos = geo.pos;
  const p = pos ? map.latLngToScreen(pos.lat, pos.lng) : { x: map.W / 2, y: map.H / 2 };
  map.el.style.setProperty('--lx', `${Math.round(p.x)}px`);
  map.el.style.setProperty('--ly', `${Math.round(p.y - 22)}px`);
}

function renderExpedition() {
  const el = $('.hud-expedition');
  const cur = store.currentExpedition();
  el.innerHTML = `<div><b>🐸 ${cur?.captures.length || 0}</b>hoje</div><div class="sep"></div><div><b>${fmtDist(cur?.meters || 0)}</b>andados</div>`;
}

// o Jipe abre matinhos de mais longe (só no modo controle, que é onde o carro anda)
const revealRange = () => (geo.mode === 'sim' && store.view.vehicle === 'jeep' ? 30 : REVEAL_RANGE_M);

function hiddenNearby() {
  const pos = geo.pos;
  if (!pos) return [];
  return visibleSpawns().filter((s) => isHidden(s) && distanceM(pos, s) <= revealRange());
}

function renderHint() {
  const el = $('.hint-bubble');
  if (!el) return;
  let msg = '';
  let shake = false;
  const pos = geo.pos;
  if (geo.mode === 'real' && geo.error === 'denied') msg = '📍 Localização bloqueada. Permita o acesso à localização no navegador para encontrar as lagoinhas.';
  else if (geo.mode === 'real' && geo.error === 'unsupported') msg = 'Este aparelho não informa a localização.';
  else if (!pos) msg = '📡 Procurando sinal de GPS…';
  else if (pos.accuracy > 60) msg = `📡 Sinal de GPS fraco (±${Math.round(pos.accuracy)} m). Vá para um lugar aberto.`;
  else if (driving) msg = '🚗 Parece que você está num veículo. Por segurança, capturas e trabalhos ficam pausados.';
  else if (hiddenNearby().length) { msg = '🌿 Tem perereca escondida aqui! <b>Toque no matinho</b> ou chacoalhe o celular'; shake = true; }
  el.innerHTML = msg;
  renderCompass();
  el.classList.toggle('shake', shake);
  el.classList.toggle('hidden', !msg || current !== 'map');
}

// ---------- mapa: lagoinhas, matinhos, pererecas e jogador ----------
const isHidden = (s) => s.kind === 'wild' && s.hidden && !store.revealed[s.id];

function visibleSpawns() {
  const catalog = getCatalog();
  const w = windowOf(store.now());
  const vp = viewPoint();
  const out = [];
  if (!vp) return out;
  for (const b of [...brejosShown(), ...moitasShown()]) {
    if (distanceM(vp, b) > FROG_VIEW_M + b.radius) continue;
    for (const s of spawnsFor(b, w, catalog, seed())) {
      if (store.view.capturedSpawns.has(s.id)) continue;
      if (!visibleInMode(s, geo.playMode)) continue; // no modo controle aparecem menos raras
      if (distanceM(vp, s) <= FROG_VIEW_M) out.push(s); // longe demais: some do mapa
    }
  }
  return out;
}

function refreshObjects() {
  if (!map) return;
  const pos = geo.pos;
  const spawns = visibleSpawns();
  const keep = new Set();
  const vp = viewPoint();
  for (const b of brejosShown()) {
    if (!vp || distanceM(vp, b) > POND_VIEW_M) continue;
    map.setObject(`pond:${b.id}`, {
      lat: b.lat, lng: b.lng, ground: true, className: 'mpond', data: b,
      html: img(hash32(b.id) % 2 ? 'pond-big.png' : 'pond-small.png', hash32(b.id) % 2 ? 132 : 100),
    });
    keep.add(`pond:${b.id}`);
  }
  const range = captureRange(pos);
  for (const s of spawns) {
    const hidden = isHidden(s);
    const d = pos ? distanceM(pos, s) : Infinity;
    const key = `frog:${s.id}`;
    keep.add(key);
    let html, cls;
    if (hidden) {
      const qDelay = -((hash32(`${s.id}?`) % 3600) / 1000);
      if (revealing.has(s.id)) {
        cls = 'mbush peek';
        html = `<div class="body">${img('bush-peek.png', 60, 'bush')}</div>`;
      } else {
        cls = 'mbush';
        html = `<div class="body" style="--qd:${qDelay}s">${img('bush.png', 56, 'bush')}${img('bubble-q.png', 26, 'bubble')}</div>`;
      }
    } else {
      const fresh = justRevealed.has(s.id);
      const delay = -((hash32(s.id) % 5000) / 1000);
      cls = `mfrog ${d <= range ? 'near' : 'far'}`;
      html = `<div class="body" style="--d:${delay}s">${fresh ? img('bubble-ex.png', 22, 'ex') + sparkleHtml(4) : ''}${frogImg(s.speciesId, 38)}<div class="shadow"></div></div>`;
    }
    map.setObject(key, { lat: s.lat, lng: s.lng, html, className: cls, data: s });
  }
  // NPCs de trabalho (some quem já foi ajudado nesta janela)
  const win = windowOf(store.now());
  if (vp) {
    for (const job of jobsNear(vp, JOB_VIEW_M, win, seed())) {
      if (store.view.jobsDone.has(job.id)) continue;
      const key = `job:${job.id}`;
      keep.add(key);
      const near = pos && distanceM(pos, job) <= JOB_RANGE_M;
      map.setObject(key, {
        lat: job.lat, lng: job.lng, className: `mnpc ${near ? 'near' : ''}`, data: job,
        html: `<div class="npc-wrap">${img(`bubble-job-${job.type}.png`, 34, 'npc-bubble')}${npcSprite(job, 2.3)}<div class="pshadow"></div></div>`,
      });
    }
  }
  const dl = deliveryState();
  if (dl) {
    keep.add('dest');
    map.setObject('dest', { lat: dl.job.dest.lat, lng: dl.job.dest.lng, className: 'mdest', data: dl,
      html: `<div class="dest-pin">${img('bubble-job-entrega.png', 34)}</div>` });
    map.setFeature('dest-ring', { lat: dl.job.dest.lat, lng: dl.job.dest.lng, radiusM: DELIVERY_RANGE_M, className: 'dest-ring' });
  } else map.removeFeature('dest-ring');
  for (const k of map.objectKeys()) if ((k.startsWith('frog:') || k.startsWith('pond:') || k.startsWith('job:') || k === 'dest') && !keep.has(k)) map.removeObject(k);

  if (pos) {
    drawPlayer();
    map.setFeature('range', { lat: pos.lat, lng: pos.lng, radiusM: range, className: 'range-ring' });
    if (!pos.simulated && pos.accuracy > 25) map.setFeature('acc', { lat: pos.lat, lng: pos.lng, radiusM: pos.accuracy, className: 'acc-ring' });
    else map.removeFeature('acc');
  }
}

function drawPlayer(force = false) {
  const pos = geo.pos;
  if (!pos || !map) return;
  const look = lookOf(store.view.player);
  const car = geo.mode === 'sim' ? store.view.vehicle : null;   // carro só no modo controle
  const name = store.view.player.displayName;
  const sig = `${look}|${playerDir}|${walking}|${car}|${name}`;
  const o = map.objects.get('player');
  // o próprio nome aparece em verde (os dos outros jogadores ficam em branco)
  map.setObject('player', {
    lat: pos.lat, lng: pos.lng, className: `mplayer ${car ? 'incar' : ''}`, depthScale: false, top: true,
    html: (!o || o.sig !== sig || force)
      ? (car
        ? `<div class="cwrap me">${faceBubble(look, name)}${carSprite(car, { dir: playerDir, moving: walking })}</div>`
        : `<div class="pwrap"><div class="pshadow"></div>${charHtml(look, { dir: playerDir, walking, scale: 2.6 })}<span class="oname me">${esc(name)}</span></div>`)
      : null,
  });
  map.objects.get('player').sig = sig;
}

// Animação de andar: o GPS desliza o boneco em passinhos e o joystick move ~35 cm a cada
// 0,1 s, então "está andando" é qualquer movimento recente, e a direção é calculada a cada
// 0,8 m percorridos (assim o boneco não fica virando à toa com a tremedeira do GPS).
let dirAnchor = null;
function onGeo() {
  const pos = geo.pos;
  const step = lastPos ? distanceM(lastPos, pos) : 0;
  const jump = step >= 80; // teletransporte (demonstração) não anima
  if (step > 0.05 && !jump) {
    walking = true;
    clearTimeout(walkingTimer);
    walkingTimer = setTimeout(() => { walking = false; drawPlayer(); }, geo.mode === 'sim' ? 320 : 1600);
  }
  if (!dirAnchor || jump) dirAnchor = { lat: pos.lat, lng: pos.lng };
  else if (distanceM(dirAnchor, pos) >= 0.8) {
    playerDir = dirFromBearing(bearing(dirAnchor, pos));
    dirAnchor = { lat: pos.lat, lng: pos.lng };
  }
  lastPos = { lat: pos.lat, lng: pos.lng };
  if (map.follow) {
    const jump = distanceM(map.center, pos) > 40;
    map.setCenter(pos.lat, pos.lng, jump);
  }
  checkSpeed();
  refreshObjects();
  renderHint();
  prefetchTiles();
  checkDelivery();
  renderExpedition();
}

// seta apontando para a lagoinha mais próxima (o mapa fica com o norte para cima)
function renderCompass() {
  const el = $('.compass');
  if (!el) return;
  const pos = geo.pos;
  const dl = deliveryState();
  if (dl && pos && current === 'map') {
    const left = Math.max(0, dl.deadline - store.now());
    el.classList.remove('hidden');
    el.classList.add('delivery');
    $('.arrow', el).style.transform = `rotate(${bearing(pos, dl.job.dest) - 90}deg)`;
    $('.txt', el).textContent = `📦 ${dl.job.dest.name} · ${fmtDist(distanceM(pos, dl.job.dest))} · ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    el.dataset.target = '';
    return;
  }
  el.classList.remove('delivery');
  const nearest = pos ? brejosShown().map((b) => ({ b, d: distanceM(pos, b) })).sort((a, b) => a.d - b.d)[0] : null;
  const show = nearest && nearest.d - nearest.b.radius > 25 && current === 'map';
  el.classList.toggle('hidden', !show);
  if (!show) return;
  $('.arrow', el).style.transform = `rotate(${bearing(pos, nearest.b) - 90}deg)`;
  $('.txt', el).textContent = `${nearest.b.name} · ${fmtDist(nearest.d)}`;
  el.dataset.target = nearest.b.id;
}

function recenter() {
  map.follow = true;
  $('.recenter').classList.add('hidden');
  const pos = geo.pos;
  if (pos) map.setCenter(pos.lat, pos.lng, true);
}

let ticks = 0;
function tick() {
  if (++ticks % 30 === 0) applySky();
  if (deliveryState()) { renderCompass(); checkDelivery(); }
  const w = windowOf(store.now());
  if (w !== lastWin) {
    if (lastWin != null) toast('🐸 Novas pererecas chegaram às lagoinhas!', 'ok', null, 2500);
    lastWin = w;
    refreshObjects();
  }
}

// ---------- interações ----------
function onTapObject(key, data) {
  unlockAudio();
  if (key.startsWith('pond:')) return brejoSheet(data);
  if (key.startsWith('job:')) return tapJob(data);
  if (key === 'dest') return toast(`📦 Ponto de entrega: ${esc(data.job.dest.name)}. Chegue a ${DELIVERY_RANGE_M} m dele.`, '', null, 2500);
  if (key.startsWith('other:')) {
    sfx.pop();
    return toast(`${data.mode === 'controle' ? '🎮' : '📍'} ${esc(data.name)} está caçando por perto! Para virarem amigos, troquem o QR code em Amigos.`, '', 'friends', 4000);
  }
  if (!key.startsWith('frog:')) return;
  if (driving) { sfx.error(); return toast('🚗 Por segurança, capturas ficam pausadas enquanto você está num veículo.', 'warn', null, 3000); }
  const s = data;
  const pos = geo.pos;
  const d = pos ? distanceM(pos, s) : Infinity;
  if (isHidden(s)) {
    if (revealing.has(s.id)) return;
    if (d > revealRange()) { sfx.tap(); return toast(`Algo se mexe no matinho… Chegue mais perto (faltam ${fmtDist(Math.ceil(d - revealRange()))}).`, '', 'walk'); }
    sfx.rustle();
    vibrate(40);
    return revealFrom([s]);
  }
  const range = captureRange(pos);
  if (d > range) {
    sfx.error();
    return toast(`Chegue mais perto! Faltam ${fmtDist(Math.ceil(d - range))}.`, 'warn', 'walk');
  }
  sfx.pop();
  startCapture(s);
}

// ---------- trabalhos ----------
function tapJob(job) {
  const pos = geo.pos;
  const d = pos ? distanceM(pos, job) : Infinity;
  if (driving) { sfx.error(); return toast('🚗 Por segurança, trabalhos ficam pausados enquanto você está num veículo.', 'warn', null, 3000); }
  if (deliveryState()) { sfx.tap(); return toast('Termine a entrega que você está fazendo primeiro.', '', null, 2500); }
  if (d > JOB_RANGE_M) { sfx.tap(); return toast(`Chegue mais perto para conversar (faltam ${fmtDist(Math.ceil(d - JOB_RANGE_M))}).`, '', 'walk', 2500); }
  sfx.pop();
  openJobTalk(job, {
    onAccept: ({ mode, pay }) => {
      if (job.type === 'entrega') { startDelivery(job, { mode, pay }); refreshObjects(); renderCompass(); return; }
      runJobGame(job, { mode, pay, onClose: () => { refreshObjects(); renderAll(); } });
    },
  });
}

let delivering = false;
function checkDelivery() {
  const d = deliveryState();
  if (!d || delivering) return;
  if (store.now() > d.deadline + 15000) { cancelDelivery('⏰ O tempo da entrega acabou. Fica para a próxima!'); refreshObjects(); return; }
  const pos = geo.pos;
  if (pos && distanceM(pos, d.job.dest) <= DELIVERY_RANGE_M) {
    delivering = true;
    finishDelivery(d, () => { delivering = false; refreshObjects(); renderAll(); });
  }
}

// Segurança: no modo GPS, se o celular estiver rápido demais (num carro, ônibus…), pausa capturas e trabalhos.
let driving = false, fastSince = 0, slowSince = 0;
function checkSpeed() {
  const pos = geo.pos;
  if (geo.mode !== 'real' || !pos || pos.speed == null) { if (driving) { driving = false; renderHint(); } return; }
  const t = Date.now();
  if (pos.speed > 7) { slowSince = 0; fastSince ||= t; if (!driving && t - fastSince > 5000) { driving = true; renderHint(); } }
  else { fastSince = 0; slowSince ||= t; if (driving && pos.speed < 3 && t - slowSince > 10000) { driving = false; renderHint(); } }
}

function startCapture(spawn) {
  openCapture(spawn, {
    onClose: () => { refreshObjects(); renderAll(); },
    onOpenAlbum: (id) => { openScreen('album'); setTimeout(() => openSpecies(id), 350); },
  });
}

function doShake() {
  if (document.querySelector('.capture, .scanner, .tutorial') || current !== 'map') return;
  const pos = geo.pos;
  sfx.rustle();
  setTimeout(() => sfx.ribbit(), 250);
  vibrate([60, 40, 60]);
  if (!pos) return toast('Sem posição ainda: espere o GPS.', 'warn');
  map.setFeature('wave', { lat: pos.lat, lng: pos.lng, radiusM: revealRange(), className: 'shake-wave' });
  setTimeout(() => map.removeFeature('wave'), 1400);
  const close = hiddenNearby().filter((s) => !revealing.has(s.id));
  if (close.length) {
    revealFrom(close);
    toast(`Coaxos! ${close.length} perereca${close.length > 1 ? 's saíram' : ' saiu'} do matinho!`, 'ok', 'sound');
  } else if (visibleSpawns().some(isHidden)) toast('Silêncio… Chegue mais perto dos matinhos e chacoalhe de novo.', '', 'sound');
  else toast('Nenhuma perereca escondida por aqui.', '', 'sound');
}

// matinho -> espiando (1 s) -> perereca com "!" e brilho
function revealFrom(list) {
  for (const s of list) revealing.add(s.id);
  refreshObjects();
  setTimeout(async () => {
    sfx.pop();
    for (const s of list) { revealing.delete(s.id); justRevealed.add(s.id); }
    await store.reveal(list.map((s) => s.id));
    setTimeout(() => { for (const s of list) justRevealed.delete(s.id); refreshObjects(); }, 2400);
  }, 1000);
}

function brejoSheet(b) {
  const spawns = visibleSpawns().filter((s) => s.brejoId === b.id);
  const left = Math.max(0, windowEnd(windowOf(store.now())) - store.now());
  const d = geo.pos ? distanceM(geo.pos, b) : null;
  const sheet = openSheet(`
    <h3>${esc(b.name)}</h3>
    <p class="lead">${d != null ? `A ${fmtDist(Math.max(0, d - b.radius))} de você · ` : ''}novas pererecas em ${Math.ceil(left / 60000)} min</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:6px 0 16px">
      ${spawns.length ? spawns.map((s) => {
        const hidden = isHidden(s);
        const known = store.view.discovered.has(s.speciesId);
        return `<div class="card" style="padding:8px;width:84px;text-align:center">${hidden ? `<div style="height:56px;display:grid;place-items:center">${img('bush.png', 56)}</div><small>escondida</small>` : `<div style="height:56px;display:grid;place-items:center;${known ? '' : 'filter:brightness(0) opacity(.25)'}">${frogImg(s.speciesId, 52)}</div><small>${known ? esc(species(s.speciesId).name) : '???'}</small>`}</div>`;
      }).join('') : '<p class="lead">Você já pegou todas daqui. Volte em alguns minutos!</p>'}
    </div>
    <button class="btn block" data-act="ok">Bora caçar!</button>`);
  $('[data-act=ok]', sheet).addEventListener('click', () => closeSheet());
}

function statusSheet() {
  sfx.tap();
  const n = store.outbox.length;
  const kept = `${n} ${n === 1 ? 'ação está guardada' : 'ações estão guardadas'} neste celular e ${n === 1 ? 'sobe' : 'sobem'} sozinha${n === 1 ? '' : 's'}`;
  const text = {
    online: n ? `Conectado. ${kept} em instantes.` : 'Conectado. Tudo o que você faz vai para o servidor na hora: seu progresso está salvo e aparece em qualquer celular em que você entrar.',
    syncing: 'Enviando o que você fez para o servidor…',
    offline: `Sem internet, mas pode continuar jogando. ${n ? `${kept} quando a internet voltar.` : 'O que você fizer fica guardado neste celular e sobe sozinho quando a internet voltar.'} Só não limpe os dados do navegador enquanto isso.`,
    'server-down': `A internet funciona, mas o servidor não respondeu. Pode continuar jogando: ${n ? `${kept} quando ele voltar.` : 'o que você fizer fica guardado neste celular e sobe quando ele voltar.'} O jogo tenta de novo sozinho.`,
    starting: 'Verificando a conexão…',
  }[sync.status];
  const sheet = openSheet(`
    <h3>${{ online: n ? '🟢 Online' : '🟢 Online · tudo salvo', syncing: '🔵 Sincronizando', offline: '🔴 Offline', 'server-down': '🟠 Servidor fora do ar', starting: '…' }[sync.status]}</h3>
    <p class="lead">${text}</p>
    <div class="kv"><div><span>Guardadas no celular, esperando para subir</span><b>${n} ${n === 1 ? 'ação' : 'ações'}</b></div><div><span>Última vez que salvou no servidor</span><b>${sync.lastSyncAt ? ago(sync.lastSyncAt) : '-'}</b></div></div>
    <div class="row-btns"><button class="btn ghost" data-act="demo">Painel de testes</button><button class="btn" data-act="sync">Sincronizar</button></div>`);
  $('[data-act=sync]', sheet).addEventListener('click', () => { sync.kick(0); closeSheet(); });
  $('[data-act=demo]', sheet).addEventListener('click', () => { closeSheet(true); openDemo(ctx); });
}

let termsOpen = false;
function askTerms() {
  const p = store.view?.player;
  if (!p || p.termsAccepted !== false || termsOpen || api.isOffline() || document.querySelector('.tutorial')) return;
  termsOpen = true;
  const sheet = openSheet(`
    <h3>📄 Termos de Uso e Privacidade</h3>
    <p class="lead">Antes de continuar, veja em resumo como o Pererecário usa os seus dados:</p>
    <ul class="terms-sum">
      <li>Guardamos o seu apelido, o seu e-mail e o seu progresso, para você jogar em qualquer celular sem perder nada.</li>
      <li>A sua posição só é guardada na hora de cada captura ou trabalho. Com "Aparecer no mapa dos outros" ligado, quem estiver a até 300 m vê o seu boneco.</li>
      <li>Nada é vendido, não mandamos propaganda e você pode pedir para apagar a sua conta.</li>
    </ul>
    <label class="terms-check"><input type="checkbox" name="terms"><span>Li e concordo com os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>
    <div class="form-error terms-error"></div>
    <button class="btn block" data-act="ok">Continuar</button>`, { onClose: () => { termsOpen = false; } });
  const box = $('input[name=terms]', sheet);
  const btn = $('[data-act=ok]', sheet);
  btn.addEventListener('click', async () => {
    const e = $('.terms-error', sheet);
    if (!box.checked) { e.textContent = 'Marque que você leu e concorda para continuar.'; sfx.error(); return; }
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      const r = await api.post('/api/auth/terms', { accept: true }, { timeout: 70000 });
      if (store.session) store.session = { ...store.session, player: r.player };
      if (store.snapshot?.player) store.snapshot = { ...store.snapshot, player: { ...store.snapshot.player, termsAccepted: true } };
      store.recompute();
      closeSheet();
      toast('Obrigado! Bom jogo 🐸', 'ok', 'check', 2500);
      sync.kick(0);
    } catch (ex) {
      e.textContent = ex.kind === 'offline' ? 'Sem internet agora. Tente de novo quando conectar.' : ex.message;
      btn.disabled = false;
      btn.textContent = 'Continuar';
    }
  });
}

function sensorPermissionSheet() {
  const sheet = openSheet(`
    <h3>📳 Ativar sensores de movimento</h3>
    <p class="lead">O Pererecário usa o acelerômetro do celular: chacoalhe perto dos matinhos para as pererecas saírem.</p>
    <button class="btn block" data-act="ok">Ativar sensores</button>`);
  $('[data-act=ok]', sheet).addEventListener('click', async () => {
    const ok = await sensors.request();
    closeSheet();
    toast(ok ? 'Sensores ativados! Chacoalhe perto dos matinhos.' : 'Sem permissão para os sensores.', ok ? 'ok' : 'warn');
    renderGpsChip();
  });
}

// baixa antecipadamente os tiles ao redor do jogador (ficam em cache para uso offline)
const prefetched = new Set();
async function prefetchTiles() {
  // o servidor de tiles do OpenStreetMap não permite baixar em lote: só pré-carrega com CARTO
  if (!tileProvider().prefetch || api.isOffline() || !('caches' in window)) return;
  const pos = geo.pos;
  if (!pos) return;
  const key = `${Math.round(pos.lat * 400)}|${Math.round(pos.lng * 400)}`; // a cada ~250 m andados
  if (prefetched.has(key)) return;
  prefetched.add(key);
  const urls = [...tilesAround(pos.lat, pos.lng, 450, 18), ...tilesAround(pos.lat, pos.lng, 250, 19)];
  for (const u of urls) {
    try { await fetch(u, { mode: 'no-cors' }); } catch { return; }
    await new Promise((r) => setTimeout(r, 40));
  }
}
