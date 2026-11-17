// Perfil: nível, estatísticas, expedição atual (a "partida"), histórico, ranking e sincronização.
import { getCatalog, frogImg } from '../catalog.js';
import { store } from '../store.js';
import { sync } from '../sync.js';
import { api } from '../api.js';
import * as db from '../db.js';
import { icons } from './icons.js';
import { $, esc, openSheet, closeSheet, toast, fmtDist, fmtDuration, fmtDateTime, fmtTime, ago } from './common.js';
import { sfx } from '../audio.js';

let ctx = null;
let ranking = null;

export function mountProfile(el, context) {
  ctx = context;
  el.innerHTML = `<div class="screen-head head-profile"><div class="hero-slot"></div></div>
    <div class="screen-body">
      <div class="stats"></div>
      <div class="section-title">Expedição atual</div>
      <div class="exp-slot"></div>
      <div class="section-title">Ranking do campus <small class="rk-note"></small></div>
      <div class="list rank"></div>
      <div class="section-title">Histórico de expedições</div>
      <div class="list history"></div>
      <div class="section-title">Sincronização</div>
      <div class="card sync-card" style="padding:14px"></div>
      <div class="section-title">Opções</div>
      <div class="list settings-list">
        <div class="card list-item" data-act="demo">${icons.bug}<div class="grow"><div class="t">Painel de demonstração</div><div class="s">Testes de conexão, GPS simulado, conflitos</div></div></div>
        <div class="card list-item" data-act="logout">${icons.logout}<div class="grow"><div class="t">Sair da conta</div><div class="s">Seu progresso continua salvo no servidor</div></div></div>
      </div>
    </div>`;
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sfx.tap();
    if (act === 'demo') ctx.openDemo();
    if (act === 'logout') confirmLogout();
    if (act === 'end-exp') endExpedition();
    if (act === 'sync-now') { sync.kick(0); toast('Sincronizando…', '', 'sync', 1500); }
  });
}

export async function loadRanking(el) {
  try {
    ranking = await api.get('/api/ranking');
    await db.kvSet('ranking', ranking);
  } catch {
    ranking = ranking || (await db.kvGet('ranking'));
  }
  renderRanking(el);
}

function renderRanking(el) {
  const box = $('.rank', el);
  if (!ranking) { box.innerHTML = '<div class="card list-item"><div class="s">Conecte-se para ver o ranking.</div></div>'; return; }
  $('.rk-note', el).textContent = `${ranking.players} jogadores`;
  const me = store.view.player?.id;
  const rows = ranking.top.slice(0, 10);
  if (ranking.me && !rows.some((r) => r.id === me)) rows.push({ ...ranking.me, pos: ranking.me.rank });
  box.innerHTML = rows.map((r, i) => `<div class="card list-item rank-item ${r.id === me ? 'me' : ''} ${i < 3 ? `top${i + 1}` : ''}">
    <div class="pos">${r.pos || i + 1}</div><div class="avatar" style="width:40px;height:40px">${frogImg(r.avatar || 'frog_leaf', 30)}</div>
    <div class="grow"><div class="t">${esc(r.displayName)}${r.id === me ? ' (você)' : ''}</div><div class="s">Nível ${r.level} · ${r.species} espécies</div></div>
    <span class="pill-xp">${r.xp} XP</span></div>`).join('');
}

export function renderProfile(el) {
  const v = store.view;
  if (!v.player) return;
  const cat = getCatalog();
  const lv = v.level;
  $('.hero-slot', el).innerHTML = `<div class="profile-hero">
      <div class="avatar-wrap"><div class="avatar">${frogImg(v.player.avatar || 'frog_leaf', 64)}</div><span class="lvl">${lv.level}</span></div>
      <div><h2>${esc(v.player.displayName)}</h2><p>@${esc(v.player.username)} · código ${esc(v.player.friendCode || '')}</p></div>
    </div>
    <div class="xpline">Nível ${lv.level} · ${lv.into}/${lv.need} XP para o próximo<div class="progress"><i style="width:${(lv.into / lv.need) * 100}%"></i></div></div>`;

  const finished = v.expeditions.filter((e) => e.status === 'finished');
  $('.stats', el).innerHTML = [
    ['book', '#4cb944', `${v.discovered.size}/${cat.species.length}`, 'espécies'],
    ['pond', '#3bb5cf', v.captures.length, 'capturas'],
    ['route', '#ff7a5c', fmtDist(v.totalMeters), 'caminhados'],
    ['flag', '#9b67e0', v.expeditions.length, 'expedições'],
  ].map(([ic, c, b, s]) => `<div class="card stat"><div class="ico" style="background:${c}">${icons[ic]}</div><div><b>${b}</b><span>${s}</span></div></div>`).join('');

  const cur = store.currentExpedition();
  $('.exp-slot', el).innerHTML = cur ? `<div class="card exp-now">
      <div style="display:flex;justify-content:space-between;align-items:center"><b>Expedição em andamento</b><span class="s" style="font-size:13px;color:var(--ink-soft)">desde ${fmtTime(cur.startedAt)}</span></div>
      <div class="row"><div><b>${cur.captures.length}</b><span>pererecas</span></div><div><b>${cur.xp}</b><span>XP</span></div><div><b>${fmtDist(cur.meters)}</b><span>caminhados</span></div><div><b>${fmtDuration(store.now() - cur.startedAt)}</b><span>duração</span></div></div>
      <button class="btn small coral block" data-act="end-exp">${icons.flag} Encerrar expedição</button>
    </div>` : '<div class="card list-item"><div class="s">Ande pelo mapa para começar uma expedição.</div></div>';

  $('.history', el).innerHTML = finished.length ? finished.slice(0, 15).map((e) => `<div class="card list-item">
      <div class="grow"><div class="t">${fmtDateTime(e.startedAt)}</div>
      <div class="s">${fmtDuration((e.endedAt || e.updatedAt) - e.startedAt)} · ${fmtDist(e.meters)} · ${e.captures.length} perereca${e.captures.length === 1 ? '' : 's'}${e.pending ? ' · ☁️ pendente' : ''}</div>
      <div class="frogs">${e.captures.slice(0, 8).map((c) => frogImg(c.speciesId, 22)).join('')}</div></div>
      <span class="pill-xp">+${e.xp} XP</span></div>`).join('') : '<div class="card list-item"><div class="s">Suas expedições encerradas aparecem aqui.</div></div>';

  renderSyncCard(el);
  if (ranking) renderRanking(el);
}

export function renderSyncCard(el) {
  const label = { online: '🟢 Online', offline: '⚫ Offline', 'server-down': '🟠 Servidor indisponível', syncing: '🔄 Sincronizando', starting: '…' }[sync.status];
  $('.sync-card', el).innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div><b>${label}</b><div class="s" style="font-size:13px;color:var(--ink-soft);font-weight:500;margin-top:3px">
        ${store.outbox.length} operaç${store.outbox.length === 1 ? 'ão' : 'ões'} na fila · última sincronização ${sync.lastSyncAt ? ago(sync.lastSyncAt) : 'nunca nesta sessão'}<br>
        Este aparelho: <b>${esc(store.deviceId)}</b></div></div>
      <button class="icon-btn" data-act="sync-now" aria-label="Sincronizar agora">${icons.sync}</button>
    </div>`;
}

async function endExpedition() {
  const sum = await store.endExpedition();
  if (!sum) return;
  sfx.win();
  const sheet = openSheet(`
    <h3>🏁 Expedição encerrada!</h3>
    <p class="lead">Começou ${fmtDateTime(sum.startedAt)}</p>
    <div class="kv">
      <div><span>Pererecas</span><b>${sum.captures.length}</b></div><div><span>XP ganho</span><b>+${sum.xp}</b></div>
      <div><span>Distância</span><b>${fmtDist(sum.meters)}</b></div><div><span>Duração</span><b>${fmtDuration(sum.endedAt - sum.startedAt)}</b></div>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:16px">${sum.captures.map((c) => frogImg(c.speciesId, 40)).join('')}</div>
    <button class="btn block" data-act="ok">Começar nova expedição</button>`);
  $('[data-act=ok]', sheet).addEventListener('click', async () => { closeSheet(); await store.ensureExpedition(); ctx.refresh(); });
}

function confirmLogout() {
  const n = store.outbox.length;
  const sheet = openSheet(`
    <h3>Sair da conta?</h3>
    <p class="lead">${n ? `⚠️ Existem <b>${n} operações</b> que ainda não chegaram ao servidor. Se sair agora, elas serão perdidas. Conecte-se e espere sincronizar.` : 'Tudo sincronizado. Você pode entrar de novo em qualquer aparelho e continuar de onde parou.'}</p>
    <div class="row-btns"><button class="btn ghost" data-act="no">Ficar</button><button class="btn coral" data-act="yes">Sair</button></div>`);
  $('[data-act=no]', sheet).addEventListener('click', () => closeSheet());
  $('[data-act=yes]', sheet).addEventListener('click', async () => { closeSheet(true); await store.logout(); location.reload(); });
}
