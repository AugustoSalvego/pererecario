// Perfil: nível, estatísticas, expedição atual (a "partida"), histórico, ranking e sincronização.
import { getCatalog, frogImg, species, rarityBadge } from '../catalog.js';
import { store } from '../store.js';
import { sync } from '../sync.js';
import { api } from '../api.js';
import * as db from '../db.js';
import { icons } from './icons.js';
import { charHtml, headHtml, lookOf, lookName } from './sprites.js';
import { openWardrobe } from './wardrobe.js';
import { isNightAt } from './daynight.js';
import { geo } from '../geo.js';
import { dayOf, findBrejo } from '../shared/game.js';
import { $, $$, esc, openSheet, closeSheet, toast, fmtDist, fmtTime, ago } from './common.js';
import { sfx } from '../audio.js';
import { renderGoogleButton } from './login.js';

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
      <button class="btn ghost block rank-all hidden" data-act="ranking">Ver todos os rankings</button>
      <div class="section-title">Diário de campo <small>últimas capturas</small></div>
      <div class="list history"></div>
      <div class="section-title">Sincronização</div>
      <div class="card sync-card" style="padding:14px"></div>
      <div class="section-title">Conta</div>
      <div class="list settings-list account-list"></div>
      <div class="section-title">Opções</div>
      <div class="list settings-list">
        <div class="card list-item tog" data-act="visible">${icons.people}<div class="grow"><div class="t">Aparecer no mapa dos outros</div><div class="s">Quem estiver a até 300 m vê o seu boneco e o seu nome</div></div><div class="switch ${store.settings.hidePresence ? '' : 'on'}"></div></div>
        <div class="card list-item" data-act="howto">${icons.sparkle}<div class="grow"><div class="t">Como jogar</div><div class="s">Rever as dicas do jogo</div></div></div>
        <div class="card list-item staff-only hidden" data-act="demo">${icons.bug}<div class="grow"><div class="t">Painel de demonstração</div><div class="s">Testes de conexão, modo controle, céu, conflitos</div></div></div>
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
    if (act === 'ranking') openRanking();
    if (act === 'google-link') openGoogleLink();
    if (act === 'password') openPassword();
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

// ---------- ranking ----------
// Três quadros: mais XP, mais capturas e mais Brejais ganhos. No perfil aparecem os 5 primeiros
// de XP (com medalhas de ouro, prata e bronze); "Ver todos" abre o pódio com as três abas.
const BOARDS = {
  xp: { label: 'Mais XP', value: (r) => `${r.xp} XP`, sub: (r) => `Nível ${r.level} · ${r.species} espécies` },
  captures: { label: 'Mais capturas', value: (r) => `${r.captures} 🐸`, sub: (r) => `${r.species} espécies · nível ${r.level}` },
  gold: { label: 'Mais Brejais', value: (r) => `<span class="bcoin">B$</span>&nbsp;${r.gold}`, sub: (r) => `Nível ${r.level} · ${r.captures} capturas` },
};
const MEDAL = ['ouro', 'prata', 'bronze'];

function boardOf(key) {
  if (ranking?.boards?.[key]) return ranking.boards[key];
  if (key === 'xp' && ranking?.top) return { top: ranking.top, me: ranking.me };   // cache antigo
  return null;
}

function face(r, size = 40) {
  const look = r.look ? lookOf({ look: r.look }) : null;
  return `<div class="avatar rk-face" style="width:${size}px;height:${size}px">${look ? headHtml(look, size >= 56 ? 2 : 1.45) : frogImg(r.avatar || 'frog_leaf', size * 0.75)}</div>`;
}

function medal(i) {
  return i < 3 ? `<span class="medal ${MEDAL[i]}" aria-label="${i + 1}º lugar"><b>${i + 1}</b></span>` : `<span class="pos">${i + 1}</span>`;
}

function rankRow(r, i, key, me) {
  const B = BOARDS[key];
  return `<div class="card list-item rank-item ${r.id === me ? 'me' : ''} ${i < 3 ? `top${i + 1}` : ''}" style="animation-delay:${Math.min(i, 12) * 40}ms">
    ${medal(i)}${face(r)}
    <div class="grow"><div class="t">${esc(r.displayName)}${r.id === me ? ' <small class="you">você</small>' : ''}</div><div class="s">${B.sub(r)}</div></div>
    <span class="pill-xp">${B.value(r)}</span></div>`;
}

function renderRanking(el) {
  const box = $('.rank', el);
  const board = boardOf('xp');
  $('.rank-all', el).classList.toggle('hidden', !board);
  if (!board) { box.innerHTML = '<div class="card list-item"><div class="s">Conecte-se para ver o ranking.</div></div>'; return; }
  $('.rk-note', el).textContent = `${ranking.players} jogador${ranking.players === 1 ? '' : 'es'}`;
  const me = store.view.player?.id;
  const rows = board.top.slice(0, 5).map((r, i) => rankRow(r, i, 'xp', me));
  if (board.me && board.me.rank > 5) rows.push(`<div class="rank-gap">· · ·</div>${rankRow(board.me, board.me.rank - 1, 'xp', me)}`);
  box.innerHTML = rows.join('');
}

function openRanking(start = 'xp') {
  let key = start;
  const sheet = openSheet(`
    <h3 class="rk-title">Ranking do brejo</h3>
    <p class="rk-hint hidden">Conta tudo o que cada um ganhou em trabalhos e vendas: comprar carro não tira pontos.</p>
    <div class="segmented rk-tabs">${Object.entries(BOARDS).map(([k, b]) => `<button data-k="${k}" class="${k === key ? 'on' : ''}">${b.label}</button>`).join('')}</div>
    <div class="rk-body"></div>`, { cls: 'rank-sheet' });
  const body = $('.rk-body', sheet);
  const me = store.view.player?.id;
  const draw = () => {
    $('.rk-hint', sheet).classList.toggle('hidden', key !== 'gold');
    const board = boardOf(key);
    if (!board || !board.top.length) { body.innerHTML = '<p class="muted" style="text-align:center;padding:30px 0">Ainda ninguém por aqui.</p>'; return; }
    const B = BOARDS[key];
    const [a, b, c] = board.top;
    const step = (r, i) => r ? `<div class="pod p${i + 1} ${r.id === me ? 'me' : ''}">
        <div class="pod-face">${face(r, 58)}${medal(i)}</div>
        <div class="pod-name">${esc(r.displayName)}</div><div class="pod-val">${B.value(r)}</div>
        <div class="pod-step"><b>${i + 1}º</b></div></div>`
      // lugar ainda vago no pódio: aparece apagado, para o formato 2º · 1º · 3º ficar claro
      : `<div class="pod p${i + 1} empty"><div class="pod-face"><span class="pod-vago">?</span></div>
        <div class="pod-name">vago</div><div class="pod-val">&nbsp;</div><div class="pod-step"><b>${i + 1}º</b></div></div>`;
    const rest = board.top.slice(3).map((r, i) => rankRow(r, i + 3, key, me)).join('');
    const mine = board.me && board.me.rank > board.top.length ? `<div class="rank-gap">· · ·</div>${rankRow(board.me, board.me.rank - 1, key, me)}` : '';
    body.innerHTML = `<div class="podium">${step(b, 1)}${step(a, 0)}${step(c, 2)}</div><div class="list">${rest}${mine}</div>`;
  };
  $$('.rk-tabs button', sheet).forEach((t) => t.addEventListener('click', () => {
    key = t.dataset.k;
    sfx.tap();
    $$('.rk-tabs button', sheet).forEach((x) => x.classList.toggle('on', x === t));
    draw();
  }));
  draw();
}

export function renderProfile(el) {
  const v = store.view;
  if (!v.player) return;
  // painel de demonstração: só contas da organização (marcadas no /admin)
  el.querySelectorAll('.staff-only').forEach((x) => x.classList.toggle('hidden', !v.player.staff));
  const cat = getCatalog();
  const lv = v.level;
  $('.hero-slot', el).innerHTML = `<div class="profile-hero">
      <div class="ph-info">
        <h2 class="${v.player.displayName.length > 14 ? 'long' : ''}">${esc(v.player.displayName)}</h2>
        <p>código de amigo ${esc(v.player.friendCode || '')}</p>
        <div class="ph-level"><span class="ph-lv">Nível ${lv.level}</span><span>${lv.into}/${lv.need} XP</span></div>
        <div class="progress"><i style="width:${(lv.into / lv.need) * 100}%"></i></div>
      </div>
      <button class="ph-char" data-act="look" aria-label="Trocar visual (${esc(lookName(lookOf(v.player)))})">
        <span class="ph-stage">${charHtml(lookOf(v.player), { dir: 'down', scale: 2.9 })}</span>
        <span class="ph-edit">${icons.shirt}</span>
        <span class="ph-cap">Trocar visual</span>
      </button>
    </div>`;

  const caught = v.captures.filter((c) => c.kind !== 'trade');   // as recebidas em troca não contam como captura
  const huntDays = new Set(caught.map((c) => dayOf(c.caughtAt))).size;
  $('.stats', el).innerHTML = [
    ['book', '#4cb944', `${v.discovered.size}/${cat.species.length}`, 'espécies'],
    ['pond', '#3bb5cf', caught.length, 'capturas'],
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
  renderAccount(el);
  if (ranking) renderRanking(el);
}

const DIARY_SHOWN = 5;

// Linha do diário, sempre no mesmo formato: perereca | nome + hora e lugar | raridade + XP
function diaryRow(c, withDay = true) {
  const sp = species(c.speciesId);
  const tier = getCatalog().tiers[sp.tier];
  const brejo = c.brejoId ? findBrejo(c.brejoId, store.brejos, store.view.player?.id || '') : null;
  const friend = c.friendId ? store.view.friends.find((f) => f.id === c.friendId) : null;
  const where = c.kind === 'gift' ? '🎁 presente de amigo'
    : c.kind === 'trade' ? `🔁 troca com ${esc(friend?.displayName || 'amigo')}`
    : esc(brejo?.name || 'lagoinha');
  const night = isNightAt(c.caughtAt, brejo || geo.pos);
  return `<div class="card diary-row">
    <div class="d-frog" style="--tier:${tier.color}">${frogImg(c.speciesId, 36)}</div>
    <div class="d-main"><div class="d-name">${esc(sp.name)}</div>
      <div class="d-meta"><span class="d-sky" title="${night ? 'Noite' : 'Dia'}">${night ? icons.moon : icons.sun}</span>${withDay ? `${fmtDay(dayOf(c.caughtAt))}, ` : ''}${fmtTime(c.caughtAt)} · ${where}${c.pending ? ' · ☁️ pendente' : ''}</div></div>
    <div class="d-side">${rarityBadge(c.speciesId)}<span class="pill-xp">${c.kind === 'trade' ? 'troca' : `+${store.view.perCapture.get(c.id)?.xp || 0} XP`}</span></div>
  </div>`;
}

// Diário completo em forma de calendário: um mês por vez (setas para os outros meses),
// os dias com captura ficam marcados com a quantidade, e tocar num dia mostra as capturas dele.
// Funciona igual com 1 dia ou com meses de jogo.
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const ymOf = (day) => { const d = new Date(day * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; };
const dayFromYmd = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function openDiary() {
  const byDay = new Map();
  const byMonth = new Map(); // ano*12+mês -> quantidade
  const byYear = new Map();
  for (const c of store.view.captures) {
    const d = dayOf(c.caughtAt);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(c);
  }
  for (const [d, list] of byDay) {
    const { y, m } = ymOf(d);
    byMonth.set(y * 12 + m, (byMonth.get(y * 12 + m) || 0) + list.length);
    byYear.set(y, (byYear.get(y) || 0) + list.length);
  }
  const days = [...byDay.keys()].sort((a, b) => b - a);
  const today = dayOf(store.now());
  const nowYM = (() => { const { y, m } = ymOf(today); return y * 12 + m; })();
  const firstYM = Math.min(nowYM, ...[...byMonth.keys()]);
  let sel = days[0] ?? today;
  let ym = (() => { const { y, m } = ymOf(sel); return y * 12 + m; })();
  let view = 'days'; // 'days' | 'months' | 'years'

  openSheet(`<h3>Diário de campo</h3><p class="lead">Toque no mês ou no ano para escolher outro.</p>
    <div class="cal">
      <div class="cal-head"><button class="cal-nav" data-step="-1" aria-label="Anterior">${icons.back}</button>
        <div class="cal-pick"><button class="cal-m" data-view="months"></button><button class="cal-y" data-view="years"></button></div>
        <button class="cal-nav next" data-step="1" aria-label="Próximo">${icons.back}</button></div>
      <div class="cal-body"></div>
    </div>
    <div class="day-title"></div><div class="day-sum"></div><div class="list diary-all"></div>`, { cls: 'diary-sheet' });
  const sheet = $('.diary-sheet');
  const chev = `<span class="chev">${icons.back}</span>`;

  function render() {
    const y = Math.floor(ym / 12), m = ym % 12;
    const mBtn = $('.cal-m', sheet), yBtn = $('.cal-y', sheet);
    mBtn.innerHTML = `${cap(MONTHS[m])}${chev}`;
    yBtn.innerHTML = `${y}${chev}`;
    mBtn.classList.toggle('open', view === 'months');
    yBtn.classList.toggle('open', view === 'years');
    const [prev, next] = $$('.cal-nav', sheet);
    if (view === 'days') { prev.disabled = ym <= firstYM; next.disabled = ym >= nowYM; }
    if (view === 'months') { prev.disabled = y <= Math.floor(firstYM / 12); next.disabled = y >= Math.floor(nowYM / 12); }
    if (view === 'years') { prev.disabled = true; next.disabled = true; }
    const body = $('.cal-body', sheet);

    if (view === 'months') {
      body.innerHTML = `<div class="cal-months">${MONTHS_SHORT.map((name, i) => {
        const key = y * 12 + i;
        const n = byMonth.get(key) || 0;
        const future = key > nowYM;
        return `<button class="cal-cell ${n ? 'has' : ''} ${key === ym ? 'on' : ''}" data-month="${key}" ${future ? 'disabled' : ''}><b>${name}</b><small>${n ? `${n} 🐸` : '—'}</small></button>`;
      }).join('')}</div>`;
      return;
    }
    if (view === 'years') {
      const years = [];
      for (let yy = Math.floor(nowYM / 12); yy >= Math.floor(firstYM / 12); yy--) years.push(yy);
      body.innerHTML = `<div class="cal-years">${years.map((yy) => {
        const n = byYear.get(yy) || 0;
        return `<button class="cal-cell ${n ? 'has' : ''} ${yy === y ? 'on' : ''}" data-year="${yy}"><b>${yy}</b><small>${n ? `${n} 🐸` : '—'}</small></button>`;
      }).join('')}</div>`;
      return;
    }
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const total = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let html = `<div class="cal-week">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-grid">`;
    html += '<span class="cal-blank"></span>'.repeat(first);
    for (let d = 1; d <= total; d++) {
      const day = dayFromYmd(y, m, d);
      const n = byDay.get(day)?.length || 0;
      const cls = [n ? 'has' : '', day === sel ? 'on' : '', day === today ? 'today' : ''].join(' ');
      html += n
        ? `<button class="cal-day ${cls}" data-day="${day}"><b>${d}</b><small>${n}</small></button>`
        : `<span class="cal-day ${cls}"><b>${d}</b></span>`;
    }
    body.innerHTML = `${html}</div>`;
  }

  function showDay() {
    const inMonth = sel != null && (() => { const { y, m } = ymOf(sel); return y * 12 + m === ym; })();
    if (!inMonth) {
      $('.day-title', sheet).textContent = '';
      $('.day-sum', sheet).innerHTML = '';
      $('.diary-all', sheet).innerHTML = '<div class="card list-item"><div class="s">Nenhuma perereca capturada neste mês.</div></div>';
      return;
    }
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

  // ao trocar de mês, já mostra o dia mais recente com captura daquele mês
  function goMonth(key) {
    ym = Math.max(firstYM, Math.min(nowYM, key));
    const inMonth = days.find((d) => { const { y, m } = ymOf(d); return y * 12 + m === ym; });
    sel = inMonth ?? null;
    view = 'days';
    render();
    showDay();
  }

  $('.cal', sheet).addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    sfx.tap();
    if (t.dataset.view) { view = view === t.dataset.view ? 'days' : t.dataset.view; render(); return; }
    if (t.dataset.step) {
      const dir = Number(t.dataset.step);
      if (view === 'days') goMonth(ym + dir);
      else if (view === 'months') { ym = Math.max(firstYM, Math.min(nowYM, ym + dir * 12)); render(); }
      return;
    }
    if (t.dataset.month) { goMonth(Number(t.dataset.month)); return; }
    if (t.dataset.year) { goMonth(Number(t.dataset.year) * 12 + (ym % 12)); return; }
    if (t.dataset.day) { sel = Number(t.dataset.day); render(); showDay(); }
  });
  render();
  showDay();
}

// ---------- conta: e-mail, Google e senha ----------
function renderAccount(el) {
  const p = store.view.player;
  const box = $('.account-list', el);
  if (!p || !box) return;
  const how = p.google && p.hasPassword !== false ? 'Entra com Google ou com e-mail e senha'
    : p.google ? 'Entra com o Google' : 'Entra com e-mail e senha';
  const sig = `${p.email}|${p.google}|${p.hasPassword}|${p.username}`;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = `
    <div class="card list-item">${icons.mail}<div class="grow"><div class="t">${esc(p.email || `@${p.username}`)}</div><div class="s">${how}</div></div>${p.google ? '<span class="g-badge">G</span>' : ''}</div>
    ${p.google ? '' : `<div class="card list-item" data-act="google-link">${icons.user}<div class="grow"><div class="t">Ligar ao Google</div><div class="s">Entre também com "Continuar com Google"</div></div></div>`}
    <div class="card list-item" data-act="password">${icons.key}<div class="grow"><div class="t">${p.hasPassword === false ? 'Criar uma senha' : 'Trocar a senha'}</div><div class="s">${p.hasPassword === false ? 'Para entrar também com e-mail e senha' : 'Mínimo de 8 caracteres'}</div></div></div>`;
}

async function openGoogleLink() {
  const sheet = openSheet(`
    <h3>Ligar ao Google</h3>
    <p class="lead">Depois de ligar, você entra com o botão do Google em qualquer celular, sem precisar da senha.</p>
    <div class="g-slot" style="margin:14px 0 8px"></div>
    <div class="form-error"></div>`);
  const errBox = $('.form-error', sheet);
  try {
    const config = (await db.kvGet('config')) || (await api.get('/api/config', { timeout: 30000 }));
    if (!config?.googleClientId) { errBox.textContent = 'O login com Google ainda não foi configurado no servidor.'; return; }
    await renderGoogleButton($('.g-slot', sheet), config.googleClientId, async (credential) => {
      errBox.textContent = '';
      try {
        await api.post('/api/auth/google/link', { credential }, { timeout: 60000 });
        closeSheet();
        sfx.win();
        toast('Pronto! Agora você também entra com o Google.', 'ok', 'check', 3500);
        sync.kick(0);
      } catch (e) { errBox.textContent = e.message; sfx.error(); }
    });
  } catch (e) { errBox.textContent = api.isOffline() ? 'Sem internet. Conecte-se para ligar ao Google.' : e.message; }
}

function openPassword() {
  const p = store.view.player;
  const has = p?.hasPassword !== false;
  const sheet = openSheet(`
    <h3>${has ? 'Trocar a senha' : 'Criar uma senha'}</h3>
    <p class="lead">${has ? 'Digite a senha atual e a nova.' : 'Com uma senha, você entra também com o seu e-mail, sem o botão do Google.'}</p>
    ${has ? `<label class="field">${icons.key}<input name="current" type="password" autocomplete="current-password" placeholder="Senha atual"></label>` : ''}
    <label class="field">${icons.key}<input name="password" type="password" autocomplete="new-password" placeholder="Senha nova (mínimo 8)"></label>
    <label class="field">${icons.key}<input name="again" type="password" autocomplete="new-password" placeholder="Repita a senha nova"></label>
    <div class="form-error"></div>
    <button class="btn block" data-act="save-pw">Salvar senha</button>`);
  const errBox = $('.form-error', sheet);
  $('[data-act=save-pw]', sheet).addEventListener('click', async (e) => {
    const current = $('input[name=current]', sheet)?.value || '';
    const password = $('input[name=password]', sheet).value;
    if (password.length < 8) { errBox.textContent = 'A senha nova precisa de pelo menos 8 caracteres.'; sfx.error(); return; }
    if (password !== $('input[name=again]', sheet).value) { errBox.textContent = 'As duas senhas novas não são iguais.'; sfx.error(); return; }
    e.currentTarget.disabled = true;
    try {
      await api.post('/api/auth/password', { current, password }, { timeout: 60000 });
      closeSheet();
      sfx.win();
      toast('Senha salva!', 'ok', 'check', 2500);
      sync.kick(0);
    } catch (ex) {
      errBox.textContent = api.isOffline() ? 'Sem internet. Conecte-se para salvar a senha.' : ex.message;
      sfx.error();
      e.currentTarget.disabled = false;
    }
  });
}

export function renderSyncCard(el) {
  const label = { online: store.outbox.length ? '🟢 Online' : '🟢 Online · tudo salvo', offline: '🔴 Offline', 'server-down': '🟠 Servidor fora do ar', syncing: '🔵 Sincronizando', starting: '…' }[sync.status];
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

// Sair da conta: antes tenta mandar o que falta. O que não subir NÃO é apagado: fica guardado neste
// celular e volta para a fila quando a mesma conta entrar de novo aqui.
function confirmLogout() {
  const sheet = openSheet(`
    <h3>Sair da conta?</h3>
    <p class="lead logout-lead"></p>
    <div class="row-btns"><button class="btn ghost" data-act="no">Ficar</button><button class="btn coral" data-act="yes">Sair</button></div>`);
  const lead = $('.logout-lead', sheet);
  const yes = $('[data-act=yes]', sheet);
  const paint = () => {
    const n = store.outbox.length;
    lead.innerHTML = n
      ? `☁️ <b>${n} ${n === 1 ? 'ação ainda não chegou' : 'ações ainda não chegaram'}</b> ao servidor${api.isOffline() ? ' (sem internet agora)' : ''}. Se sair, ${n === 1 ? 'ela fica guardada' : 'elas ficam guardadas'} <b>neste celular</b> e ${n === 1 ? 'sobe' : 'sobem'} sozinha${n === 1 ? '' : 's'} quando você entrar de novo com esta conta aqui. Em outro celular, ${n === 1 ? 'ela só aparece' : 'elas só aparecem'} depois disso.`
      : '✅ Tudo salvo no servidor. Você pode entrar de novo em qualquer aparelho e continuar de onde parou.';
    yes.textContent = n ? 'Sair mesmo assim' : 'Sair';
  };
  paint();
  if (store.outbox.length && !api.isOffline()) {
    lead.innerHTML = '🔄 Salvando suas últimas ações no servidor…';
    yes.disabled = true;
    sync.flush().catch(() => {}).finally(() => { yes.disabled = false; paint(); });
  }
  $('[data-act=no]', sheet).addEventListener('click', () => closeSheet());
  yes.addEventListener('click', async () => { closeSheet(true); await store.logout(); location.reload(); });
}
