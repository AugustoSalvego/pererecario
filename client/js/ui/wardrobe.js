// Guarda-roupa: escolha do visual (estilo, gênero e tom de pele).
// Usado na primeira vez que o jogador entra e, depois, pelo Perfil ("Trocar visual").
import { store } from '../store.js';
import { LOOK_MODELS, LOOK_GENDERS, LOOK_SKINS, normalizeLook } from '../shared/game.js';
import { charHtml, lookOf, lookName } from './sprites.js';
import { $, esc, openSheet, closeSheet, toast } from './common.js';
import { sfx } from '../audio.js';

const GENDER_NAME = { masculino: 'Masculino', feminino: 'Feminino' };
const SKIN_COLOR = { clara: '#f6cfa3', media: '#d49a6a', escura: '#8f5a37' };
const DIRS = ['down', 'right', 'up', 'left'];

// Monta o seletor dentro de "container". O boneco grande gira devagar, para ver todos os lados.
export function mountLookPicker(container, initialLook, { onChange } = {}) {
  let [model, gender, skin] = normalizeLook(initialLook).split('-');
  let dir = 0;
  const look = () => `${model}-${gender}-${skin}`;
  const hero = () => `${charHtml(look(), { dir: DIRS[dir], walking: true, scale: 4.4 })}`;

  function render() {
    container.innerHTML = `<div class="look-picker">
      <div class="lp-hero">${hero()}</div>
      <div class="lp-name">${esc(lookName(look()))}</div>
      <div class="lp-styles">${LOOK_MODELS.map((m) => `<button data-model="${m}" class="${m === model ? 'on' : ''}" aria-label="${esc(lookName(`${m}-${gender}-${skin}`))}">${charHtml(`${m}-${gender}-${skin}`, { scale: 1.7 })}</button>`).join('')}</div>
      <div class="lp-row">
        <div class="lp-gender">${LOOK_GENDERS.map((g) => `<button data-gender="${g}" class="${g === gender ? 'on' : ''}">${GENDER_NAME[g]}</button>`).join('')}</div>
        <div class="lp-skins">${LOOK_SKINS.map((s) => `<button data-skin="${s}" class="${s === skin ? 'on' : ''}" style="--c:${SKIN_COLOR[s]}" aria-label="Tom de pele ${s}"></button>`).join('')}</div>
      </div>
    </div>`;
  }
  container.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-model]');
    const gb = e.target.closest('[data-gender]');
    const sb = e.target.closest('[data-skin]');
    if (!mb && !gb && !sb) return;
    if (mb) model = mb.dataset.model;
    if (gb) gender = gb.dataset.gender;
    if (sb) skin = sb.dataset.skin;
    dir = 0;
    sfx.tap();
    render();
    onChange?.(look());
  });
  const spin = setInterval(() => {
    dir = (dir + 1) % DIRS.length;
    const h = $('.lp-hero', container);
    if (h) h.innerHTML = hero();
  }, 1600);
  render();
  return { get look() { return look(); }, destroy() { clearInterval(spin); } };
}

export function openWardrobe() {
  const before = lookOf(store.view.player);
  let picker = null;
  openSheet(`<h3>Seu visual</h3>
    <p class="lead">É assim que você aparece no mapa, inclusive para os outros jogadores.</p>
    <div class="wardrobe"></div>
    <button class="btn block" data-act="save" style="margin-top:14px">Salvar visual</button>`, { cls: 'wardrobe-sheet', onClose: () => picker?.destroy() });
  const sheet = $('.wardrobe-sheet');
  picker = mountLookPicker($('.wardrobe', sheet), before);
  $('[data-act=save]', sheet).addEventListener('click', async () => {
    const look = picker.look;
    if (look !== before) {
      await store.setLook(look);
      sfx.win();
      toast(`Visual novo: ${esc(lookName(look))}!`, 'ok', null, 2200);
    }
    closeSheet();
  });
}
