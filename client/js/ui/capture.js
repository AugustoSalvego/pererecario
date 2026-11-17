// Minijogo de captura: a perereca pula entre as vitórias-régias; o jogador vira o
// celular (giroscópio) ou arrasta a tela para encontrá-la e toca rápido nela.
import { species, tier, frogImg, rarityBadge } from '../catalog.js';
import { store } from '../store.js';
import { geo } from '../geo.js';
import { sensors } from '../sensors.js';
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
  const WORLD = Math.round(W * 2.6);
  const need = t.taps;

  // vitórias-régias espalhadas pela lagoa
  const pads = [];
  const cols = 9;
  for (let i = 0; i < cols; i++) {
    pads.push({ x: (WORLD / cols) * (i + 0.5) + rand(-30, 30), y: H * rand(0.56, 0.86) });
  }
  const startView = (WORLD - W) / 2;
  let padIdx = Math.random() < 0.5 ? 1 : cols - 2; // começa fora da tela: é preciso procurar
  let frog = { x: pads[padIdx].x, y: pads[padIdx].y };

  const el = h(`<div class="capture">
    <div class="cap-world" style="width:${WORLD}px">
      <div class="cap-sky"></div>
      ${treeline(WORLD, Math.round(H * 0.18))}
      <div class="cap-water"></div>
      ${pads.map((p) => `<div class="cap-pad" style="left:${p.x}px;top:${p.y}px"></div>`).join('')}
      ${reeds(rand(0, W * 0.4), 140)}${reeds(WORLD * 0.45, 160)}${reeds(WORLD - 170, 150)}
      <div class="cap-frog"><div class="hitbox"></div>${frogImg(sp.id, Math.min(150, W * 0.36))}</div>
    </div>
    <div class="cap-hud">
      <button class="icon-btn" data-act="close" aria-label="Voltar">${icons.close}</button>
      <div class="cap-title">${spawn.kind === 'gift' ? '<small>🎁 Presente</small>' : ''}<b>${known ? esc(sp.name) : '???'}</b>${rarityBadge(sp.id)}</div>
      <div class="jar"><div class="glass"><i style="height:0%"></i></div><span class="jar-n">0/${need}</span></div>
    </div>
    <button class="cap-arrow left hidden" aria-label="Procure à esquerda">${icons.back}</button>
    <button class="cap-arrow right hidden" aria-label="Procure à direita">${icons.back}</button>
    <div class="cap-help">${icons.phone}<span>Vire o celular para procurar e <b>toque rápido</b> na perereca!</span></div>
  </div>`);
  app.appendChild(el);

  const world = $('.cap-world', el);
  const frogEl = $('.cap-frog', el);
  const jarFill = $('.jar .glass i', el);
  const jarN = $('.jar-n', el);
  const arrowL = $('.cap-arrow.left', el), arrowR = $('.cap-arrow.right', el);
  const help = $('.cap-help', el);

  let view = startView, target = startView;
  let hits = 0, misses = 0, assist = false, done = false;
  let hopTimer = null, hopAnim = null, raf = null;
  let baseHeading = null;
  const pxPerDeg = (WORLD - W) / 110;
  const clampView = (v) => Math.max(0, Math.min(WORLD - W, v));

  function place() {
    frogEl.style.transform = `translate(${frog.x}px, ${frog.y}px)`;
  }
  place();

  function hop() {
    if (done) return;
    // escolhe outra vitória-régia por perto
    const options = pads.map((p, i) => i).filter((i) => i !== padIdx && Math.abs(pads[i].x - pads[padIdx].x) < W * 0.95);
    const next = options[Math.floor(Math.random() * options.length)] ?? 0;
    const from = { ...frog }, to = pads[next];
    padIdx = next;
    const t0 = performance.now(), dur = 360;
    cancelAnimationFrame(hopAnim);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      frog.x = from.x + (to.x - from.x) * k;
      frog.y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * 90;
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

  function loop() {
    view += (target - view) * 0.18;
    world.style.transform = `translateX(${-view}px)`;
    const sx = frog.x - view;
    arrowL.classList.toggle('hidden', sx > -10 || done);
    arrowR.classList.toggle('hidden', sx < W + 10 || done);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  // giroscópio / bússola
  const onOrient = (e) => {
    const hd = e.detail.heading;
    if (baseHeading == null) baseHeading = hd - (target - startView) / pxPerDeg;
    let d = hd - baseHeading;
    d = ((d + 540) % 360) - 180;
    target = clampView(startView + d * pxPerDeg);
  };
  sensors.addEventListener('orientation', onOrient);

  // arrastar com o dedo (alternativa ao giroscópio)
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (done) return;
    if (e.target.closest('.hitbox') || e.target.closest('.cap-frog')) { e.preventDefault(); onHit(); return; }
    if (e.target.closest('button')) return;
    drag = { x: e.clientX, y: e.clientY, view: target, moved: 0 };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    target = clampView(drag.view - dx);
    if (baseHeading != null) baseHeading += 0; // giroscópio recalibra no próximo evento
  });
  el.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const wasTap = drag.moved < 10;
    drag = null;
    if (baseHeading != null) baseHeading = null; // recalibra o giroscópio a partir da nova posição
    if (wasTap && !done) onMiss(e);
  });

  arrowL.addEventListener('click', () => { target = clampView(target - W * 0.8); baseHeading = null; });
  arrowR.addEventListener('click', () => { target = clampView(target + W * 0.8); baseHeading = null; });
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
    jarFill.style.height = `${(hits / need) * 100}%`;
    jarN.textContent = `${hits}/${need}`;
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
    setTimeout(() => sfx.croak(), 250);
    vibrate([40, 60, 40]);
    let result;
    try {
      result = await store.capture(spawn, geo.pos);
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
    cancelAnimationFrame(raf);
    sensors.removeEventListener('orientation', onOrient);
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
    onClose?.(caught);
  }

  return { close };
}
