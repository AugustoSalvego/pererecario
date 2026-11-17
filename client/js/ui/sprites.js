// Sprites em pixel art (gerados por scripts/gerar_sprites.py).
import { DEFAULT_LOOK, validLook } from '../shared/game.js';

// URL absoluta: url() dentro de variável CSS seria resolvida a partir da pasta do .css
export const SPR = new URL('assets/sprites/', document.baseURI).href;
export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

// Tamanho de UM quadro do boneco, em pixels do PNG (folha = 3 colunas x 4 linhas).
// Trocou a arte por outra de tamanho diferente? Ajuste só aqui. Ver docs/ARTES.md.
export const CHAR = { fw: 20, fh: 27, head: 15 };
const charVars = `--fw:${CHAR.fw};--fh:${CHAR.fh};--hh:${CHAR.head}`;

export const lookOf = (player) => (validLook(player?.look) ? player.look : DEFAULT_LOOK);

// Boneco inteiro (20x27 pixels de arte), escalado sem borrar.
export function charHtml(look, { dir = 'down', scale = 3, walking = false, cls = '' } = {}) {
  const l = validLook(look) ? look : DEFAULT_LOOK;
  return `<div class="char ${walking ? 'walking' : ''} ${cls}" data-dir="${dir}" style="--sheet:url(${SPR}char-${l}.png);--s:${(scale * 20) / CHAR.fw};--row:${DIR_ROW[dir] ?? 0};${charVars}"></div>`;
}

// Só a cabeça (para avatar, navegação e perfil).
export function headHtml(look, scale = 2) {
  const l = validLook(look) ? look : DEFAULT_LOOK;
  return `<div class="char-head" style="--sheet:url(${SPR}char-${l}.png);--s:${(scale * 20) / CHAR.fw};${charVars}"></div>`;
}

export const img = (name, width, cls = '') => `<img class="px ${cls}" src="${SPR}${name}" style="width:${width}px" alt="" draggable="false">`;

export function sparkleHtml(scale = 4) {
  return `<div class="sparkle" style="--s:${scale}"></div>`;
}

// direção a partir do deslocamento no mapa (norte = para cima)
export function dirFromBearing(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 315 || d < 45) return 'up';
  if (d < 135) return 'right';
  if (d < 225) return 'down';
  return 'left';
}

export function bearing(a, b) {
  const toR = (x) => (x * Math.PI) / 180;
  const y = Math.sin(toR(b.lng - a.lng)) * Math.cos(toR(b.lat));
  const x = Math.cos(toR(a.lat)) * Math.sin(toR(b.lat)) - Math.sin(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.cos(toR(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
