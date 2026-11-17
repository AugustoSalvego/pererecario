// Catálogo das 15 pererecas e recorte dos sprites a partir do atlas original.
let catalog = null;
const sprites = new Map();

export async function loadCatalog() {
  if (catalog) return catalog;
  catalog = await (await fetch('assets/species.json')).json();
  const img = new Image();
  img.src = catalog.atlas;
  await img.decode();
  await Promise.all(catalog.species.map(async (s) => {
    const [x, y, w, h] = s.rect;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    sprites.set(s.id, { url: URL.createObjectURL(blob), w, h });
  }));
  return catalog;
}

export const getCatalog = () => catalog;
export const species = (id) => catalog.species.find((s) => s.id === id);
export const tier = (id) => catalog.tiers[species(id)?.tier];
export const spriteUrl = (id) => sprites.get(id)?.url;

// <img> da perereca encaixada numa caixa de "size" px, mantendo a proporção.
export function frogImg(id, size, cls = '') {
  const s = sprites.get(id);
  const sp = species(id);
  if (!s) return '';
  const scale = size / Math.max(s.w, s.h);
  return `<img class="frog ${cls}" src="${s.url}" width="${Math.round(s.w * scale)}" height="${Math.round(s.h * scale)}" alt="${sp?.name || ''}" draggable="false">`;
}

export function rarityBadge(id) {
  const sp = species(id);
  const t = catalog.tiers[sp.tier];
  const stars = { common: '●', uncommon: '●●', rare: '●●●', special: '★' }[sp.tier];
  return `<span class="rarity rarity-${sp.tier}" style="--tier:${t.color}"><i>${stars}</i>${t.label}</span>`;
}
