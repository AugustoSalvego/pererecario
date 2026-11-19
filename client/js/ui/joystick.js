// Joystick do modo controle: arrastar o botão move o boneco (e as setas / WASD no computador).
import { geo } from '../geo.js';

export function mountJoystick(el) {
  el.innerHTML = '<div class="joy-base"><i class="joy-knob"></i></div>';
  const base = el.firstElementChild;
  const knob = base.firstElementChild;
  let active = null;

  function move(e) {
    const r = base.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // tela: y para baixo = sul. O mapa fica com o norte para cima.
    geo.setJoystick(dx / R, -dy / R);
  }
  function end() {
    active = null;
    knob.style.transform = '';
    base.classList.remove('on');
    geo.setJoystick(0, 0);
  }
  base.addEventListener('pointerdown', (e) => {
    active = e.pointerId;
    base.setPointerCapture(e.pointerId);
    base.classList.add('on');
    move(e);
    e.preventDefault();
    e.stopPropagation();
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === active) move(e); });
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);

  // teclado (para apresentar no computador)
  const keys = new Set();
  const dirOf = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  function fromKeys() {
    let x = 0, y = 0;
    for (const k of keys) { x += dirOf[k][0]; y += dirOf[k][1]; }
    geo.setJoystick(x, y);
  }
  window.addEventListener('keydown', (e) => {
    if (!dirOf[e.code] || geo.mode !== 'sim' || el.classList.contains('hidden')) return;
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    keys.add(e.code);
    fromKeys();
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (!keys.delete(e.code)) return;
    fromKeys();
  });
  window.addEventListener('blur', () => { keys.clear(); geo.setJoystick(0, 0); });
}
