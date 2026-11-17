// Tela principal: mapa + HUD + navegação entre Pererecário, Meu Brejo, Amigos e Perfil.
import { GameMap, tilesAround } from './map.js';
import { openCapture } from './capture.js';
import { mountAlbum, renderAlbum, openSpecies } from './album.js';
import { mountPond, renderPond } from './pond.js';
import { mountFriends, renderFriends } from './friends.js';
import { mountProfile, renderProfile, loadRanking, renderSyncCard } from './profile.js';
import { openDemo } from './demo.js';
import { icons, explorerSvg } from './icons.js';
import { $, $$, h, esc, toast, openSheet, closeSheet, fmtDist, fmtDuration } from './common.js';
import { getCatalog, frogImg, species } from '../catalog.js';
import { store } from '../store.js';
import { sync } from '../sync.js';
import { geo } from '../geo.js';
import { sensors } from '../sensors.js';
import { api } from '../api.js';
import { sfx, vibrate, unlockAudio } from '../audio.js';
import {
  spawnsFor, windowOf, windowEnd, distanceM, offsetLatLng, hash32,
  CAPTURE_RANGE_M, REVEAL_RANGE_M,
} from '../shared/game.js';

const BUSH = `<svg viewBox="0 0 62 46"><ellipse cx="31" cy="42" rx="26" ry="4" fill="rgba(0,0,0,.18)"/><circle cx="18" cy="28" r="14" fill="#3e9b45"/><circle cx="44" cy="28" r="14" fill="#3e9b45"/><circle cx="31" cy="20" r="16" fill="#52b553"/><circle cx="24" cy="16" r="5" fill="#7fd36d" opacity=".7"/></svg>`;

let map, current = 'map', ctx, lastWin = null, walkingTimer = null, installEvt = null;
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
      <button class="icon-btn shake-btn hidden" aria-label="Coaxar">${icons.sound}</button>
      <button class="icon-btn recenter hidden" aria-label="Centralizar">${icons.locate}</button>
    </div>
    <section class="screen" data-screen="album"></section>
    <section class="screen" data-screen="pond"></section>
    <section class="screen" data-screen="friends"></section>
    <section class="screen" data-screen="profile"></section>
    <nav class="navbar">
      <button data-nav="album">${icons.book}<span>Pererecário</span></button>
      <button data-nav="pond">${icons.pond}<span>Meu Brejo</span><b class="badge hidden"></b></button>
      <button data-nav="map" class="nav-map on"><span class="orb">${icons.map}</span><span>Mapa</span></button>
      <button data-nav="friends">${icons.friends}<span>Amigos</span></button>
      <button data-nav="profile">${icons.user}<span>Perfil</span></button>
    </nav>`;

  ctx = {
    refresh: () => { refreshObjects(); renderAll(); },
    capture: (spawn) => startCapture(spawn),
    openDemo: () => openDemo(ctx),
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
  store.addEventListener('change', () => {
    refreshObjects();
    renderAll();
    const lv = store.view.level.level;
    if (lv > lastLevel) { setTimeout(() => { sfx.win(); toast(`⭐ Você subiu para o nível ${lv}!`, 'ok', null, 3500); }, 1200); }
    lastLevel = lv;
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
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });

  setInterval(tick, 1000);
  refreshObjects();
  renderAll();

  if (!store.settings.onboarded) onboarding(firstTime);
  else {
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
  $('.player-chip .avatar').innerHTML = frogImg(v.player.avatar || 'frog_leaf', 34);
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
  if (!cur) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<div><b>🐸 ${cur.captures.length}</b>pererecas</div><div class="sep"></div><div><b>${fmtDist(cur.meters)}</b>andados</div><div class="sep"></div><div><b>${fmtDuration(store.now() - cur.startedAt)}</b>expedição</div>`;
}

function renderHint() {
  const el = $('.hint-bubble');
  if (!el) return;
  let msg = '';
  const pos = geo.pos;
  if (geo.mode === 'real' && geo.error === 'denied') msg = '📍 Localização bloqueada. Permita o acesso à localização no navegador para encontrar os brejos.';
  else if (geo.mode === 'real' && geo.error === 'unsupported') msg = 'Este aparelho não informa a localização.';
  else if (!pos) msg = '📡 Procurando sinal de GPS…';
  else if (!store.brejos.length) msg = 'Nenhum brejo cadastrado ainda. Peça ao organizador para criar os brejos do campus.';
  else if (pos.accuracy > 60) msg = `📡 Sinal de GPS fraco (±${Math.round(pos.accuracy)} m). Vá para um lugar aberto.`;
  else {
    const nearest = store.brejos.map((b) => ({ b, d: distanceM(pos, b) - b.radius })).sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d > 150) msg = `🧭 O brejo mais próximo, <b>${esc(nearest.b.name)}</b>, está a ${fmtDist(nearest.d)}. Vá até lá!`;
  }
  el.innerHTML = msg;
  el.classList.toggle('hidden', !msg || current !== 'map');
}

// ---------- mapa: brejos, pererecas e jogador ----------
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
  const brejoIds = new Set(store.brejos.map((b) => `brejo:${b.id}`));
  for (const k of [...map.features.keys()]) if (k.startsWith('brejo:') && !brejoIds.has(k)) map.removeFeature(k);
  const keep = new Set();
  for (const b of store.brejos) {
    map.setFeature(`brejo:${b.id}`, { lat: b.lat, lng: b.lng, radiusM: b.radius, className: 'brejo-water' });
    const left = spawns.filter((s) => s.brejoId === b.id).length;
    const lp = offsetLatLng(b.lat, b.lng, b.radius + 8, 0);
    map.setObject(`label:${b.id}`, { lat: lp.lat, lng: lp.lng, className: 'mlabel', html: `<span>📍 ${esc(b.name)} <em>${left} 🐸</em></span>`, data: b });
    keep.add(`label:${b.id}`);
  }
  for (const s of spawns) {
    const hidden = s.hidden && !store.revealed[s.id];
    const d = pos ? distanceM(pos, s) : Infinity;
    const near = d <= CAPTURE_RANGE_M;
    const delay = -((hash32(s.id) % 2400) / 1000);
    const key = `frog:${s.id}`;
    keep.add(key);
    const html = hidden
      ? `<div class="body"><div class="bush">${BUSH}<b>?</b></div></div>`
      : `<div class="body" style="--d:${delay}s">${frogImg(s.speciesId, 58)}<div class="shadow"></div></div>`;
    map.setObject(key, { lat: s.lat, lng: s.lng, html, className: `mfrog ${near ? 'near' : 'far'}`, data: s });
  }
  for (const k of map.objectKeys()) if ((k.startsWith('frog:') || k.startsWith('label:')) && !keep.has(k)) map.removeObject(k);

  if (pos) {
    map.setObject('player', { lat: pos.lat, lng: pos.lng, className: 'mplayer', html: explorerSvg, depthScale: false });
    map.setFeature('range', { lat: pos.lat, lng: pos.lng, radiusM: CAPTURE_RANGE_M, className: 'range-ring' });
    if (!pos.simulated && pos.accuracy > CAPTURE_RANGE_M) map.setFeature('acc', { lat: pos.lat, lng: pos.lng, radiusM: pos.accuracy, className: 'acc-ring' });
    else map.removeFeature('acc');
  }
}

function onGeo() {
  const pos = geo.pos;
  if (map.follow) {
    const jump = distanceM(map.center, pos) > 40;
    map.setCenter(pos.lat, pos.lng, jump);
  }
  const p = map.objects.get('player');
  if (p) {
    p.el.classList.add('walking');
    clearTimeout(walkingTimer);
    walkingTimer = setTimeout(() => p.el.classList.remove('walking'), 700);
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
    if (lastWin != null) toast('🐸 Novas pererecas chegaram aos brejos!', 'ok', null, 2500);
    lastWin = w;
    refreshObjects();
  }
  renderExpedition();
}

// ---------- interações ----------
function onTapObject(key, data) {
  unlockAudio();
  if (key.startsWith('label:')) return brejoSheet(data);
  if (!key.startsWith('frog:')) return;
  const s = data;
  const pos = geo.pos;
  const hidden = s.hidden && !store.revealed[s.id];
  const d = pos ? distanceM(pos, s) : Infinity;
  if (hidden) {
    sfx.tap();
    if (sensors.needsPermission() && !sensors.granted) return sensorPermissionSheet();
    return toast('Algo se mexe na moita… <b>Chacoalhe o celular</b> perto dela para ouvir quem está escondida!', '', 'shake', 4000);
  }
  if (d > CAPTURE_RANGE_M) {
    sfx.error();
    return toast(`Chegue mais perto! Faltam ${fmtDist(Math.ceil(d - CAPTURE_RANGE_M))}.`, 'warn', 'walk');
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
  if (document.querySelector('.capture, .scanner') || current !== 'map') return;
  const pos = geo.pos;
  sfx.croak();
  setTimeout(() => sfx.croak(), 380);
  vibrate([60, 40, 60]);
  if (!pos) return toast('Sem posição ainda: espere o GPS.', 'warn');
  map.setFeature('wave', { lat: pos.lat, lng: pos.lng, radiusM: REVEAL_RANGE_M, className: 'shake-wave' });
  setTimeout(() => map.removeFeature('wave'), 1400);
  const all = visibleSpawns().filter((s) => s.hidden && !store.revealed[s.id]);
  const close = all.filter((s) => distanceM(pos, s) <= REVEAL_RANGE_M);
  if (close.length) {
    store.reveal(close.map((s) => s.id));
    setTimeout(() => close.forEach((s) => map.objects.get(`frog:${s.id}`)?.el.classList.add('revealing')), 30);
    toast(`Coaxos! ${close.length} perereca${close.length > 1 ? 's saíram' : ' saiu'} da moita!`, 'ok', 'sound');
  } else if (all.length) toast('Silêncio… Chegue mais perto das moitas e chacoalhe de novo.', '', 'sound');
  else toast('Nenhuma perereca escondida por aqui.', '', 'sound');
}

function brejoSheet(b) {
  const spawns = visibleSpawns().filter((s) => s.brejoId === b.id);
  const left = Math.max(0, windowEnd(windowOf(store.now())) - store.now());
  const d = geo.pos ? distanceM(geo.pos, b) : null;
  const sheet = openSheet(`
    <h3>📍 ${esc(b.name)}</h3>
    <p class="lead">${d != null ? `A ${fmtDist(Math.max(0, d - b.radius))} de você · ` : ''}novas pererecas em ${Math.ceil(left / 60000)} min</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:6px 0 16px">
      ${spawns.length ? spawns.map((s) => {
        const hidden = s.hidden && !store.revealed[s.id];
        const known = store.view.discovered.has(s.speciesId);
        return `<div class="card" style="padding:8px;width:84px;text-align:center">${hidden ? `<div style="height:56px;display:grid;place-items:center;font-size:28px">🌿</div><small>escondida</small>` : `<div style="height:56px;display:grid;place-items:center;${known ? '' : 'filter:brightness(0) opacity(.25)'}">${frogImg(s.speciesId, 52)}</div><small>${known ? esc(species(s.speciesId).name) : '???'}</small>`}</div>`;
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
    <p class="lead">O Pererecário usa o acelerômetro (chacoalhar para ouvir pererecas escondidas) e o giroscópio (virar o celular para procurá-las na captura).</p>
    <button class="btn block" data-act="ok">Ativar sensores</button>`);
  $('[data-act=ok]', sheet).addEventListener('click', async () => {
    const ok = await sensors.request();
    closeSheet();
    toast(ok ? 'Sensores ativados! Chacoalhe perto das moitas.' : 'Sem permissão para os sensores.', ok ? 'ok' : 'warn');
    renderGpsChip();
  });
}

function onboarding(firstTime) {
  const name = esc(store.view.player?.displayName || '');
  const sheet = openSheet(`
    <div class="stage-lg" style="height:150px">${frogImg('frog_leaf', 120)}</div>
    <h3>${firstTime ? `Bem-vindo, ${name}!` : `Oi de novo, ${name}!`}</h3>
    <p class="lead">As pererecas estão esperando nos <b>brejos do campus</b>. Ande até elas, toque para capturar e complete o seu Pererecário!</p>
    <div class="list" style="margin-bottom:16px">
      <div class="card list-item">${icons.locate}<div class="grow"><div class="t">Localização</div><div class="s">Para saber quando você chega perto de um brejo</div></div></div>
      <div class="card list-item">${icons.shake}<div class="grow"><div class="t">Sensores de movimento</div><div class="s">Chacoalhe para ouvir pererecas escondidas</div></div></div>
      <div class="card list-item">${icons.cloudOff}<div class="grow"><div class="t">Funciona sem internet</div><div class="s">Seu progresso é salvo no celular e sincronizado depois</div></div></div>
    </div>
    <button class="btn block" data-act="go">Ativar e começar</button>`, { onClose: () => finish() });
  let done = false;
  async function finish() {
    if (done) return;
    done = true;
    await store.saveSettings({ onboarded: true });
    geo.start();
  }
  $('[data-act=go]', sheet).addEventListener('click', async () => {
    unlockAudio();
    await sensors.request();
    closeSheet();
    finish();
  });
}

// baixa antecipadamente os tiles ao redor dos brejos (ficam em cache para uso offline)
let prefetched = new Set();
async function prefetchTiles() {
  if (api.isOffline() || !('caches' in window)) return;
  const urls = [];
  for (const b of store.brejos) {
    if (prefetched.has(b.id)) continue;
    prefetched.add(b.id);
    for (const z of [17, 18]) urls.push(...tilesAround(b.lat, b.lng, b.radius + 300, z));
  }
  for (const u of urls) {
    try { await fetch(u, { mode: 'no-cors' }); } catch { return; }
    await new Promise((r) => setTimeout(r, 40));
  }
}

export function getInstallEvent() { return installEvt; }
