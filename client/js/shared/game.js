// Regras do jogo compartilhadas entre o cliente (navegador) e o servidor (Node).
// Tudo aqui é determinístico: dado o mesmo brejo e a mesma janela de tempo,
// cliente e servidor chegam exatamente às mesmas pererecas, sem conversar.

export const WINDOW_MS = 15 * 60 * 1000;       // as pererecas de um brejo mudam a cada 15 min
export const GRACE_MS = 10 * 60 * 1000;        // tolerância para capturas feitas no fim da janela
export const CAPTURE_RANGE_M = 10;             // distância para capturar uma perereca
export const GPS_SLACK_M = 10;                 // folga extra quando o próprio GPS informa imprecisão
export const REVEAL_RANGE_M = 20;              // alcance do chacoalhar: revela os matinhos por perto
export const NEW_SPECIES_BONUS = 50;
export const BR_OFFSET_MS = -3 * 60 * 60 * 1000;  // horário de Brasília (sem horário de verão)

// ---------- números pseudoaleatórios determinísticos ----------
export function hash32(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- geografia ----------
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function offsetLatLng(lat, lng, northM, eastM) {
  return {
    lat: lat + (northM / R) * (180 / Math.PI),
    lng: lng + (eastM / (R * Math.cos(rad(lat)))) * (180 / Math.PI),
  };
}

// ---------- tempo ----------
export const windowOf = (t) => Math.floor(t / WINDOW_MS);
export const windowStart = (w) => w * WINDOW_MS;
export const windowEnd = (w) => (w + 1) * WINDOW_MS;
export const dayOf = (t) => Math.floor((t + BR_OFFSET_MS) / 86400000);

// ---------- catálogo ----------
export function tierOf(catalog, speciesId) {
  const sp = catalog.species.find((s) => s.id === speciesId);
  return sp ? sp.tier : null;
}

function pickTier(next, tiers, boost) {
  const entries = Object.entries(tiers).map(([k, v]) => [k, v.weight * (boost?.[k] ?? 1)]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = next() * total;
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

function pickSpecies(next, catalog, boost) {
  const tier = pickTier(next, catalog.tiers, boost);
  const pool = catalog.species.filter((s) => s.tier === tier);
  return pool[Math.floor(next() * pool.length)];
}

function sizeFor(next, sp) {
  const [a, b] = sp.sizeCm;
  return Math.round((a + (b - a) * next()) * 10) / 10;
}

// ---------- pererecas dos brejos ----------
export function spawnCount(brejo) {
  return Math.max(3, Math.min(7, Math.round(brejo.radius / 9)));
}

export function spawnsFor(brejo, win, catalog) {
  const next = rng(hash32(`${brejo.id}|${win}`));
  const n = spawnCount(brejo);
  const out = [];
  for (let i = 0; i < n; i++) {
    const sp = pickSpecies(next, catalog);
    const ang = next() * Math.PI * 2;
    // os matinhos ficam em volta da lagoinha (que ocupa o centro do brejo)
    const dist = brejo.radius * (0.3 + 0.55 * next());
    const pos = offsetLatLng(brejo.lat, brejo.lng, dist * Math.cos(ang), dist * Math.sin(ang));
    next(); // mantém a sequência pseudoaleatória estável
    const hidden = true; // toda perereca começa escondida num matinho
    out.push({
      id: `${brejo.id}:${win}:${i}`,
      kind: 'wild',
      brejoId: brejo.id,
      win,
      speciesId: sp.id,
      sizeCm: sizeFor(next, sp),
      hidden,
      lat: pos.lat,
      lng: pos.lng,
    });
  }
  return out;
}

export function parseSpawnId(id) {
  const parts = String(id).split(':');
  if (parts[0] === 'gift' && parts.length === 4) {
    return { kind: 'gift', playerId: parts[1], friendId: parts[2], day: Number(parts[3]) };
  }
  if (parts.length === 3) return { kind: 'wild', brejoId: parts[0], win: Number(parts[1]), index: Number(parts[2]) };
  return null;
}

// ---------- presente por QR code ----------
// A perereca-presente é sorteada entre as espécies que o amigo já descobriu
// (máscara de bits no QR). Uma por amigo por dia: o id do encontro carrega o dia.
export function maskFromSpecies(catalog, speciesIds) {
  const set = new Set(speciesIds);
  let m = 0;
  catalog.species.forEach((s, i) => { if (set.has(s.id)) m |= 1 << i; });
  return m >>> 0;
}

export function giftFor(playerId, friendId, day, mask, catalog) {
  const next = rng(hash32(`gift|${playerId}|${friendId}|${day}`));
  const owned = catalog.species.filter((_, i) => (mask >>> i) & 1);
  let sp;
  if (owned.length) {
    // espécies mais raras do amigo têm um pouco mais de chance
    const w = owned.map((s) => ({ common: 3, uncommon: 3, rare: 2, special: 2 }[s.tier] || 1));
    const total = w.reduce((a, b) => a + b, 0);
    let r = next() * total;
    sp = owned[owned.length - 1];
    for (let i = 0; i < owned.length; i++) { if (r < w[i]) { sp = owned[i]; break; } r -= w[i]; }
  } else {
    sp = pickSpecies(next, catalog, { rare: 2, special: 3 });
  }
  return {
    id: `gift:${playerId}:${friendId}:${day}`,
    kind: 'gift',
    speciesId: sp.id,
    sizeCm: sizeFor(next, sp),
    friendId,
    day,
  };
}

// ---------- progressão ----------
// XP nunca é armazenado: é sempre recalculado a partir das capturas,
// então não existe contador para entrar em conflito entre aparelhos.
export function xpBreakdown(captures, catalog) {
  const sorted = [...captures].sort((a, b) => a.caughtAt - b.caughtAt || (a.id < b.id ? -1 : 1));
  const seen = new Set();
  const perCapture = new Map();
  let total = 0;
  for (const c of sorted) {
    const tier = tierOf(catalog, c.speciesId);
    let xp = catalog.tiers[tier]?.xp ?? 0;
    const isNew = !seen.has(c.speciesId);
    if (isNew) { xp += NEW_SPECIES_BONUS; seen.add(c.speciesId); }
    perCapture.set(c.id, { xp, isNew });
    total += xp;
  }
  return { total, perCapture, species: seen };
}

// alcance efetivo de captura: 10 m + folga quando o GPS do aparelho está impreciso
export function captureRange(pos) {
  if (!pos || pos.simulated) return CAPTURE_RANGE_M;
  return CAPTURE_RANGE_M + Math.max(0, Math.min(GPS_SLACK_M, (pos.accuracy || 0) - CAPTURE_RANGE_M));
}

// A "partida" é a caçada do dia: id fixo por jogador e por dia (horário de Brasília).
// Dois aparelhos no mesmo dia escrevem na MESMA partida, mesmo offline.
export const dayExpeditionId = (playerId, day) => `dia:${playerId}:${day}`;
export const dayFromExpeditionId = (id) => Number(String(id).split(':')[2]);

// Boneco: modelo-gênero-tom, ex.: "froghood-feminino-media".
// (O formato antigo "modelo-tom" continua aceito e vale como "masculino".)
export const LOOK_MODELS = ['froghood', 'explorer'];
export const LOOK_GENDERS = ['masculino', 'feminino'];
export const LOOK_SKINS = ['clara', 'media', 'escura'];
export const DEFAULT_LOOK = 'froghood-masculino-clara';
export const validLook = (look) => /^(froghood|explorer)(-(masculino|feminino))?-(clara|media|escura)$/.test(String(look));
export function normalizeLook(look) {
  if (!validLook(look)) return DEFAULT_LOOK;
  const p = String(look).split('-');
  return p.length === 2 ? `${p[0]}-masculino-${p[1]}` : look;
}

export function levelFor(xp) {
  let level = 1, need = 120, rest = xp;
  while (rest >= need) { rest -= need; level++; need = Math.round(need * 1.3); }
  return { level, into: rest, need };
}
