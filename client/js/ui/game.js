// Tela principal: mapa + HUD + navegação entre Pererecário, Meu Brejo, Amigos e Perfil.
import { GameMap, tilesAround } from './map.js';
import { openCapture } from './capture.js';
import { mountAlbum, renderAlbum, openSpecies } from './album.js';
import { mountPond, renderPond } from './pond.js';
import { mountFriends, renderFriends } from './friends.js';
import { mountProfile, renderProfile, loadRanking, renderSyncCard } from './profile.js';
import { openDemo } from './demo.js';
import { openTutorial } from './tutorial.js';
import { icons } from './icons.js';
import { charHtml, headHtml, img, lookOf, sparkleHtml, bearing, dirFromBearing } from './sprites.js';
import { $, $$, esc, toast, openSheet, closeSheet, fmtDist } from './common.js';
import { getCatalog, frogImg, species } from '../catalog.js';
import { store } from '../store.js';
import { sync } from '../sync.js';
import { geo } from '../geo.js';
import { sensors } from '../sensors.js';
import { api } from '../api.js';
import { sfx, vibrate, unlockAudio } from '../audio.js';
import {
  spawnsFor, windowOf, windowEnd, distanceM, offsetLatLng, hash32, captureRange, REVEAL_RANGE_M,
} from '../shared/game.js';

let map, current = 'map', ctx, lastWin = null, walkingTimer = null;
let playerDir = 'down', walking = false, lastPos = null, justRevealed = new Set();
const screens = {};

export function startGame({ firstTime = false } = {}) {
  const root = $('#game');
  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="map-host"></div>
    <div class="hud-top">
      <button class="player-chip" data-nav="profile" aria-label="Perfil"><div class="avatar-wrap"><div class="avatar"></div><span class="lvl"></span></div><div class="who"><div class="name"></div><div class="xpbar"><i></i></div></div></button>
      <div class="status-col"><button class="status-pill" aria-label="Estado da conexão"></button><div class="gps-chip"></div></div>
    </div>
    <div class="hint-bubble hidden"></div>
    <button class="hud-expedition" data-nav="profile"></button>
    <div class="hud-right">
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
  });
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
  $('.shake-btn', root).addEventListener('click', () => doShake());

  // eventos do jogo
  let lastLevel = store.view.level.level;
  let lastLook = lookOf(store.view.player);
  store.addEventListener('change', () => {
    refreshObjects();
    renderAll();
    const lv = store.view.level.level;
    if (lv > lastLevel) { setTimeout(() => { sfx.win(); toast(`⭐ Você subiu para o nível ${lv}!`, 'ok', null, 3500); }, 1200); }
    lastLevel = lv;
    if (lookOf(store.view.player) !== lastLook) { lastLook = lookOf(store.view.player); drawPlayer(true); }
  });
  store.addEventListener('brejos', () => { refreshObjects(); prefetchTiles(); });
  store.addEventListener('revealed', () => refreshObjects());
  store.addEventListener('settings', () => { renderStatus(); renderGpsChip(); });
  sync.addEventListener('status', () => { renderStatus(); if (current === 'profile') renderSyncCard(screens.profile); });
  sync.addEventListener('synced', () => { if (current === 'profile') renderSyncCard(screens.profile); });
  sync.addEventListener('conflict', (e) => {
    const { op, result } = e.detail;
    const name = species(op.payload.speciesId)?.name || 'perereca';
    if (result.status === 'conflict') toast(`Conflito resolvido: a ${esc(name)} já tinha sido capturada antes no aparelho ${esc(result.conflict.kept.deviceId)}. Ficou a primeira captura.`, 'conflict', 'sync', 6000);
    else toast(`Conflito resolvido: sua captura da ${esc(name)} foi a primeira e substituiu a do outro aparelho.`, 'conflict', 'sync', 6000);
  });
  sync.addEventListener('rejected', (e) => toast(`O servidor recusou uma operação: ${esc(e.detail.result.error)}`, 'warn', 'cloudOff', 5000));
  sync.addEventListener('auth-expired', async () => { toast('Sessão expirada. Entre novamente.', 'warn'); await store.logout(); setTimeout(() => location.reload(), 1500); });
  geo.addEventListener('change', onGeo);
  geo.addEventListener('error', () => renderHint());
  geo.addEventListener('mode', () => { renderGpsChip(); renderHint(); });
  sensors.addEventListener('shake', () => doShake());

  setInterval(tick, 1000);
  refreshObjects();
  renderAll();

  if (!store.settings.tutorialDone) {
    openTutorial({ first: true, firstTime, onDone: () => { geo.start(); refreshObjects(); renderAll(); } });
  } else {
    geo.start();
    if (!sensors.needsPermission()) sensors.request();
  }
  store.ensureExpedition();
  prefetchTiles();
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
  const look = lookOf(v.player);
  const av = $('.player-chip .avatar');
  if (av.dataset.look !== look) { av.innerHTML = headHtml(look, 2); av.dataset.look = look; }
  const nh = $('.navbar .nav-head');
  if (nh.dataset.look !== look) { nh.innerHTML = headHtml(look, 1.7); nh.dataset.look = look; }
  $('.player-chip .lvl').textContent = v.level.level;
  $('.player-chip .name').textContent = v.player.displayName;
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

function renderStatus() {
  const pill = $('.status-pill');
  if (!pill) return;
  const n = store.outbox.length;
  const st = sync.status === 'starting' ? (api.isOffline() ? 'offline' : 'syncing') : sync.status;
  pill.className = `status-pill ${st}`;
  const count = n ? `<span class="count">${n}</span>` : '';
  pill.innerHTML = {
    online: `<span class="dot"></span>Online${count}`,
    syncing: `${icons.sync}Sincronizando${count}`,
    offline: `${icons.cloudOff}Offline${count}`,
    'server-down': `<span class="dot"></span>Servidor fora${count}`,
  }[st] || st;
}

function renderGpsChip() {
  const chip = $('.gps-chip');
  if (!chip) return;
  const parts = [];
  if (geo.mode === 'sim') parts.push(`<span class="chip">${icons.walk}GPS simulado</span>`);
  if (store.settings.forcedOffline) parts.push(`<span class="chip">${icons.cloudOff}Modo avião simulado</span>`);
  chip.innerHTML = parts.join('');
  $('.shake-btn').classList.toggle('hidden', !(geo.mode === 'sim' || !sensors.hasMotion));
}

function renderExpedition() {
  const el = $('.hud-expedition');
  const cur = store.currentExpedition();
  el.innerHTML = `<div><b>🐸 ${cur?.captures.length || 0}</b>hoje</div><div class="sep"></div><div><b>${fmtDist(cur?.meters || 0)}</b>andados</div>`;
}

function hiddenNearby() {
  const pos = geo.pos;
  if (!pos) return [];
  return visibleSpawns().filter((s) => isHidden(s) && distanceM(pos, s) <= REVEAL_RANGE_M);
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
  else if (!store.brejos.length) msg = 'Nenhuma lagoinha cadastrada ainda. Peça ao organizador para criar as lagoinhas do campus.';
  else if (pos.accuracy > 60) msg = `📡 Sinal de GPS fraco (±${Math.round(pos.accuracy)} m). Vá para um lugar aberto.`;
  else if (hiddenNearby().length) { msg = '📳 Tem perereca escondida aqui! <b>Chacoalhe o celular</b>'; shake = true; }
  else {
    const nearest = store.brejos.map((b) => ({ b, d: distanceM(pos, b) - b.radius })).sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d > 60) msg = `🧭 Lagoinha mais próxima: <b>${esc(nearest.b.name)}</b>, a ${fmtDist(nearest.d)}`;
  }
  el.innerHTML = msg;
  el.classList.toggle('shake', shake);
  el.classList.toggle('hidden', !msg || current !== 'map');
}

// ---------- mapa: lagoinhas, matinhos, pererecas e jogador ----------
const isHidden = (s) => s.kind === 'wild' && !store.revealed[s.id];

function visibleSpawns() {
  const catalog = getCatalog();
  const w = windowOf(store.now());
  const pos = geo.pos;
  const out = [];
  for (const b of store.brejos) {
    if (pos && distanceM(pos, b) > 2500) continue;
    for (const s of spawnsFor(b, w, catalog)) if (!store.view.capturedSpawns.has(s.id)) out.push(s);
  }
  return out;
}

function refreshObjects() {
  if (!map) return;
  const pos = geo.pos;
  const spawns = visibleSpawns();
  const keep = new Set();
  for (const b of store.brejos) {
    const left = spawns.filter((s) => s.brejoId === b.id).length;
    map.setObject(`pond:${b.id}`, {
      lat: b.lat, lng: b.lng, ground: true, className: 'mpond', data: b,
      html: img(hash32(b.id) % 2 ? 'pond-big.png' : 'pond-small.png', hash32(b.id) % 2 ? 132 : 100),
    });
    const lp = offsetLatLng(b.lat, b.lng, -13, 0); // nome logo abaixo da lagoinha
    map.setObject(`label:${b.id}`, { lat: lp.lat, lng: lp.lng, className: 'mlabel', html: `<span>${esc(b.name)} <em>${left} 🐸</em></span>`, data: b });
    keep.add(`pond:${b.id}`); keep.add(`label:${b.id}`);
  }
  const range = captureRange(pos);
  for (const s of spawns) {
    const hidden = isHidden(s);
    const d = pos ? distanceM(pos, s) : Infinity;
    const key = `frog:${s.id}`;
    keep.add(key);
    let html, cls;
    if (hidden) {
      const peek = d <= REVEAL_RANGE_M;
      cls = `mbush ${peek ? 'peek' : 'far'}`;
      html = `<div class="body">${img(peek ? 'bush-peek.png' : 'bush.png', 50, 'bush')}${img('bubble-q.png', 24, 'bubble')}</div>`;
    } else {
      const fresh = justRevealed.has(s.id);
      const delay = -((hash32(s.id) % 2400) / 1000);
      cls = `mfrog ${d <= range ? 'near' : 'far'}`;
      html = `<div class="body" style="--d:${delay}s">${fresh ? img('bubble-ex.png', 24, 'ex') + sparkleHtml(5) : ''}${frogImg(s.speciesId, 50)}<div class="shadow"></div></div>`;
    }
    map.setObject(key, { lat: s.lat, lng: s.lng, html, className: cls, data: s });
  }
  for (const k of map.objectKeys()) if ((k.startsWith('frog:') || k.startsWith('label:') || k.startsWith('pond:')) && !keep.has(k)) map.removeObject(k);

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
  const sig = `${look}|${playerDir}|${walking}`;
  const o = map.objects.get('player');
  map.setObject('player', {
    lat: pos.lat, lng: pos.lng, className: 'mplayer', depthScale: false,
    html: (!o || o.sig !== sig || force) ? `<div class="pshadow"></div>${charHtml(look, { dir: playerDir, walking, scale: 2.6 })}` : null,
  });
  map.objects.get('player').sig = sig;
}

function onGeo() {
  const pos = geo.pos;
  if (lastPos && distanceM(lastPos, pos) > 1.2) {
    playerDir = dirFromBearing(bearing(lastPos, pos));
    walking = true;
    clearTimeout(walkingTimer);
    walkingTimer = setTimeout(() => { walking = false; drawPlayer(); }, 800);
  }
  lastPos = { lat: pos.lat, lng: pos.lng };
  if (map.follow) {
    const jump = distanceM(map.center, pos) > 40;
    map.setCenter(pos.lat, pos.lng, jump);
  }
  refreshObjects();
  renderHint();
  renderExpedition();
}

function recenter() {
  map.follow = true;
  $('.recenter').classList.add('hidden');
  const pos = geo.pos;
  if (pos) map.setCenter(pos.lat, pos.lng, true);
}

function tick() {
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
  if (key.startsWith('label:') || key.startsWith('pond:')) return brejoSheet(data);
  if (!key.startsWith('frog:')) return;
  const s = data;
  const pos = geo.pos;
  const d = pos ? distanceM(pos, s) : Infinity;
  if (isHidden(s)) {
    sfx.tap();
    if (d > REVEAL_RANGE_M) return toast(`Algo se mexe no matinho… Chegue mais perto (faltam ${fmtDist(Math.ceil(d - REVEAL_RANGE_M))}).`, '', 'walk');
    if (sensors.needsPermission() && !sensors.granted) return sensorPermissionSheet();
    return toast('<b>Chacoalhe o celular</b> para a perereca sair do matinho!', '', 'shake', 3500);
  }
  const range = captureRange(pos);
  if (d > range) {
    sfx.error();
    return toast(`Chegue mais perto! Faltam ${fmtDist(Math.ceil(d - range))}.`, 'warn', 'walk');
  }
  sfx.tap();
  startCapture(s);
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
  sfx.croak();
  setTimeout(() => sfx.croak(), 380);
  vibrate([60, 40, 60]);
  if (!pos) return toast('Sem posição ainda: espere o GPS.', 'warn');
  map.setFeature('wave', { lat: pos.lat, lng: pos.lng, radiusM: REVEAL_RANGE_M, className: 'shake-wave' });
  setTimeout(() => map.removeFeature('wave'), 1400);
  const close = hiddenNearby();
  if (close.length) {
    for (const s of close) justRevealed.add(s.id);
    setTimeout(() => { for (const s of close) justRevealed.delete(s.id); refreshObjects(); }, 2600);
    store.reveal(close.map((s) => s.id));
    toast(`Coaxos! ${close.length} perereca${close.length > 1 ? 's saíram' : ' saiu'} do matinho!`, 'ok', 'sound');
  } else if (visibleSpawns().some(isHidden)) toast('Silêncio… Chegue mais perto dos matinhos e chacoalhe de novo.', '', 'sound');
  else toast('Nenhuma perereca escondida por aqui.', '', 'sound');
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
        return `<div class="card" style="padding:8px;width:84px;text-align:center">${hidden ? `<div style="height:56px;display:grid;place-items:center">${img('bush.png', 48)}</div><small>escondida</small>` : `<div style="height:56px;display:grid;place-items:center;${known ? '' : 'filter:brightness(0) opacity(.25)'}">${frogImg(s.speciesId, 52)}</div><small>${known ? esc(species(s.speciesId).name) : '???'}</small>`}</div>`;
      }).join('') : '<p class="lead">Você já pegou todas daqui. Volte em alguns minutos!</p>'}
    </div>
    <button class="btn block" data-act="ok">Bora caçar!</button>`);
  $('[data-act=ok]', sheet).addEventListener('click', () => closeSheet());
}

function statusSheet() {
  sfx.tap();
  const n = store.outbox.length;
  const text = {
    online: 'Conectado. Tudo o que você faz é enviado ao servidor automaticamente.',
    syncing: 'Enviando suas capturas para o servidor…',
    offline: 'Sem internet. Pode continuar jogando: tudo fica salvo no celular e será enviado quando a conexão voltar.',
    'server-down': 'A internet funciona, mas o servidor não respondeu. O jogo continua normalmente e tentaremos de novo sozinhos.',
    starting: 'Verificando a conexão…',
  }[sync.status];
  const sheet = openSheet(`
    <h3>${{ online: '🟢 Online', syncing: '🔄 Sincronizando', offline: '⚫ Jogando offline', 'server-down': '🟠 Servidor indisponível', starting: '…' }[sync.status]}</h3>
    <p class="lead">${text}</p>
    <div class="kv"><div><span>Na fila para enviar</span><b>${n} operaç${n === 1 ? 'ão' : 'ões'}</b></div><div><span>Próxima tentativa</span><b>${sync.nextAt ? `${Math.max(0, Math.round((sync.nextAt - Date.now()) / 1000))} s` : '-'}</b></div></div>
    <div class="row-btns"><button class="btn ghost" data-act="demo">Painel de testes</button><button class="btn" data-act="sync">Sincronizar</button></div>`);
  $('[data-act=sync]', sheet).addEventListener('click', () => { sync.kick(0); closeSheet(); });
  $('[data-act=demo]', sheet).addEventListener('click', () => { closeSheet(true); openDemo(ctx); });
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

// baixa antecipadamente os tiles ao redor das lagoinhas (ficam em cache para uso offline)
const prefetched = new Set();
async function prefetchTiles() {
  if (api.isOffline() || !('caches' in window)) return;
  const urls = [];
  for (const b of store.brejos) {
    if (prefetched.has(b.id)) continue;
    prefetched.add(b.id);
    urls.push(...tilesAround(b.lat, b.lng, b.radius + 300, 18), ...tilesAround(b.lat, b.lng, b.radius + 120, 19));
  }
  for (const u of urls) {
    try { await fetch(u, { mode: 'no-cors' }); } catch { return; }
    await new Promise((r) => setTimeout(r, 40));
  }
}
