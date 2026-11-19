// Trabalhos: conversa com o NPC, minijogo de 3 etapas, pagamento ("Coletar") e entregas.
import { JOBS, SCENE_W, SCENE_H } from './jobdata.js';
import { JOB_TYPES, jobPay, distanceM, BALANCO } from '../shared/game.js';
import { store } from '../store.js';
import { geo } from '../geo.js';
import { icons } from './icons.js';
import { $, $$, h, esc, openSheet, closeSheet, toast, fmtDist } from './common.js';
import { sfx, vibrate } from '../audio.js';

const SPR = 'assets/sprites/';
const ROUND_S = 20;   // segundos por etapa (acabou o tempo, a etapa recomeça sem perder nada)
const HOLD_MS = 650;  // quanto tempo segurar no parafuso / no barro

export const npcFile = (job) => `${SPR}npc-${JOB_TYPES[job.type].npc}-${job.gender}-${job.skin}.png`;

// NPC parado, de frente (primeiro quadro da folha 3 x 4 de 24 x 32)
export function npcSprite(job, scale = 2.3) {
  const w = 24 * scale, hgt = 32 * scale;
  return `<div class="npc-sprite" style="width:${w}px;height:${hgt}px;background-image:url(${npcFile(job)});background-size:${72 * scale}px ${128 * scale}px"></div>`;
}

const coin = (n) => `<span class="bcoin">B$</span>&nbsp;${n}`;

// ---------- conversa ----------
export function openJobTalk(job, { onAccept } = {}) {
  const mode = geo.playMode;
  const pay = jobPay(job.type, mode);
  const gpsPay = jobPay(job.type, 'gps');
  const def = JOBS[job.type];
  const T = JOB_TYPES[job.type];
  const isDelivery = job.type === 'entrega';
  const destD = isDelivery ? distanceM(job, job.dest) : 0;
  const steps = isDelivery
    ? ['Pegar a caixa com o carteiro', `Levar até ${esc(job.dest.name)} (${fmtDist(destD)})`, 'Entregar em até 5 minutos']
    : def.rounds.map((r) => r.label);
  const sheet = openSheet(`
    <div class="npc-talk">
      <div class="npc-big">${npcSprite(job, 4)}</div>
      <div class="speech">${def.talk}${isDelivery ? ` É pra <b>${esc(job.dest.name)}</b>, a ${fmtDist(destD)} daqui.` : ''}</div>
    </div>
    <div class="job-chips">
      <span class="chip2"><img class="px" src="${SPR}bubble-job-${job.type}.png" alt="">${esc(T.title)}</span>
      <span class="chip2">⏱ ${isDelivery ? `${BALANCO.entregaMin} min` : '~1 min'}</span>
      <span class="chip2 gold">${coin(pay)}${mode === 'gps' ? ' · bônus do GPS' : ` · no GPS ${coin(gpsPay)}`}</span>
    </div>
    <div class="job-steps">${steps.map((t, i) => `<div><b>${i + 1}</b>${t}</div>`).join('')}</div>
    <div class="row2"><button class="btn ghost" data-act="no">Agora não</button><button class="btn" data-act="yes">${isDelivery ? 'Bora entregar!' : 'Bora ajudar!'}</button></div>`,
  { cls: 'job-sheet' });
  $('[data-act=no]', sheet).addEventListener('click', () => { sfx.tap(); closeSheet(); });
  $('[data-act=yes]', sheet).addEventListener('click', () => {
    sfx.tap();
    closeSheet(true);
    onAccept?.({ mode, pay });
  });
}

// ---------- minijogo ----------
export function runJobGame(job, { mode, pay, onClose }) {
  const def = JOBS[job.type];
  const T = JOB_TYPES[job.type];
  const app = $('#app');
  const W = Math.min(app.clientWidth - 16, 440);
  const k = W / SCENE_W;
  const H = SCENE_H * k;
  const el = h(`<div class="jobgame">
    <div class="jg-top">
      <button class="icon-btn" data-act="close" aria-label="Sair">${icons.close}</button>
      <div class="jg-title"><b>${esc(T.title)}</b><small class="jg-step"></small><div class="jg-dots">${def.rounds.map(() => '<i></i>').join('')}</div></div>
      <span class="chip2 gold">${coin(pay)}</span>
    </div>
    <div class="jg-timer"><i></i></div>
    <div class="jg-stage" style="width:${W}px;height:${H}px">
      <img class="jg-scene px" alt="" draggable="false" style="width:${W}px;height:${H}px">
      <div class="jg-deco"></div><div class="jg-targets"></div>
      <div class="jg-banner hidden"></div>
    </div>
    <div class="jg-count"><b></b><small></small></div>
    <div class="jg-npc">${npcSprite(job, 3)}<div class="speech"></div></div>
  </div>`);
  app.appendChild(el);
  const stage = $('.jg-stage', el), targets = $('.jg-targets', el), deco = $('.jg-deco', el);
  const speech = $('.jg-npc .speech', el);
  let round = 0, hits = 0, done = new Set(), active = new Map(), t0 = 0, raf = 0, spawnTimer = 0, paused = false, finished = false;

  const say = (t) => { speech.innerHTML = t; };
  const place = (node, [x, y], size = 12) => {
    const s = size * k * 1.15;
    node.style.cssText += `;left:${x * k}px;top:${y * k}px;width:${s}px;height:${s}px`;
  };

  function startRound() {
    const r = def.rounds[round];
    hits = 0; done = new Set(); active.forEach((a) => clearTimeout(a.timer)); active.clear();
    targets.innerHTML = ''; deco.innerHTML = '';
    $('.jg-scene', el).src = `${SPR}job-${r.scene}.png`;
    $('.jg-step', el).textContent = `Etapa ${round + 1} de ${def.rounds.length} · ${r.label}`;
    $$('.jg-dots i', el).forEach((d, i) => { d.className = i < round ? 'done' : i === round ? 'now' : ''; });
    say(r.help);
    updateCount();
    t0 = performance.now();
    paused = false;
    if (def.gesture === 'tap') { clearInterval(spawnTimer); spawnTimer = setInterval(spawnTap, 520); spawnTap(); }
    else if (def.gesture === 'hold') showTarget(0, Infinity);
    else r.slots.forEach((_, i) => showTarget(i, Infinity));
  }

  function updateCount() {
    const r = def.rounds[round];
    $('.jg-count b', el).textContent = `${Math.min(hits, r.need)} de ${r.need} ${r.unit}`;
    $('.jg-count small', el).textContent = def.gesture === 'tap' ? 'toque rápido antes que sumam' : def.gesture === 'hold' ? 'segure o dedo até o círculo encher' : 'arraste o dedo por cima';
  }

  function showTarget(i, lifeMs) {
    const r = def.rounds[round];
    const t = h(`<div class="jg-t ${def.gesture}" data-i="${i}"><img class="px" src="${SPR}job-alvo-${r.target}.png" alt="" draggable="false"><i class="ring"></i></div>`);
    place(t, r.slots[i]);
    targets.appendChild(t);
    const a = { el: t, timer: 0 };
    if (Number.isFinite(lifeMs)) a.timer = setTimeout(() => { t.classList.add('gone'); setTimeout(() => t.remove(), 200); active.delete(i); }, lifeMs);
    active.set(i, a);
  }

  function spawnTap() {
    if (paused) return;
    const r = def.rounds[round];
    if (active.size >= (r.max || 2)) return;
    const free = r.slots.map((_, i) => i).filter((i) => !done.has(i) && !active.has(i));
    if (!free.length) return;
    showTarget(free[Math.floor(Math.random() * free.length)], 1500);
  }

  function hit(i) {
    if (paused || done.has(i)) return;
    const r = def.rounds[round];
    const a = active.get(i);
    if (!a) return;
    clearTimeout(a.timer);
    active.delete(i);
    done.add(i);
    a.el.remove();
    if (r.hit) {
      const d = h(`<img class="jg-hit px" src="${SPR}job-alvo-${r.hit}.png" alt="">`);
      place(d, r.slots[i]);
      deco.appendChild(d);
      if (r.hit === 'bolha') setTimeout(() => d.classList.add('fade'), 500);
    }
    const pop = h('<div class="jg-pop">+1</div>');
    pop.style.left = `${r.slots[i][0] * k}px`;
    pop.style.top = `${r.slots[i][1] * k - 10}px`;
    stage.appendChild(pop);
    setTimeout(() => pop.remove(), 700);
    ({ casa: sfx.hit, carro: sfx.pop, horta: sfx.rustle }[job.type] || sfx.hit)();
    vibrate(25);
    hits++;
    updateCount();
    if (hits < r.need && Math.random() < 0.45) say(r.cheer[Math.floor(Math.random() * r.cheer.length)]);
    if (hits >= r.need) return roundDone();
    if (def.gesture === 'hold') {
      const next = r.slots.findIndex((_, j) => !done.has(j));
      if (next >= 0) setTimeout(() => { if (!paused && !active.has(next)) showTarget(next, Infinity); }, 180);
    }
  }

  function banner(text, ms) {
    const b = $('.jg-banner', el);
    b.textContent = text;
    b.classList.remove('hidden');
    setTimeout(() => b.classList.add('hidden'), ms);
  }

  function roundDone() {
    paused = true;
    clearInterval(spawnTimer);
    active.forEach((a) => { clearTimeout(a.timer); a.el.remove(); });
    active.clear();
    sfx.splash();
    if (round + 1 >= def.rounds.length) { setTimeout(finish, 700); banner('Etapa concluída!', 700); return; }
    banner('Etapa concluída!', 900);
    setTimeout(() => { round++; startRound(); }, 950);
  }

  function timeUp() {
    paused = true;
    clearInterval(spawnTimer);
    say('Quase! Bora de novo, sem pressa.');
    sfx.error();
    banner('O tempo acabou: a etapa recomeça', 1200);
    setTimeout(() => startRound(), 1300);
  }

  function loop(t) {
    if (finished) return;
    if (!paused) {
      const left = Math.max(0, 1 - (t - t0) / (ROUND_S * 1000));
      $('.jg-timer i', el).style.width = `${left * 100}%`;
      $('.jg-timer', el).classList.toggle('low', left < 0.25);
      if (left <= 0) timeUp();
    }
    // segurar: enche o círculo do alvo apertado
    if (holding && !paused) {
      const p = Math.min(1, (t - holding.t) / HOLD_MS);
      holding.el.style.setProperty('--p', p);
      if (p >= 1) { const i = holding.i; holding = null; hit(i); }
    }
    raf = requestAnimationFrame(loop);
  }

  // gestos
  let holding = null, dragging = false;
  const targetAt = (e) => e.target.closest?.('.jg-t') || document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.jg-t');
  stage.addEventListener('pointerdown', (e) => {
    const t = targetAt(e);
    if (def.gesture === 'drag') { dragging = true; stage.setPointerCapture(e.pointerId); }
    if (!t) return;
    const i = Number(t.dataset.i);
    if (def.gesture === 'tap' || def.gesture === 'drag') hit(i);
    if (def.gesture === 'hold') { holding = { i, el: t, t: performance.now() }; t.classList.add('pressing'); stage.setPointerCapture(e.pointerId); }
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (def.gesture === 'drag' && dragging) {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.jg-t');
      if (t) hit(Number(t.dataset.i));
    }
    if (def.gesture === 'hold' && holding) {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.jg-t');
      if (t !== holding.el) { holding.el.classList.remove('pressing'); holding.el.style.setProperty('--p', 0); holding = null; }
    }
  });
  const release = () => {
    dragging = false;
    if (holding) { holding.el.classList.remove('pressing'); holding.el.style.setProperty('--p', 0); holding = null; }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  function close() {
    finished = true;
    cancelAnimationFrame(raf);
    clearInterval(spawnTimer);
    el.classList.add('closing');
    setTimeout(() => el.remove(), 220);
  }
  $('[data-act=close]', el).addEventListener('click', () => { sfx.tap(); close(); toast('Trabalho deixado para depois.', '', null, 1800); onClose?.(false); });

  function finish() {
    finished = true;
    cancelAnimationFrame(raf);
    showPayment(el, job, {
      art: `<img class="px jr-scene" src="${SPR}job-${job.type}-4.png" alt="">`,
      pay, mode, onCollected: () => { close(); onClose?.(true); },
    });
  }

  startRound();
  raf = requestAnimationFrame(loop);
}

// ---------- tela final: frase de agradecimento + Coletar ----------
export function showPayment(host, job, { art, pay, mode, onCollected }) {
  const T = JOB_TYPES[job.type];
  const res = h(`<div class="job-result"><div class="rays"></div>
    <div class="result-card">
      <div class="ribbon">★ ${esc(T.done).toUpperCase()} ★</div>
      <div class="jr-art">${art}</div>
      <p class="jr-thanks">${esc(T.thanks)}</p>
      <button class="btn sun block" data-act="collect">Coletar ${coin(pay)}</button>
    </div></div>`);
  (host || $('#app')).appendChild(res);
  sfx.win();
  $('[data-act=collect]', res).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    coinBurst(btn);
    sfx.pop();
    vibrate([30, 30, 30]);
    await store.jobDone(job, job.type === 'entrega' ? (geo.pos || job.dest) : (geo.pos || job), mode, pay);
    setTimeout(() => {
      toast(`+B$ ${pay} na carteira!`, 'ok', null, 1800);
      if (!host) res.remove();
      onCollected?.();
    }, 650);
  });
  return res;
}

function coinBurst(from) {
  const r = from.getBoundingClientRect();
  for (let i = 0; i < 10; i++) {
    const c = h('<div class="coin-fly">B$</div>');
    c.style.left = `${r.left + r.width / 2}px`;
    c.style.top = `${r.top + r.height / 2}px`;
    c.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
    c.style.setProperty('--dy', `${-120 - Math.random() * 160}px`);
    c.style.animationDelay = `${i * 30}ms`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1100);
  }
}

// ---------- entrega ----------
// A entrega fica salva nas configurações do aparelho (sobrevive a fechar o app) até chegar,
// expirar ou ser cancelada. O servidor confere se a posição final está na lagoinha certa.
export function startDelivery(job, { mode, pay }) {
  const d = { job, mode, pay, deadline: store.now() + BALANCO.entregaMin * 60000 };
  store.saveSettings({ delivery: d });
  toast(`📦 Leve a caixa até ${esc(job.dest.name)}! A setinha mostra o caminho.`, 'ok', null, 3500);
  return d;
}

export function deliveryState() {
  const d = store.settings.delivery;
  if (!d) return null;
  if (store.view.jobsDone.has(d.job.id)) { store.saveSettings({ delivery: null }); return null; }
  return d;
}

export async function cancelDelivery(reason) {
  await store.saveSettings({ delivery: null });
  if (reason) toast(reason, 'warn', null, 3000);
}

export function finishDelivery(d, onDone) {
  store.saveSettings({ delivery: null });
  showPayment(null, d.job, {
    art: `<div class="jr-delivery">${npcSprite(d.job, 3.4)}<img class="px" src="${SPR}job-alvo-caixa.png" alt=""></div>`,
    pay: d.pay, mode: d.mode, onCollected: onDone,
  });
}
