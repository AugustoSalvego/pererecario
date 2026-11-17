// Tutorial curto (primeira vez e "Como jogar") + escolha do explorador.
import { store } from '../store.js';
import { sensors } from '../sensors.js';
import { frogImg } from '../catalog.js';
import { LOOK_MODELS, LOOK_GENDERS, LOOK_SKINS } from '../shared/game.js';
import { charHtml, img, lookOf } from './sprites.js';
import { icons } from './icons.js';
import { $, $$, h, esc } from './common.js';
import { sfx, unlockAudio } from '../audio.js';

const MODEL_NAME = { froghood: 'Capuz de sapinho', explorer: 'Explorador' };
const GENDER_NAME = { masculino: 'Masculino', feminino: 'Feminino' };

function slides(look) {
  return [
    {
      title: 'Bem-vindo ao Pererecário!',
      text: 'As pererecas vivem nas <b>lagoinhas do campus</b>. São 15 espécies para descobrir: complete o seu Pererecário!',
      art: `${img('pond-big.png', 280, '')}
        <div style="left:62px;top:40px">${frogImg('frog_drop', 54)}</div>
        <div style="left:150px;top:20px">${frogImg('frog_pitanga', 66)}</div>
        <div style="left:210px;top:70px">${frogImg('frog_honey', 46)}</div>`,
      artStyle: 'padding-top:40px',
    },
    {
      title: 'Ande até uma lagoinha',
      text: 'Use o GPS e caminhe pelo campus. O <b>círculo verde</b> em volta de você mostra o seu alcance: <b>10 metros</b>.',
      art: `<div style="left:150px;top:60px">${img('pond-small.png', 140)}</div>
        <div style="left:20px;top:120px;width:120px;height:44px;border-radius:50%;border:3px solid rgba(70,190,60,.95);box-shadow:0 0 12px rgba(110,230,80,.85);background:rgba(120,230,90,.16)"></div>
        <div style="left:54px;top:68px">${charHtml(look, { dir: 'right', walking: true, scale: 3 })}</div>`,
    },
    {
      title: 'Matinho com "?"',
      text: 'As comuns ficam à vista, pulando no mapa. As mais raras se escondem num <b>matinho</b> que mostra um <b>"?"</b>: chegou perto? <b>Toque no matinho</b> ou <b>chacoalhe o celular</b> para ela sair!',
      art: `<div style="left:30px;top:70px">${img('bush-peek.png', 150)}</div>
        <div style="left:200px;top:60px" class="tut-phone"></div>`,
    },
    {
      title: 'Toque rápido!',
      text: 'Toque na perereca no mapa para escolher qual quer pegar. Depois, <b>toque rápido</b> nela várias vezes, enquanto ela pula, até encher o pote.',
      art: `<div style="left:40px;top:150px">${img('lilypad.png', 150)}</div>
        <div style="left:62px;top:56px">${frogImg('frog_ember', 106)}</div>
        <div style="left:140px;top:80px" class="tut-tap"></div>
        <div style="left:210px;top:90px;font-size:44px">🫙</div>`,
    },
    {
      title: 'Funciona sem internet',
      text: 'Caiu a conexão? Continue jogando: tudo fica salvo no celular e vai para o servidor depois. E encontrando um amigo, escaneie o <b>QR</b> dele para ganhar uma <b>perereca-presente</b>!',
      art: `<div style="left:20px;top:70px;width:110px;height:110px;border-radius:28px;background:#4a4f57;color:#fff;display:grid;place-items:center"><div style="width:62px;height:62px">${icons.cloudOff}</div></div>
        <div style="left:150px;top:62px;width:126px;height:126px;border-radius:28px;background:#fff;display:grid;place-items:center;box-shadow:0 4px 0 #e3d6ff"><div style="width:76px;height:76px;color:#7448c6">${icons.qr}</div></div>
        <div style="left:236px;top:40px">${img('icon-heart.png', 52)}</div>`,
    },
  ];
}

export function openTutorial({ first = false, firstTime = false, onDone } = {}) {
  document.querySelector('.tutorial')?.remove();
  const [m0, g0, s0] = lookOf(store.view.player).split('-');
  let model = m0, gender = g0, skin = s0, idx = 0;
  const cur = () => `${model}-${gender}-${skin}`;
  const list = slides(cur());
  const total = list.length + 1;
  const el = h(`<div class="tutorial">
    <button class="skip">Pular</button>
    <div class="tut-stage"></div>
    <div class="tut-dots">${Array.from({ length: total }, () => '<i></i>').join('')}</div>
    <button class="btn block next">Próximo</button>
  </div>`);
  $('#app').appendChild(el);
  const stage = $('.tut-stage', el);
  const next = $('.next', el);

  function picker() {
    return `<div style="display:flex;flex-direction:column;align-items:center;width:100%">
      <div style="height:150px;display:grid;place-items:center">${charHtml(cur(), { dir: 'down', walking: true, scale: 5 })}</div>
      <div class="picker-models">${LOOK_MODELS.map((m) => `<button data-model="${m}" class="${m === model ? 'on' : ''}">${MODEL_NAME[m]}</button>`).join('')}</div>
      <div class="picker-models">${LOOK_GENDERS.map((g) => `<button data-gender="${g}" class="${g === gender ? 'on' : ''}">${GENDER_NAME[g]}</button>`).join('')}</div>
      <div class="picker">${LOOK_SKINS.map((s) => `<button data-skin="${s}" class="${s === skin ? 'on' : ''}" aria-label="Tom de pele ${s}">${charHtml(`${model}-${gender}-${s}`, { scale: 2.4 })}</button>`).join('')}</div>
    </div>`;
  }

  function render() {
    $$('.tut-dots i', el).forEach((d, i) => d.classList.toggle('on', i === idx));
    const isPicker = idx === list.length;
    $('.skip', el).classList.toggle('hidden', isPicker);
    if (isPicker) {
      stage.innerHTML = `<div style="width:100%">${picker()}</div>`;
      next.textContent = first ? 'Começar a caçar!' : 'Pronto';
      el.querySelector('.tut-text')?.remove();
      if (!el.querySelector('.tut-text')) stage.insertAdjacentHTML('afterend', `<div class="tut-text"><h2>${first && firstTime ? `Oi, ${esc(store.view.player?.displayName || '')}!` : 'Escolha seu explorador'}</h2><p>${first && firstTime ? 'Escolha seu explorador. Dá para trocar depois em Perfil → Como jogar.' : 'Ele aparece no mapa e anda com você.'}</p></div>`);
    } else {
      const s = list[idx];
      stage.innerHTML = `<div class="tut-art" style="${s.artStyle || ''}">${s.art}</div>`;
      el.querySelector('.tut-text')?.remove();
      stage.insertAdjacentHTML('afterend', `<div class="tut-text"><h2>${s.title}</h2><p>${s.text}</p></div>`);
      next.textContent = 'Próximo';
    }
  }

  stage.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-model]');
    const sb = e.target.closest('[data-skin]');
    const gb = e.target.closest('[data-gender]');
    if (gb) { gender = gb.dataset.gender; sfx.tap(); render(); }
    if (mb) { model = mb.dataset.model; sfx.tap(); render(); }
    if (sb) { skin = sb.dataset.skin; sfx.tap(); render(); }
  });
  $('.skip', el).addEventListener('click', () => { idx = list.length; sfx.tap(); render(); });
  next.addEventListener('click', async () => {
    unlockAudio();
    sfx.tap();
    if (idx < list.length) { idx++; render(); return; }
    const look = cur();
    if (look !== lookOf(store.view.player)) await store.setLook(look);
    await store.saveSettings({ tutorialDone: true, onboarded: true });
    if (first) await sensors.request();
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
    onDone?.();
  });
  // deslizar para os lados
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (dx < -60 && idx < list.length) { idx++; render(); }
    if (dx > 60 && idx > 0) { idx--; render(); }
  });
  render();
}
