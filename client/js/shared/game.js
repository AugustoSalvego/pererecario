// Regras do jogo compartilhadas entre o cliente (navegador) e o servidor (Node).
// Tudo aqui é determinístico: dado o mesmo brejo e a mesma janela de tempo,
// cliente e servidor chegam exatamente às mesmas pererecas, sem conversar.

// =====================================================================================
//  BALANCEAMENTO: todos os números que regulam onde e quanto as pererecas aparecem.
//  Mudou algo? Reinicie o servidor (npm start) e recarregue o app duas vezes.
//  Servidor e celular leem este mesmo arquivo, então sempre concordam entre si.
//  (Raridade das espécies, XP e toques para capturar ficam em assets/species.json.)
// =====================================================================================
export const BALANCO = {
  // --- lagoinhas (aparecem sozinhas em qualquer lugar do mapa, como no Pokémon GO) ---
  lagoinhaACadaM: 130,       // distância média entre lagoinhas. Menor = mais lagoinhas.
  chanceDeLagoinha: 0.85,    // 0 a 1: chance de cada ponto da grade ganhar lagoinha. 1 = todos.
  raioDaLagoinhaM: 30,       // tamanho da área de cada lagoinha (onde as pererecas nascem).

  // --- pererecas em cada lagoinha ---
  metrosPorPerereca: 5,      // 1 perereca a cada 5 m de raio (lagoinha de 30 m = 6 pererecas)
  minPererecas: 4,           // nunca menos que isso por lagoinha
  maxPererecas: 8,           // nem mais que isso

  // --- pererecas soltas no mato, fora das lagoinhas ---
  moitaACadaM: 70,           // uma "moitinha" a cada ~70 m (outra grade, separada das lagoinhas)
  chanceDeMoita: 0.7,        // chance de cada ponto da grade ter pererecas soltas
  pererecasNaMoita: 2,       // até 2 pererecas em cada moitinha (sorteado: 1 ou 2)
  trocaACadaMin: 15,         // a cada 15 min as pererecas de cada lagoinha mudam (novas nascem)

  // --- modo de andar ---
  // No modo GPS (andando de verdade) aparecem todas as pererecas. No modo controle (joystick)
  // só aparece esta fração de cada raridade: 1 = todas, 0,35 = cerca de 1 em cada 3.
  noModoControle: { common: 1, uncommon: 0.8, rare: 0.35, special: 0.15 },

  // --- trabalhos (NPCs que pagam em Brejais, B$) ---
  trabalhoACadaM: 140,       // um NPC a cada ~140 m (sorteado de novo a cada janela de 15 min)
  chanceDeTrabalho: 0.8,     // chance de cada ponto da grade ter um NPC naquela janela
  pagamento: { casa: 35, carro: 30, horta: 25, entrega: 40 },
  veTrabalhosAteM: 200,      // NPCs aparecem no mapa a até 200 m (para dar tempo de ir até eles)
  bonusNoGps: 1.5,           // no modo GPS o trabalho paga 1,5x
  entregaDistM: [140, 260],  // a entrega é numa lagoinha a esta distância do carteiro
  entregaMin: 5,             // minutos para entregar

  // --- venda de pererecas no Meu Brejo (a "bolsa") ---
  venda: { common: 6, uncommon: 14, rare: 35, special: 90 },   // B$ por raridade
  bonusTamanho: 0.5,         // a maior perereca da espécie vale até +50%; a menor vale o preço base

  // --- distâncias do jogador ---
  capturaAteM: 10,           // pode tocar na perereca para capturar a até 10 m
  folgaDoGpsM: 10,           // folga extra quando o GPS do celular diz que está impreciso
  revelaMatinhoAteM: 20,     // tocar no matinho / chacoalhar funciona a até 20 m
  vePererecasAteM: 90,       // pererecas e matinhos só aparecem a até 90 m (mais longe somem)
  veLagoinhasAteM: 400,      // lagoinhas aparecem a até 400 m

  // --- espaço entre as coisas (para nada nascer embolado) ---
  vaoDaLagoinhaM: 17,        // nenhuma perereca nasce em cima da lagoinha
  vaoEntrePererecasM: 12,    // distância mínima entre duas pererecas
  vaoEntreBrejosM: 15,       // folga mínima entre as bordas de dois brejos cadastrados à mão
};

export const WINDOW_MS = BALANCO.trocaACadaMin * 60 * 1000;  // as pererecas de um brejo mudam a cada janela
export const GRACE_MS = 10 * 60 * 1000;        // tolerância para capturas feitas no fim da janela
export const CAPTURE_RANGE_M = BALANCO.capturaAteM;
export const GPS_SLACK_M = BALANCO.folgaDoGpsM;
export const REVEAL_RANGE_M = BALANCO.revelaMatinhoAteM;
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
  if (brejo.count) return brejo.count;   // moitinha: quantidade já sorteada
  const n = Math.round(brejo.radius / BALANCO.metrosPorPerereca);
  return Math.max(BALANCO.minPererecas, Math.min(BALANCO.maxPererecas, n));
}

export const POND_CLEAR_M = BALANCO.vaoDaLagoinhaM;
export const MIN_SPAWN_GAP_M = BALANCO.vaoEntrePererecasM;
export const MIN_BREJO_GAP_M = BALANCO.vaoEntreBrejosM;

// ---------- lagoinhas automáticas em qualquer lugar ----------
// O mundo inteiro é coberto por uma grade fixa de ~130 m (BALANCO.lagoinhaACadaM). Cada ponto
// da grade tem um sorteio próprio, com semente fixa, que decide se ali existe uma lagoinha,
// onde exatamente ela fica e qual o nome dela. A semente inclui o id do jogador: cada jogador
// tem as suas lagoinhas e as suas pererecas. Como o sorteio depende só do jogador e do ponto
// da grade, qualquer celular dele (mesmo offline) e o servidor chegam às mesmas lagoinhas.
export const AUTO = { cell: BALANCO.lagoinhaACadaM, radius: BALANCO.raioDaLagoinhaM, chance: BALANCO.chanceDeLagoinha };
export const FROG_VIEW_M = BALANCO.vePererecasAteM;
export const POND_VIEW_M = BALANCO.veLagoinhasAteM;
const POND_NAMES = ['Lagoinha Serena', 'Poça do Girino', 'Brejinho da Taboa', 'Lagoa do Musgo', 'Poça Cristalina',
  'Brejo do Ipê', 'Lagoinha da Garça', 'Brejo das Vitórias-Régias', 'Lagoinha do Sol', 'Poça do Orvalho',
  'Brejinho Escondido', 'Lagoa da Libélula', 'Poça do Sabiá', 'Brejinho do Capim', 'Lagoinha da Chuva', 'Poça da Lua'];
const M_PER_DEG = 111320;
const rowLat = (i) => (i * AUTO.cell) / M_PER_DEG;                                  // latitude da linha i
const colStep = (i) => AUTO.cell / (M_PER_DEG * Math.cos(rad(rowLat(i))));          // graus de longitude por coluna
const POND_ID = /^p(-?\d+)_(-?\d+)$/;

// a lagoinha do ponto (i, j) da grade, ou null se o sorteio disse que ali não tem
export function pondAt(i, j, seed = '') {
  const next = rng(hash32(`lagoinha|${seed}|${i}|${j}`));
  if (next() > AUTO.chance) return null;
  const north = (next() - 0.5) * AUTO.cell * 0.4;   // leve desvio, para não ficar tudo alinhado
  const east = (next() - 0.5) * AUTO.cell * 0.4;
  const name = POND_NAMES[Math.floor(next() * POND_NAMES.length)];
  const p = offsetLatLng(rowLat(i), j * colStep(i), north, east);
  return { id: `p${i}_${j}`, name, lat: p.lat, lng: p.lng, radius: AUTO.radius, auto: true };
}

export function pondById(id, seed = '') {
  const m = POND_ID.exec(String(id));
  return m ? pondAt(Number(m[1]), Number(m[2]), seed) : null;
}

// todas as lagoinhas automáticas a até radiusM de um ponto
export function pondsNear(p, radiusM, seed = '') {
  if (!p) return [];
  const out = [];
  const i0 = Math.floor((p.lat * M_PER_DEG - radiusM) / AUTO.cell) - 1;
  const i1 = Math.ceil((p.lat * M_PER_DEG + radiusM) / AUTO.cell) + 1;
  for (let i = i0; i <= i1; i++) {
    const step = colStep(i);
    const dLng = radiusM / (M_PER_DEG * Math.cos(rad(rowLat(i))));
    const j0 = Math.floor((p.lng - dLng) / step) - 1, j1 = Math.ceil((p.lng + dLng) / step) + 1;
    for (let j = j0; j <= j1; j++) {
      const b = pondAt(i, j, seed);
      if (b && distanceM(p, b) <= radiusM) out.push(b);
    }
  }
  return out;
}

// Lagoinhas do jogo perto de um ponto: os brejos cadastrados à mão têm prioridade e
// escondem a lagoinha automática que estiver em cima deles.
export function brejosNear(manual, p, radiusM, seed = '') {
  const kept = visibleBrejos(manual || []);
  if (!p) return kept;
  const mine = kept.filter((b) => distanceM(p, b) <= radiusM + b.radius);
  const auto = pondsNear(p, radiusM, seed).filter((a) => kept.every((m) => distanceM(a, m) >= a.radius + m.radius));
  return [...mine, ...auto];
}

// ---------- pererecas soltas no mato ----------
// Uma segunda grade, mais fina, espalha "moitinhas" invisíveis pelo mapa: cada uma tem 1 ou 2
// pererecas soltas na grama, longe das lagoinhas. Funcionam como um brejo pequeno, sem água:
// mesmo sorteio determinístico, mesmo id de encontro (m<i>_<j>:<janela>:<n>) e mesma validação.
const MOITA_ID = /^m(-?\d+)_(-?\d+)$/;
const mCell = () => BALANCO.moitaACadaM;
const mRowLat = (i) => (i * mCell()) / M_PER_DEG;
const mColStep = (i) => mCell() / (M_PER_DEG * Math.cos(rad(mRowLat(i))));
export const MOITA_RADIUS_M = 12;

export function moitaAt(i, j, seed = '') {
  const next = rng(hash32(`moita|${seed}|${i}|${j}`));
  if (next() > BALANCO.chanceDeMoita) return null;
  const north = (next() - 0.5) * mCell() * 0.6;
  const east = (next() - 0.5) * mCell() * 0.6;
  const count = 1 + Math.floor(next() * BALANCO.pererecasNaMoita);
  const p = offsetLatLng(mRowLat(i), j * mColStep(i), north, east);
  // não nasce em cima nem colada numa lagoinha
  if (pondsNear(p, AUTO.radius + 8, seed).length) return null;
  return { id: `m${i}_${j}`, name: 'No mato', lat: p.lat, lng: p.lng, radius: MOITA_RADIUS_M, auto: true, moita: true, count };
}

export function moitaById(id, seed = '') {
  const m = MOITA_ID.exec(String(id));
  return m ? moitaAt(Number(m[1]), Number(m[2]), seed) : null;
}

export function moitasNear(p, radiusM, seed = '') {
  if (!p) return [];
  const out = [];
  const i0 = Math.floor((p.lat * M_PER_DEG - radiusM) / mCell()) - 1;
  const i1 = Math.ceil((p.lat * M_PER_DEG + radiusM) / mCell()) + 1;
  for (let i = i0; i <= i1; i++) {
    const step = mColStep(i);
    const dLng = radiusM / (M_PER_DEG * Math.cos(rad(mRowLat(i))));
    const j0 = Math.floor((p.lng - dLng) / step) - 1, j1 = Math.ceil((p.lng + dLng) / step) + 1;
    for (let j = j0; j <= j1; j++) {
      const b = moitaAt(i, j, seed);
      if (b && distanceM(p, b) <= radiusM) out.push(b);
    }
  }
  return out;
}

// acha um brejo pelo id: cadastrado à mão, lagoinha automática ou moitinha (null se não existe ou está escondido)
export function findBrejo(id, manual, seed = '') {
  if (MOITA_ID.test(String(id))) return moitaById(id, seed);
  const kept = visibleBrejos(manual || []);
  const m = (manual || []).find((b) => b.id === id);
  if (m) return m;
  const a = pondById(id, seed);
  if (!a || !kept.every((k) => distanceM(a, k) >= a.radius + k.radius)) return null;
  return a;
}

// ---------- trabalhos e loja ----------
// NPCs de trabalho aparecem em qualquer lugar, como as lagoinhas: uma grade fixa, com um sorteio
// por jogador, por ponto da grade e por janela de 15 min. Assim o servidor recalcula o mesmo NPC
// a partir do id e confere quem trabalhou onde e quando.
export const JOB_TYPES = {
  casa: { npc: 'pedreiro', title: 'Construir casinha', done: 'Casinha pronta!', thanks: 'O pedreiro agradece!' },
  carro: { npc: 'mecanico', title: 'Consertar carro', done: 'Carro consertado!', thanks: 'A oficina agradece!' },
  horta: { npc: 'agricultor', title: 'Ajudar na horta', done: 'Horta caprichada!', thanks: 'O agricultor agradece!' },
  entrega: { npc: 'carteiro', title: 'Fazer uma entrega', done: 'Entrega feita!', thanks: 'O carteiro agradece!' },
};
const JOB_ORDER = ['casa', 'carro', 'horta', 'entrega'];
const JOB_ID = /^j(\d+)_(-?\d+)_(-?\d+)$/;
export const JOB_RANGE_M = 25;      // distância para falar com o NPC
export const JOB_VIEW_M = BALANCO.veTrabalhosAteM;
export const DELIVERY_RANGE_M = 25; // distância da lagoinha para a entrega contar

const jobCell = () => BALANCO.trabalhoACadaM;
const jobRowLat = (i) => (i * jobCell()) / M_PER_DEG;
const jobColStep = (i) => jobCell() / (M_PER_DEG * Math.cos(rad(jobRowLat(i))));

export function jobAt(win, i, j, seed = '') {
  const next = rng(hash32(`trabalho|${seed}|${win}|${i}|${j}`));
  if (next() > BALANCO.chanceDeTrabalho) return null;
  const p = offsetLatLng(jobRowLat(i), j * jobColStep(i), (next() - 0.5) * jobCell() * 0.6, (next() - 0.5) * jobCell() * 0.6);
  // não fica em cima de uma lagoinha: se cair perto de uma, desiste deste ponto
  if (pondsNear(p, AUTO.radius + 12, seed).length) return null;
  const type = JOB_ORDER[Math.floor(next() * JOB_ORDER.length)];
  const job = {
    id: `j${win}_${i}_${j}`, win, type, lat: p.lat, lng: p.lng,
    gender: next() < 0.5 ? 'masculino' : 'feminino', skin: ['clara', 'media', 'escura'][Math.floor(next() * 3)],
  };
  if (type === 'entrega') {
    const [dMin, dMax] = BALANCO.entregaDistM;
    const options = pondsNear(p, dMax, seed).filter((b) => distanceM(p, b) >= dMin);
    if (options.length) {
      const d = options[Math.floor(next() * options.length)];
      job.dest = { lat: d.lat, lng: d.lng, name: d.name, id: d.id };
    } else {
      const ang = next() * Math.PI * 2;
      const q = offsetLatLng(p.lat, p.lng, Math.cos(ang) * 200, Math.sin(ang) * 200);
      job.dest = { lat: q.lat, lng: q.lng, name: 'ponto de entrega', id: null };
    }
  }
  return job;
}

export function jobById(id, seed = '') {
  const m = JOB_ID.exec(String(id));
  return m ? jobAt(Number(m[1]), Number(m[2]), Number(m[3]), seed) : null;
}

export function jobsNear(p, radiusM, win, seed = '') {
  if (!p) return [];
  const out = [];
  const i0 = Math.floor((p.lat * M_PER_DEG - radiusM) / jobCell()) - 1;
  const i1 = Math.ceil((p.lat * M_PER_DEG + radiusM) / jobCell()) + 1;
  for (let i = i0; i <= i1; i++) {
    const step = jobColStep(i);
    const dLng = radiusM / (M_PER_DEG * Math.cos(rad(jobRowLat(i))));
    const j0 = Math.floor((p.lng - dLng) / step) - 1, j1 = Math.ceil((p.lng + dLng) / step) + 1;
    for (let j = j0; j <= j1; j++) {
      const job = jobAt(win, i, j, seed);
      if (job && distanceM(p, job) <= radiusM) out.push(job);
    }
  }
  return out;
}

export const jobPay = (type, mode) => Math.round((BALANCO.pagamento[type] || 0) * (mode === 'gps' ? BALANCO.bonusNoGps : 1));

// Carros da loja (só andam no modo controle). speed em m/s; a pé no controle são 3,5 m/s.
export const CARS = [
  { id: 'hatch', name: 'Hatch', price: 150, speed: 6 },
  { id: 'sedan', name: 'Sedã', price: 250, speed: 7 },
  { id: 'pickup', name: 'Picape', price: 400, speed: 7.5 },
  { id: 'jeep', name: 'Jipe', price: 600, speed: 8, perk: 'Abre matinhos de mais longe (30 m)' },
  { id: 'super', name: 'Superesportivo', price: 1500, speed: 12 },
];
export const carById = (id) => CARS.find((c) => c.id === id) || null;

// Saldo em Brejais: tudo o que os trabalhos pagaram menos tudo o que foi comprado.
// saldo = trabalhos + vendas de pererecas − compras (calculado, nunca guardado: reenviar não muda nada)
export const balanceOf = (jobs, purchases, sales = []) =>
  jobs.reduce((s, j) => s + (Number(j.pay) || 0), 0)
  + sales.reduce((s, v) => s + (Number(v.price) || 0), 0)
  - purchases.reduce((s, b) => s + (Number(b.price) || 0), 0);

// preço de venda de uma perereca: base da raridade + bônus pelo tamanho (dentro da faixa da espécie)
export function frogPrice(catalog, speciesId, sizeCm) {
  const sp = catalog?.species?.find((x) => x.id === speciesId);
  if (!sp) return 0;
  const base = BALANCO.venda[sp.tier] || 0;
  const [a, b] = sp.sizeCm || catalog.tiers?.[sp.tier]?.sizeCm || [0, 0];
  const f = b > a ? Math.min(1, Math.max(0, (Number(sizeCm) - a) / (b - a))) : 0;
  return Math.round(base * (1 + BALANCO.bonusTamanho * f));
}

// Brejos criados antes da trava de distância podem estar sobrepostos: o jogo mostra
// só o mais antigo de cada grupo sobreposto (a lista vem em ordem de criação).
export function visibleBrejos(brejos) {
  const kept = [];
  for (const b of brejos) {
    if (kept.every((k) => distanceM(b, k) >= b.radius + k.radius)) kept.push(b);
  }
  return kept;
}

// seed = id do jogador (cada um tem as suas pererecas)
export function spawnsFor(brejo, win, catalog, seed = '') {
  const key = seed ? `${seed}|${brejo.id}|${win}` : `${brejo.id}|${win}`;
  const next = rng(hash32(key));                 // espécie e tamanho
  const pos = rng(hash32(`${key}|pos`));         // posição
  const modo = rng(hash32(`${key}|modo`));       // quais aparecem no modo controle
  const n = spawnCount(brejo);
  // na moitinha não tem água no meio: as pererecas nascem em qualquer ponto dela
  const rMin = brejo.moita ? 0 : Math.max(POND_CLEAR_M, brejo.radius * 0.3);
  const rMax = brejo.moita ? brejo.radius : Math.max(rMin + 10, brejo.radius * 0.9);
  const placed = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const sp = pickSpecies(next, catalog);
    // tenta algumas posições e fica com a mais afastada das outras pererecas
    let best = null, bestGap = -1;
    for (let t = 0; t < 24; t++) {
      const ang = pos() * Math.PI * 2;
      const dist = rMin + (rMax - rMin) * Math.sqrt(pos());
      const c = { n: dist * Math.cos(ang), e: dist * Math.sin(ang) };
      let gap = Infinity;
      for (const q of placed) gap = Math.min(gap, Math.hypot(q.n - c.n, q.e - c.e));
      if (gap > bestGap) { best = c; bestGap = gap; }
      if (gap >= MIN_SPAWN_GAP_M) break;
    }
    placed.push(best);
    const ll = offsetLatLng(brejo.lat, brejo.lng, best.n, best.e);
    out.push({
      id: `${brejo.id}:${win}:${i}`,
      kind: 'wild',
      brejoId: brejo.id,
      win,
      speciesId: sp.id,
      sizeCm: sizeFor(next, sp),
      hidden: sp.tier !== 'common', // comuns ficam à vista; as demais se escondem num matinho
      gpsOnly: modo() >= (BALANCO.noModoControle[sp.tier] ?? 1), // só aparece andando com GPS
      lat: ll.lat,
      lng: ll.lng,
    });
  }
  return out;
}

// a perereca aparece neste modo de andar? ('gps' ou 'controle')
export const visibleInMode = (spawn, mode) => mode !== 'controle' || !spawn.gpsOnly;

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
export const LOOK_MODELS = ['froghood', 'explorer', 'dartfrog', 'raincoat', 'scientist', 'fisher', 'sporty', 'farmer', 'student',
  'lantern', 'mage', 'royal', 'ninja', 'samurai', 'knight', 'pirate', 'magical', 'pilot'];
export const LOOK_GENDERS = ['masculino', 'feminino'];
export const LOOK_SKINS = ['clara', 'media', 'escura'];
export const DEFAULT_LOOK = 'froghood-masculino-clara';
const LOOK_RE = new RegExp(`^(${LOOK_MODELS.join('|')})(-(masculino|feminino))?-(clara|media|escura)$`);
export const validLook = (look) => LOOK_RE.test(String(look));
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
