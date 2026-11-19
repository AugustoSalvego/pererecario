// Tutorial curto (primeira vez e "Como jogar") + escolha do explorador.
import { store } from '../store.js';
import { sensors } from '../sensors.js';
import { frogImg } from '../catalog.js';
import { charHtml, img, lookOf } from './sprites.js';
import { mountLookPicker } from './wardrobe.js';
import { icons } from './icons.js';
import { $, $$, h, esc } from './common.js';
import { sfx, unlockAudio } from '../audio.js';


function slides(look) {
  return [
    {
      title: 'Bem-vindo ao Pererecário!',
      text: 'As pererecas vivem nas <b>lagoinhas</b> espalhadas pelo mapa, em qualquer lugar. São 15 espécies para descobrir: complete o seu Pererecário!',
      art: `${img('pond-big.png', 280, '')}
        <div style="left:62px;top:40px">${frogImg('frog_drop', 54)}</div>
        <div style="left:150px;top:20px">${frogImg('frog_pitanga', 66)}</div>
        <div style="left:210px;top:70px">${frogImg('frog_honey', 46)}</div>`,
      artStyle: 'padding-top:40px',
    },
    {
      title: 'Ande até uma lagoinha',
      text: 'Use o GPS e caminhe por aí. A setinha no topo aponta a lagoinha mais próxima. O <b>círculo verde</b> em volta de você mostra o seu alcance: <b>10 metros</b>.',
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
      text: 'Toque na perereca no mapa para escolher qual quer pegar. Depois, <b>toque rápido</b> nela várias vezes, enquanto ela pula, até pegar!',
      art: `<div style="left:40px;top:150px">${img('lilypad.png', 150)}</div>
        <div style="left:62px;top:56px">${frogImg('frog_ember', 106)}</div>
        <div style="left:140px;top:80px" class="tut-tap"></div>
        `,
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

// first = primeira vez (termina na escolha do visual). Em "Como jogar" são só as dicas;
// o visual se troca no Perfil (guarda-roupa).
export function openTutorial({ first = false, firstTime = false, onDone } = {}) {
  document.querySelector('.tutorial')?.remove();
  const startLook = lookOf(store.view.player);
  let idx = 0, picker = null;
  const list = slides(startLook);
  const total = list.length + (first ? 1 : 0);
  const last = total - 1;
  const el = h(`<div class="tutorial">
    <button class="skip">Pular</button>
    <div class="tut-stage"></div>
    <div class="tut-dots">${Array.from({ length: total }, () => '<i></i>').join('')}</div>
    <button class="btn block next">Próximo</button>
  </div>`);
  $('#app').appendChild(el);
  const stage = $('.tut-stage', el);
  const next = $('.next', el);

  function render() {
    $$('.tut-dots i', el).forEach((d, i) => d.classList.toggle('on', i === idx));
    const isPicker = first && idx === list.length;
    $('.skip', el).classList.toggle('hidden', idx === last);
    el.querySelector('.tut-text')?.remove();
    picker?.destroy();
    picker = null;
    if (isPicker) {
      stage.innerHTML = '<div style="width:100%" class="tut-picker"></div>';
      picker = mountLookPicker($('.tut-picker', stage), startLook);
      next.textContent = 'Começar a caçar!';
      stage.insertAdjacentHTML('afterend', `<div class="tut-text"><h2>${firstTime ? `Oi, ${esc(store.view.player?.displayName || '')}!` : 'Seu visual'}</h2><p>Escolha como você aparece no mapa. Dá para trocar quando quiser em <b>Perfil → Trocar visual</b>.</p></div>`);
    } else {
      const s = list[idx];
      stage.innerHTML = `<div class="tut-art" style="${s.artStyle || ''}">${s.art}</div>`;
      stage.insertAdjacentHTML('afterend', `<div class="tut-text"><h2>${s.title}</h2><p>${s.text}</p></div>`);
      next.textContent = idx === last ? 'Entendi!' : 'Próximo';
    }
  }

  $('.skip', el).addEventListener('click', () => { idx = last; sfx.tap(); render(); });
  next.addEventListener('click', async () => {
    unlockAudio();
    sfx.tap();
    if (idx < last) { idx++; render(); return; }
    const look = picker?.look;
    picker?.destroy();
    if (look && look !== lookOf(store.view.player)) await store.setLook(look);
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
    if (dx < -60 && idx < last) { idx++; render(); }
    if (dx > 60 && idx > 0) { idx--; render(); }
  });
  render();
}
