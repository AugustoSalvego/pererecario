// Loja do Brejo: carros comprados com Brejais (B$) e garagem (escolher o carro ou ir a pé).
import { CARS, carById } from '../shared/game.js';
import { store } from '../store.js';
import { geo } from '../geo.js';
import { $, esc, openSheet, closeSheet, toast } from './common.js';
import { headHtml } from './sprites.js';
import { sfx } from '../audio.js';

const SPR = 'assets/sprites/';
const WALK = 3.5;

// carro parado ou andando (folha 2 x 4 de 32 x 28): linha 0 frente, 1 esquerda, 2 direita, 3 costas
export function carSprite(id, { dir = 'right', scale = 2.1667, moving = false } = {}) {
  const row = { down: 0, left: 1, right: 2, up: 3 }[dir] ?? 2;
  // andando, sai uma fumacinha do escapamento atrás do carro (ajuda a ver para onde ele vai)
  return `<div class="car-sprite ${moving ? 'moving' : ''}" data-dir="${dir}" style="--w:${32 * scale}px;--h:${28 * scale}px;--row:${row};background-image:url(${SPR}car-${id}.png)">${moving ? '<i class="puff p1"></i><i class="puff p2"></i>' : ''}</div>`;
}

// balãozinho com o rosto (e o nome, nos outros jogadores) em cima de quem está de carro
export function faceBubble(look, name = '') {
  return `<div class="face-bubble"><div class="fb-face">${headHtml(look, 1.5)}</div>${name ? `<span class="oname">${esc(name)}</span>` : ''}</div>`;
}

export function openShop() {
  let sheet;
  function render() {
    const v = store.view;
    const using = v.vehicle;
    sheet.querySelector('.shop-body').innerHTML = `
      <div class="shop-bal"><span>Seu saldo</span><b><span class="bcoin">B$</span> ${v.balance}</b></div>
      <p class="shop-note">Os carros andam no <b>modo Controle</b> (no GPS você sempre vai a pé, por segurança). Ganhe Brejais ajudando os NPCs do mapa.</p>
      <div class="shop-list">
        <div class="card shop-item ${!using ? 'on' : ''}">
          <div class="shop-art walk">🚶</div>
          <div class="grow"><div class="t">A pé</div><div class="s">${WALK} m/s · sempre no GPS</div>
            <div class="foot"><span></span>${!using ? '<span class="pill-on">Em uso</span>' : '<button class="btn small ghost" data-use="">Usar</button>'}</div></div>
        </div>
        ${CARS.map((c) => {
          const owned = v.cars.has(c.id);
          const missing = c.price - v.balance;
          const action = owned
            ? (using === c.id ? '<span class="pill-on">Em uso</span>' : `<button class="btn small" data-use="${c.id}">Usar</button>`)
            : (missing > 0 ? `<button class="btn small ghost" disabled><span class="bcoin">B$</span> ${c.price}</button>`
              : `<button class="btn small sun" data-buy="${c.id}">Comprar <span class="bcoin">B$</span> ${c.price}</button>`);
          return `<div class="card shop-item ${using === c.id ? 'on' : ''}">
            <div class="shop-art">${carSprite(c.id, { scale: 2, moving: true })}</div>
            <div class="grow"><div class="t">${esc(c.name)}</div>
              <div class="s">${c.speed} m/s · ${(c.speed / WALK).toFixed(1).replace('.', ',')}× mais rápido${c.perk ? ` · ${esc(c.perk)}` : ''}</div>
              <div class="foot">${!owned ? '<span></span>' : '<span class="s owned">Na garagem</span>'}${action}</div></div>
          </div>`;
        }).join('')}
      </div>`;
  }
  openSheet('<h3>Loja do Brejo</h3><div class="shop-body"></div>', { cls: 'shop-sheet' });
  sheet = $('.shop-sheet');
  render();
  const onChange = () => { if (document.body.contains(sheet)) render(); else store.removeEventListener('change', onChange); };
  store.addEventListener('change', onChange);
  sheet.addEventListener('click', async (e) => {
    const buy = e.target.closest('[data-buy]')?.dataset.buy;
    const use = e.target.closest('[data-use]');
    if (buy) {
      const car = carById(buy);
      if (store.view.balance < car.price) return;
      sfx.win();
      await store.buy(car.id);
      await store.selectVehicle(car.id);
      toast(`🚗 ${esc(car.name)} comprado! ${geo.mode === 'sim' ? 'Já está andando com ele.' : 'Ele anda no modo Controle.'}`, 'ok', null, 3200);
    } else if (use) {
      sfx.tap();
      await store.selectVehicle(use.dataset.use || null);
      if (use.dataset.use && geo.mode !== 'sim') toast('O carro anda no modo Controle. No GPS você continua a pé.', '', null, 3000);
    }
  });
  return { close: closeSheet };
}
