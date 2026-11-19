// Minijogo de captura: a perereca pula entre as vitórias-régias da tela e o jogador
// toca rápido nela até encher o pote (2 a 5 toques, conforme a raridade).
import { species, tier, frogImg, rarityBadge } from '../catalog.js';
import { store } from '../store.js';
import { geo } from '../geo.js';
import { skyPhase } from './daynight.js';
import { sfx, vibrate } from '../audio.js';
import { icons } from './icons.js';
import { $, h, esc, fmtCm, toast } from './common.js';

const rand = (a, b) => a + Math.random() * (b - a);

function treeline(width, height) {
  let blobs = '';
  for (let x = -40; x < width + 60; x += rand(40, 70)) {
    const r = rand(34, 60);
    blobs += `<circle cx="${x}" cy="${height - rand(10, 30)}" r="${r}" fill="${['#3f9a4c', '#4cae55', '#358a45'][Math.floor(rand(0, 3))]}"/>`;
  }
  return `<svg class="cap-trees" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:${width}px">${blobs}<rect y="${height - 14}" width="${width}" height="14" fill="#62b84f"/></svg>`;
}

function reeds(x, w) {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const rx = rand(0, w), hgt = rand(70, 140);
    s += `<path d="M${rx} 200 q${rand(-8, 8)} ${-hgt / 2} ${rand(-4, 4)} ${-hgt}" stroke="#2f7d31" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    if (Math.random() < 0.6) s += `<ellipse cx="${rx + rand(-3, 3)}" cy="${200 - hgt + 8}" rx="5" ry="14" fill="#8a5a33"/>`;
  }
  return `<svg class="cap-reeds" viewBox="0 0 ${w} 200" preserveAspectRatio="xMidYMax meet" style="left:${x}px;width:${w}px">${s}</svg>`;
}

function confetti(root) {
  const colors = ['#ffcc3d', '#4cb944', '#3bb5cf', '#ff7a5c', '#9b67e0', '#fff'];
  for (let i = 0; i < 46; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = `${rand(0, 100)}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${rand(1.6, 3.2)}s`;
    c.style.animationDelay = `${rand(0, 0.5)}s`;
    c.style.transform = `rotate(${rand(0, 360)}deg)`;
    root.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

export function openCapture(spawn, { onClose, onOpenAlbum } = {}) {
  const app = $('#app');
  const sp = species(spawn.speciesId);
  const t = tier(spawn.speciesId);
  const known = store.view.discovered.has(sp.id);
  const W = app.clientWidth, H = app.clientHeight;
  const need = t.taps + (Math.random() < 0.5 ? 0 : 1); // o jogador não sabe quantos toques faltam

  // vitórias-régias espalhadas pela lagoa, todas dentro da tela
  const pads = [[0.24, 0.6], [0.76, 0.6], [0.5, 0.72], [0.22, 0.86], [0.78, 0.86]]
    .map(([fx, fy]) => ({ x: W * fx + rand(-12, 12), y: H * fy + rand(-8, 8) }));
  let padIdx = 2;
  let frog = { x: pads[padIdx].x, y: pads[padIdx].y };
  const view = 0;

  const sky = skyPhase(new Date(), geo.pos);
  const el = h(`<div class="capture ${sky === 'day' ? '' : sky}">
    <div class="cap-world" style="width:${W}px">
      <div class="cap-sky"></div>
      ${treeline(W, Math.round(H * 0.18))}
      <div class="cap-water"></div>
      ${pads.map((p) => `<img class="px cap-lily" src="assets/sprites/lilypad.png" style="left:${p.x}px;top:${p.y}px" alt="">`).join('')}
      ${reeds(-20, 130)}${reeds(W - 120, 140)}
      <div class="cap-night"></div><div class="cap-stars"></div>
      <div class="cap-frog"><div class="hitbox"></div>${frogImg(sp.id, Math.min(140, W * 0.34))}</div>
    </div>
    <div class="cap-hud">
      <button class="icon-btn" data-act="close" aria-label="Voltar">${icons.close}</button>
      <div class="cap-title">${spawn.kind === 'gift' ? '<small>🎁 Presente</small>' : ''}<b>${known ? esc(sp.name) : '???'}</b>${rarityBadge(sp.id)}</div>
      <span style="width:48px"></span>
    </div>
    <div class="cap-help">${icons.sparkle}<span><b>Toque rápido</b> na perereca até pegar!</span></div>
  </div>`);
  app.appendChild(el);

  const frogEl = $('.cap-frog', el);
  const help = $('.cap-help', el);

  let hits = 0, misses = 0, assist = false, done = false;
  let hopTimer = null, hopAnim = null;

  function place() {
    frogEl.style.transform = `translate(${frog.x}px, ${frog.y}px)`;
  }
  place();

  function hop() {
    if (done) return;
    // pula para outra vitória-régia
    const options = pads.map((p, i) => i).filter((i) => i !== padIdx);
    const next = options[Math.floor(Math.random() * options.length)];
    const from = { ...frog }, to = pads[next];
    padIdx = next;
    const t0 = performance.now(), dur = 360;
    cancelAnimationFrame(hopAnim);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      frog.x = from.x + (to.x - from.x) * k;
      frog.y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * 80;
      place();
      if (k < 1) hopAnim = requestAnimationFrame(step);
    };
    hopAnim = requestAnimationFrame(step);
    scheduleHop();
  }
  function scheduleHop() {
    clearTimeout(hopTimer);
    hopTimer = setTimeout(hop, t.hopMs * (assist ? 1.6 : 1) * rand(0.8, 1.2));
  }
  scheduleHop();

  // tocar: na perereca conta ponto; na água, espirra
  el.addEventListener('pointerdown', (e) => {
    if (done || e.target.closest('button')) return;
    if (e.target.closest('.hitbox') || e.target.closest('.cap-frog')) { e.preventDefault(); onHit(); return; }
    onMiss(e);
  });

  $('[data-act=close]', el).addEventListener('click', () => close());

  function floatText(text, x, y) {
    const f = h(`<div class="float-text" style="left:${x}px;top:${y}px">${text}</div>`);
    el.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  function onHit() {
    if (done) return;
    hits++;
    help.classList.add('hidden');
    sfx.hit();
    vibrate(25);
    frogEl.classList.remove('flash');
    void frogEl.offsetWidth;
    frogEl.classList.add('flash');
    floatText(hits >= need ? 'Peguei!' : ['Boa!', 'Isso!', 'Quase!', 'Vai!'][hits % 4], frog.x - view, frog.y - 120);
    if (hits >= need) return success();
    hop();
  }

  function onMiss(e) {
    misses++;
    sfx.splash();
    const r = el.getBoundingClientRect();
    const s = h(`<div class="splash" style="left:${e.clientX - r.left}px;top:${e.clientY - r.top}px"></div>`);
    el.appendChild(s);
    setTimeout(() => s.remove(), 600);
    if (!assist && misses >= 5) {
      assist = true;
      help.classList.remove('hidden');
      help.innerHTML = `${icons.sparkle}<span>Ela cansou um pouco: agora pula mais devagar!</span>`;
    }
  }

  async function success() {
    done = true;
    clearTimeout(hopTimer);
    cancelAnimationFrame(hopAnim);
    frogEl.style.transition = 'transform .5s cubic-bezier(.5,-0.4,.6,1.4), opacity .5s';
    frog.x = view + W - 40; frog.y = 60;
    frogEl.style.transform = `translate(${frog.x}px, ${frog.y}px) scale(.2)`;
    frogEl.style.opacity = '0';
    sfx.win();
    vibrate([40, 60, 40]);
    let result;
    try {
      result = await store.capture(spawn, geo.pos, geo.playMode);
    } catch (err) {
      toast('Não foi possível salvar a captura no aparelho.', 'warn');
      close();
      return;
    }
    setTimeout(() => showResult(result), 450);
  }

  function showResult({ isNew, xp }) {
    const t2 = store.view.bySpecies.get(sp.id);
    const res = h(`<div class="result"><div class="rays"></div>
      <div class="result-card">
        <div class="ribbon ${isNew ? '' : 'repeat'}">${isNew ? '★ NOVA ESPÉCIE! ★' : 'Mais uma no seu brejo!'}</div>
        <div class="stage p-${sp.albumInteraction?.type || ''}">${frogImg(sp.id, 150)}</div>
        <h3>${esc(sp.name)}</h3>
        ${rarityBadge(sp.id)}
        <div class="facts"><span>📏 ${fmtCm(spawn.sizeCm)}</span><span class="xp">+${xp} XP</span><span>🐸 ${t2?.count || 1}× no brejo</span></div>
        <p>${esc(sp.description)}</p>
        <div class="btns">
          <button class="btn block" data-act="continue">Continuar caçando</button>
          ${isNew ? '<button class="btn ghost block" data-act="album">Ver no Pererecário</button>' : ''}
        </div>
      </div></div>`);
    el.appendChild(res);
    confetti(res);
    $('[data-act=continue]', res).addEventListener('click', () => close(true));
    $('[data-act=album]', res)?.addEventListener('click', () => { close(true); onOpenAlbum?.(sp.id); });
  }

  function close(caught = false) {
    done = true;
    clearTimeout(hopTimer);
    cancelAnimationFrame(hopAnim);
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
    onClose?.(caught);
  }

  return { close };
}
