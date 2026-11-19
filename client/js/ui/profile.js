// Perfil: nível, estatísticas, expedição atual (a "partida"), histórico, ranking e sincronização.
import { getCatalog, frogImg, species, rarityBadge } from '../catalog.js';
import { store } from '../store.js';
import { sync } from '../sync.js';
import { api } from '../api.js';
import * as db from '../db.js';
import { icons } from './icons.js';
import { charHtml, lookOf, lookName } from './sprites.js';
import { openWardrobe } from './wardrobe.js';
import { isNightAt } from './daynight.js';
import { geo } from '../geo.js';
import { dayOf, findBrejo } from '../shared/game.js';
import { $, $$, esc, openSheet, closeSheet, toast, fmtDist, fmtTime, ago } from './common.js';
import { sfx } from '../audio.js';

let ctx = null;
let ranking = null;

export function mountProfile(el, context) {
  ctx = context;
  el.innerHTML = `<div class="screen-head head-profile"><div class="hero-slot"></div></div>
    <div class="screen-body">
      <div class="stats"></div>
      <div class="section-title">Caçada de hoje</div>
      <div class="exp-slot"></div>
      <div class="section-title">Ranking <small class="rk-note"></small></div>
      <div class="list rank"></div>
      <div class="section-title">Diário de campo <small>últimas capturas</small></div>
      <div class="list history"></div>
      <div class="section-title">Sincronização</div>
      <div class="card sync-card" style="padding:14px"></div>
      <div class="section-title">Opções</div>
      <div class="list settings-list">
        <div class="card list-item tog" data-act="visible">${icons.people}<div class="grow"><div class="t">Aparecer no mapa dos outros</div><div class="s">Quem estiver a até 300 m vê o seu boneco e o seu nome</div></div><div class="switch ${store.settings.hidePresence ? '' : 'on'}"></div></div>
        <div class="card list-item" data-act="howto">${icons.sparkle}<div class="grow"><div class="t">Como jogar</div><div class="s">Rever as dicas do jogo</div></div></div>
        <div class="card list-item" data-act="demo">${icons.bug}<div class="grow"><div class="t">Painel de demonstração</div><div class="s">Testes de conexão, modo controle, céu, conflitos</div></div></div>
        <div class="card list-item" data-act="logout">${icons.logout}<div class="grow"><div class="t">Sair da conta</div><div class="s">Seu progresso continua salvo no servidor</div></div></div>
      </div>
    </div>`;
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sfx.tap();
    if (act === 'demo') ctx.openDemo();
    if (act === 'logout') confirmLogout();
    if (act === 'howto') ctx.openTutorial();
    if (act === 'look') openWardrobe();
    if (act === 'diary') openDiary();
    if (act === 'visible') {
      await store.saveSettings({ hidePresence: !store.settings.hidePresence });
      e.target.closest('[data-act]').querySelector('.switch').classList.toggle('on', !store.settings.hidePresence);
      toast(store.settings.hidePresence ? 'Você não aparece mais para os outros jogadores.' : 'Agora os jogadores por perto veem você no mapa.', '', 'people', 2500);
    }
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
  $('.rk-note', el).textContent = `${ranking.players} jogador${ranking.players === 1 ? '' : 'es'}`;
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
      <div class="ph-info">
        <h2>${esc(v.player.displayName)}</h2>
        <p>@${esc(v.player.username)} · código ${esc(v.player.friendCode || '')}</p>
        <div class="ph-level"><span class="ph-lv">Nível ${lv.level}</span><span>${lv.into}/${lv.need} XP</span></div>
        <div class="progress"><i style="width:${(lv.into / lv.need) * 100}%"></i></div>
      </div>
      <button class="ph-char" data-act="look" aria-label="Trocar visual (${esc(lookName(lookOf(v.player)))})">
        <span class="ph-stage">${charHtml(lookOf(v.player), { dir: 'down', scale: 2.9 })}</span>
        <span class="ph-edit">${icons.shirt}</span>
        <span class="ph-cap">Trocar visual</span>
      </button>
    </div>`;

  const huntDays = new Set(v.captures.map((c) => dayOf(c.caughtAt))).size;
  $('.stats', el).innerHTML = [
    ['book', '#4cb944', `${v.discovered.size}/${cat.species.length}`, 'espécies'],
    ['pond', '#3bb5cf', v.captures.length, 'capturas'],
    ['route', '#ff7a5c', fmtDist(v.totalMeters), 'caminhados'],
    ['flag', '#9b67e0', huntDays, huntDays === 1 ? 'dia de caçada' : 'dias de caçada'],
  ].map(([ic, c, b, s]) => `<div class="card stat"><div class="ico" style="background:${c}">${icons[ic]}</div><div><b>${b}</b><span>${s}</span></div></div>`).join('');

  const cur = store.currentExpedition();
  $('.exp-slot', el).innerHTML = `<div class="card exp-now">
      <div style="display:flex;justify-content:space-between;align-items:center"><b>${fmtDay(dayOf(store.now()))}</b><span class="s" style="font-size:13px;color:var(--ink-soft)">salva sozinha, mesmo offline</span></div>
      <div class="row"><div><b>${cur?.captures.length || 0}</b><span>pererecas</span></div><div><b>${cur?.xp || 0}</b><span>XP</span></div><div><b>${fmtDist(cur?.meters || 0)}</b><span>caminhados</span></div></div>
      <div class="frogs-row">${(cur?.captures || []).slice(0, 12).map((c) => frogImg(c.speciesId, 30)).join('') || '<span class="s" style="font-size:13px;color:var(--ink-soft)">Nenhuma perereca hoje ainda. Bora caçar!</span>'}</div>
    </div>`;

  const recent = v.captures.slice(0, DIARY_SHOWN);
  $('.history', el).innerHTML = recent.length
    ? recent.map((c) => diaryRow(c)).join('') + (v.captures.length > DIARY_SHOWN
      ? `<button class="btn ghost block see-all" data-act="diary">Ver todas as capturas</button>` : '')
    : '<div class="card list-item"><div class="s">Suas capturas aparecem aqui, da mais recente para a mais antiga.</div></div>';

  renderSyncCard(el);
  if (ranking) renderRanking(el);
}

const DIARY_SHOWN = 5;

// Linha do diário, sempre no mesmo formato: perereca | nome + hora e lugar | raridade + XP
function diaryRow(c, withDay = true) {
  const sp = species(c.speciesId);
  const tier = getCatalog().tiers[sp.tier];
  const brejo = c.brejoId ? findBrejo(c.brejoId, store.brejos, store.view.player?.id || '') : null;
  const where = c.kind === 'gift' ? '🎁 presente de amigo' : esc(brejo?.name || 'lagoinha');
  const night = isNightAt(c.caughtAt, brejo || geo.pos);
  return `<div class="card diary-row">
    <div class="d-frog" style="--tier:${tier.color}">${frogImg(c.speciesId, 36)}</div>
    <div class="d-main"><div class="d-name">${esc(sp.name)}</div>
      <div class="d-meta"><span class="d-sky" title="${night ? 'Noite' : 'Dia'}">${night ? icons.moon : icons.sun}</span>${withDay ? `${fmtDay(dayOf(c.caughtAt))}, ` : ''}${fmtTime(c.caughtAt)} · ${where}${c.pending ? ' · ☁️ pendente' : ''}</div></div>
    <div class="d-side">${rarityBadge(c.speciesId)}<span class="pill-xp">+${store.view.perCapture.get(c.id)?.xp || 0} XP</span></div>
  </div>`;
}

// Diário completo em forma de calendário: um mês por vez (setas para os outros meses),
// os dias com captura ficam marcados com a quantidade, e tocar num dia mostra as capturas dele.
// Funciona igual com 1 dia ou com meses de jogo.
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const ymOf = (day) => { const d = new Date(day * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; };
const dayFromYmd = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);

function openDiary() {
  const byDay = new Map();
  for (const c of store.view.captures) {
    const d = dayOf(c.caughtAt);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(c);
  }
  const days = [...byDay.keys()].sort((a, b) => b - a);
  // meses que têm alguma captura (as setas pulam direto entre eles)
  const months = [...new Set(days.map((d) => { const { y, m } = ymOf(d); return y * 12 + m; }))].sort((a, b) => a - b);
  const today = dayOf(store.now());
  let sel = days[0];
  let ym = (() => { const { y, m } = ymOf(sel); return y * 12 + m; })();

  openSheet(`<h3>Diário de campo</h3><p class="lead">Toque num dia marcado, ou toque no mês para digitar uma data.</p>
    <div class="cal">
      <div class="cal-head"><button class="cal-nav" data-nav="-1" aria-label="Mês anterior">${icons.back}</button>
        <button class="cal-title" aria-label="Digitar uma data"></button>
        <button class="cal-nav next" data-nav="1" aria-label="Próximo mês">${icons.back}</button></div>
      <form class="cal-jump hidden">
        <input class="cal-input" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="dia/mês (ex.: 17/11)" aria-label="Data">
        <button class="btn small" type="submit">Ir</button>
      </form>
      <div class="cal-week">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid"></div>
    </div>
    <div class="day-title"></div><div class="day-sum"></div><div class="list diary-all"></div>`, { cls: 'diary-sheet' });
  const sheet = $('.diary-sheet');
  const jump = $('.cal-jump', sheet), input = $('.cal-input', sheet);
  const prevMonth = () => [...months].reverse().find((x) => x < ym);
  const nextMonth = () => months.find((x) => x > ym);

  function renderMonth() {
    const y = Math.floor(ym / 12), m = ym % 12;
    $('.cal-title', sheet).innerHTML = `${cap(MONTHS[m])} de ${y} <span class="cal-edit">${icons.calendar}</span>`;
    $$('.cal-nav', sheet).forEach((b) => { b.disabled = Number(b.dataset.nav) < 0 ? prevMonth() == null : nextMonth() == null; });
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const total = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let html = '<span class="cal-blank"></span>'.repeat(first);
    for (let d = 1; d <= total; d++) {
      const day = dayFromYmd(y, m, d);
      const n = byDay.get(day)?.length || 0;
      const cls = [n ? 'has' : '', day === sel ? 'on' : '', day === today ? 'today' : ''].join(' ');
      html += n
        ? `<button class="cal-day ${cls}" data-day="${day}"><b>${d}</b><small>${n}</small></button>`
        : `<span class="cal-day ${cls}"><b>${d}</b></span>`;
    }
    $('.cal-grid', sheet).innerHTML = html;
  }

  function showDay() {
    const list = byDay.get(sel) || [];
    const xp = list.reduce((t, c) => t + (store.view.perCapture.get(c.id)?.xp || 0), 0);
    const kinds = new Set(list.map((c) => c.speciesId)).size;
    const date = new Date(sel * 86400000 + 12 * 3600000).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: ymOf(sel).y !== ymOf(today).y ? 'numeric' : undefined, timeZone: 'UTC' });
    $('.day-title', sheet).textContent = sel === today ? `Hoje, ${date}` : sel === today - 1 ? `Ontem, ${date}` : cap(date);
    $('.day-sum', sheet).innerHTML = `<div><b>${list.length}</b><span>${list.length === 1 ? 'perereca' : 'pererecas'}</span></div><div><b>${kinds}</b><span>${kinds === 1 ? 'espécie' : 'espécies'}</span></div><div><b>${xp}</b><span>XP</span></div>`;
    $('.diary-all', sheet).innerHTML = list.length
      ? list.map((c) => diaryRow(c, false)).join('')
      : '<div class="card list-item"><div class="s">Nenhuma perereca capturada neste dia.</div></div>';
  }

  // "17/11", "17/11/2026", "1711" ou "17112026". Sem ano: o mais recente que não está no futuro.
  function parseDate(text) {
    const digits = text.replace(/\D/g, '');
    const parts = text.includes('/') || text.includes('-') || text.includes('.')
      ? text.split(/[/.-]/).map((x) => x.trim()).filter(Boolean)
      : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean);
    const d = Number(parts[0]), m = Number(parts[1]) - 1;
    let y = parts[2] ? Number(parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : ymOf(today).y;
    if (!(d >= 1 && d <= 31 && m >= 0 && m <= 11 && y > 2000)) return null;
    if (new Date(Date.UTC(y, m, d)).getUTCMonth() !== m) return null; // ex.: 31/02
    let day = dayFromYmd(y, m, d);
    if (!parts[2] && day > today) day = dayFromYmd(--y, m, d);
    return day;
  }

  // máscara: coloca as barras sozinho enquanto digita
  input.addEventListener('input', () => {
    let parts = input.value.split(/[/.-]/).map((x) => x.replace(/\D/g, ''));
    if (parts.length === 1 && parts[0].length > 2) parts = [parts[0].slice(0, 2), parts[0].slice(2)];
    if (parts.length === 2 && parts[1].length > 2) parts = [parts[0], parts[1].slice(0, 2), parts[1].slice(2)];
    parts = parts.slice(0, 3).map((x, i) => x.slice(0, i === 2 ? 4 : 2));
    input.value = parts.join('/');
  });
  jump.addEventListener('submit', (e) => {
    e.preventDefault();
    const day = parseDate(input.value);
    if (day == null) { sfx.error(); toast('Data inválida. Digite assim: 17/11 ou 17/11/2026.', 'warn', null, 2500); return; }
    sel = day;
    const { y, m } = ymOf(day);
    ym = y * 12 + m;
    sfx.tap();
    jump.classList.add('hidden');
    input.blur();
    renderMonth();
    showDay();
  });

  $('.cal', sheet).addEventListener('click', (e) => {
    if (e.target.closest('.cal-title')) {
      jump.classList.toggle('hidden');
      if (!jump.classList.contains('hidden')) { input.value = ''; input.focus(); }
      sfx.tap();
      return;
    }
    const nav = e.target.closest('.cal-nav');
    if (nav && !nav.disabled) {
      ym = Number(nav.dataset.nav) < 0 ? prevMonth() : nextMonth();
      sfx.tap();
      renderMonth();
      return;
    }
    const b = e.target.closest('[data-day]');
    if (!b) return;
    sel = Number(b.dataset.day);
    sfx.tap();
    renderMonth();
    showDay();
  });
  renderMonth();
  showDay();
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

function fmtDay(day) {
  if (!Number.isFinite(day)) return '';
  const today = dayOf(store.now());
  if (day === today) return 'Hoje';
  if (day === today - 1) return 'Ontem';
  const d = new Date(day * 86400000 + 12 * 3600000);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
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
