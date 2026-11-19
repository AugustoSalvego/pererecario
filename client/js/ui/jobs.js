// Trabalhos: conversa com o NPC, minijogo de 3 etapas, pagamento ("Coletar") e entregas.
import { JOBS, SCENE_W, SCENE_H } from './jobdata.js';
import { CELLS } from './jobcells.js';
import { JOB_TYPES, jobPay, distanceM, BALANCO } from '../shared/game.js';
import { store } from '../store.js';
import { geo } from '../geo.js';
import { icons } from './icons.js';
import { CHAR } from './sprites.js';
import { $, $$, h, esc, openSheet, closeSheet, toast, fmtDist } from './common.js';
import { sfx, vibrate } from '../audio.js';

const SPR = 'assets/sprites/';
const ROUND_S = 20;   // segundos por etapa (acabou o tempo, a etapa recomeça sem perder nada)
const MARKER_SIZE = { porca: 8 };   // marcadores com tamanho diferente de 12 x 12
const BASKET = [84, 16];            // para onde voam os tomates colhidos

export const npcFile = (job) => `${SPR}npc-${JOB_TYPES[job.type].npc}-${job.gender}-${job.skin}.png`;

// NPC parado, de frente (primeiro quadro da folha 3 x 4 de 24 x 32)
export function npcSprite(job, scale = 2.3) {
  const w = CHAR.fw * scale, hgt = CHAR.fh * scale;
  return `<div class="npc-sprite" style="width:${w}px;height:${hgt}px;background-image:url(${npcFile(job)});background-size:${CHAR.fw * 3 * scale}px ${CHAR.fh * 4 * scale}px"></div>`;
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
    </div>
    <div class="job-reward"><span>Recompensa</span>${mode === 'gps' ? `<em>+${Math.round((BALANCO.bonusNoGps - 1) * 100)}% do GPS</em>` : ''}<b>${coin(pay)}</b></div>
    ${mode === 'gps' ? '' : `<p class="job-reward-note">No modo GPS, este trabalho paga ${coin(gpsPay)}.</p>`}
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
// Cada toque muda um pedaço da cena de vez (ver scripts/gerar_trabalhos.py):
// - reveal: o pedaço da imagem seguinte é desenhado por cima (o tijolo sobe, a tinta cobre a parede...)
// - items: o objeto tocado sai da cena (porca, parafuso, mato, tomate)
// Todos os pontos que faltam ficam marcados desde o começo, então dá para ver quanto falta.
const imgCache = new Map();
function loadImg(name) {
  if (!imgCache.has(name)) {
    imgCache.set(name, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = `${SPR}job-${name}.png`; }));
  }
  return imgCache.get(name);
}

export function runJobGame(job, { mode, pay, onClose }) {
  const def = JOBS[job.type];
  const T = JOB_TYPES[job.type];
  const app = $('#app');
  // escala em meios-pixels inteiros: a arte fica nítida e os pedaços encaixam sem emenda
  const k = Math.max(2.5, Math.floor(((Math.min(app.clientWidth - 16, 440)) * 2) / SCENE_W) / 2);
  const W = SCENE_W * k, H = SCENE_H * k;
  const el = h(`<div class="jobgame">
    <div class="jg-top">
      <button class="icon-btn" data-act="close" aria-label="Sair">${icons.close}</button>
      <div class="jg-title"><b>${esc(T.title)}</b><small class="jg-step"></small><div class="jg-dots">${def.rounds.map(() => '<i></i>').join('')}</div></div>
      <span class="chip2 gold">${coin(pay)}</span>
    </div>
    <div class="jg-timer"><i></i></div>
    <div class="jg-stage" style="width:${W}px;height:${H}px">
      <canvas class="jg-scene" width="${SCENE_W}" height="${SCENE_H}" style="width:${W}px;height:${H}px"></canvas>
      <img class="jg-fade px hidden" alt="" draggable="false" style="width:${W}px;height:${H}px">
      <div class="jg-fx"></div><div class="jg-targets"></div>
      <div class="jg-banner hidden"></div>
    </div>
    <div class="jg-count"><b></b><small></small></div>
    <div class="jg-npc">${npcSprite(job, 3)}<div class="speech"></div></div>
  </div>`);
  app.appendChild(el);
  const stage = $('.jg-stage', el), targets = $('.jg-targets', el), fx = $('.jg-fx', el);
  const canvas = $('.jg-scene', el), ctx = canvas.getContext('2d');
  const fade = $('.jg-fade', el);
  const speech = $('.jg-npc .speech', el);
  let round = 0, hits = 0, done = new Set(), t0 = 0, raf = 0, paused = false, finished = false, cells = [], toImg = null, token = 0;

  const say = (t) => { speech.innerHTML = t; };
  const at = (node, x, y, w, hgt) => { node.style.cssText += `;left:${x * k}px;top:${y * k}px;width:${w * k}px;height:${hgt * k}px`; };

  async function startRound() {
    const r = def.rounds[round];
    const my = ++token;
    cells = CELLS[r.scene] || [];
    hits = 0; done = new Set();
    targets.innerHTML = ''; fx.innerHTML = '';
    paused = true;
    $('.jg-step', el).textContent = `Etapa ${round + 1} de ${def.rounds.length} · ${r.label}`;
    $$('.jg-dots i', el).forEach((d, i) => { d.className = i < round ? 'done' : i === round ? 'now' : ''; });
    say(r.help);
    updateCount();
    const [scene, to] = await Promise.all([loadImg(r.scene), r.to ? loadImg(r.to) : null]);
    if (my !== token || finished) return;
    toImg = to;
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);
    if (scene) ctx.drawImage(scene, 0, 0);
    fade.classList.toggle('hidden', !r.fade);
    if (r.fade) { fade.src = `${SPR}job-${r.fade}.png`; fade.style.opacity = 1; }
    cells.forEach((c, i) => showMarker(i));
    t0 = performance.now();
    paused = false;
  }

  function updateCount() {
    const r = def.rounds[round];
    const need = (CELLS[r.scene] || []).length;
    $('.jg-count b', el).textContent = `${Math.min(hits, need)} de ${need} ${r.unit}`;
    $('.jg-count small', el).textContent = 'toque em cada ponto marcado';
  }

  // marcador do que falta: o sprite (tijolo pontilhado, prego, porca...) ou só um círculo (barro)
  function showMarker(i) {
    const r = def.rounds[round];
    const c = cells[i];
    const t = h(`<button class="jg-t ${r.marker ? '' : 'ring-only'}" data-i="${i}" aria-label="${esc(r.unit)}" style="animation-delay:${(i % 4) * 0.18}s">${r.marker ? `<img class="px" src="${SPR}job-alvo-${r.marker}.png" alt="" draggable="false">` : ''}</button>`);
    if (r.marker) {
      const size = MARKER_SIZE[r.marker] || 12;
      at(t, c.t[0] - size / 2, c.t[1] - size / 2, size, size);
    } else {
      const [x0, y0, x1, y1] = c.r;
      at(t, x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    }
    targets.appendChild(t);
  }

  function hit(i, markerEl) {
    if (paused || done.has(i)) return;
    const r = def.rounds[round];
    const c = cells[i];
    done.add(i);
    hits++;
    if (r.kind === 'reveal') {
      const [x0, y0, x1, y1] = c.r;
      if (toImg) ctx.drawImage(toImg, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      const flash = h('<i class="jg-flash"></i>');
      at(flash, x0, y0, x1 - x0, y1 - y0);
      fx.appendChild(flash);
      setTimeout(() => flash.remove(), 450);
      if (r.fx === 'bolha') puff('bolha', c.t);
      markerEl.classList.add('used');
    } else {
      markerEl.classList.add(`fx-${r.fx || 'pop'}`);
      if (r.fx === 'basket') {
        markerEl.style.setProperty('--dx', `${(BASKET[0] - c.t[0]) * k}px`);
        markerEl.style.setProperty('--dy', `${(BASKET[1] - c.t[1]) * k}px`);
      }
      if (r.fx === 'fly') {
        const a = Math.atan2(c.t[1] - 36, c.t[0] - 54);
        markerEl.style.setProperty('--dx', `${Math.cos(a) * 40 * k}px`);
        markerEl.style.setProperty('--dy', `${Math.sin(a) * 40 * k}px`);
      }
    }
    setTimeout(() => markerEl.remove(), 650);
    if (r.fade) fade.style.opacity = String(Math.max(0, 1 - hits / cells.length));
    const pop = h('<div class="jg-pop">+1</div>');
    pop.style.left = `${c.t[0] * k}px`;
    pop.style.top = `${c.t[1] * k - 10}px`;
    stage.appendChild(pop);
    setTimeout(() => pop.remove(), 700);
    ({ casa: sfx.hit, carro: sfx.pop, horta: sfx.rustle }[job.type] || sfx.hit)();
    vibrate(25);
    updateCount();
    if (hits < cells.length && Math.random() < 0.45) say(r.cheer[Math.floor(Math.random() * r.cheer.length)]);
    if (hits >= cells.length) roundDone();
  }

  function puff(sprite, [x, y]) {
    const d = h(`<img class="jg-puff px" src="${SPR}job-alvo-${sprite}.png" alt="">`);
    at(d, x - 6, y - 6, 12, 12);
    fx.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }

  function banner(text, ms) {
    const b = $('.jg-banner', el);
    b.textContent = text;
    b.classList.remove('hidden');
    setTimeout(() => b.classList.add('hidden'), ms);
  }

  function roundDone() {
    paused = true;
    sfx.splash();
    if (round + 1 >= def.rounds.length) { setTimeout(finish, 800); banner('Etapa concluída!', 800); return; }
    banner('Etapa concluída!', 1000);
    setTimeout(() => { round++; startRound(); }, 1050);
  }

  function timeUp() {
    paused = true;
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
    raf = requestAnimationFrame(loop);
  }

  stage.addEventListener('pointerdown', (e) => {
    const t = e.target.closest?.('.jg-t:not(.used)');
    if (!t) return;
    e.preventDefault();
    hit(Number(t.dataset.i), t);
  });

  function close() {
    finished = true;
    cancelAnimationFrame(raf);
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
