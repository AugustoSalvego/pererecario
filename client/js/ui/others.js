// Outros jogadores no mapa.
// - Movimento suave: cada boneco desliza até a última posição recebida (sem pulos).
// - Sem amontoar: quando vários jogadores estão no mesmo lugar (ex.: todos numa sala, com o
//   GPS dizendo quase o mesmo ponto), os bonecos são afastados até ficarem a uma distância
//   mínima na tela. O afastamento é calculado sempre do mesmo jeito (ângulo fixo por jogador),
//   então o desenho fica estável e ninguém fica "tremendo" no mapa.
import { presence } from '../presence.js';
import { geo } from '../geo.js';
import { metersPerPx } from './map.js';
import { charHtml, bearing, dirFromBearing } from './sprites.js';
import { carSprite, faceBubble } from './shop.js';
import { hash32, distanceM, offsetLatLng } from '../shared/game.js';
import { esc } from './common.js';

const MIN_GAP_PX = 56;   // distância mínima entre dois bonecos na tela (na horizontal)
const Y_SQUASH = 0.6;    // na vertical o espaço é maior (56 / 0,6 ≈ 93 px), para o nome não cobrir a cabeça de ninguém
const FOLLOW = 0.14;     // quanto o boneco anda em direção ao alvo a cada passo (suavização)
const M_PER_DEG = 111320;

export function mountOthers(map, { onTap } = {}) {
  const shown = new Map(); // id -> { lat, lng, dir, movingUntil, name, look, sig }

  function step() {
    const list = presence.list();
    const ids = new Set(list.map((o) => o.id));
    for (const id of [...shown.keys()]) {
      if (!ids.has(id)) { shown.delete(id); map.removeObject(`other:${id}`); }
    }
    if (!list.length) return;
    const t = Date.now();

    // 1) suavização: cada boneco se aproxima aos poucos da posição recebida
    for (const o of list) {
      let s = shown.get(o.id);
      if (!s) { s = { lat: o.lat, lng: o.lng, dir: 'down', movingUntil: 0 }; shown.set(o.id, s); }
      const d = distanceM(s, o);
      if (d > 150) { s.lat = o.lat; s.lng = o.lng; }
      else if (d > 0.4) {
        s.dir = dirFromBearing(bearing(s, o));
        s.movingUntil = t + 350;
        s.lat += (o.lat - s.lat) * FOLLOW;
        s.lng += (o.lng - s.lng) * FOLLOW;
      }
      s.name = o.name;
      s.look = o.look;
      s.mode = o.mode;
      s.vehicle = o.vehicle || null;
    }

    // 2) afastamento: em metros locais, com o próprio jogador fixo no lugar
    const me = geo.pos;
    const ref = me || list[0];
    const cosLat = Math.cos((ref.lat * Math.PI) / 180);
    const gap = MIN_GAP_PX * metersPerPx(ref.lat, map.zoom);
    const pts = [...shown.entries()].map(([id, s]) => ({
      id, x: (s.lng - ref.lng) * M_PER_DEG * cosLat, y: (s.lat - ref.lat) * M_PER_DEG * Y_SQUASH, fixed: false,
    }));
    if (me) pts.push({ id: '', x: 0, y: 0, fixed: true });
    pts.sort((a, b) => (a.id < b.id ? -1 : 1)); // ordem fixa = resultado estável
    for (let it = 0; it < 10; it++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist >= gap) continue;
          if (dist < 1e-6) {
            // no mesmo ponto: cada jogador tem um ângulo fixo de saída
            const ang = ((hash32(a.id + b.id) % 360) * Math.PI) / 180;
            dx = Math.cos(ang); dy = Math.sin(ang); dist = 1;
          } else { dx /= dist; dy /= dist; }
          const push = gap - Math.max(dist, 0);
          if (a.fixed && b.fixed) continue;
          if (a.fixed) { b.x += dx * push; b.y += dy * push; }
          else if (b.fixed) { a.x -= dx * push; a.y -= dy * push; }
          else { a.x -= dx * push / 2; a.y -= dy * push / 2; b.x += dx * push / 2; b.y += dy * push / 2; }
          moved = true;
        }
      }
      if (!moved) break;
    }

    // 3) desenha
    for (const p of pts) {
      if (p.fixed) continue;
      const s = shown.get(p.id);
      const ll = offsetLatLng(ref.lat, ref.lng, p.y / Y_SQUASH, p.x);
      const walking = s.movingUntil > t;
      const sig = `${s.look}|${s.dir}|${walking}|${s.name}|${s.vehicle}`;
      const key = `other:${p.id}`;
      const o = map.objects.get(key);
      map.setObject(key, {
        lat: ll.lat, lng: ll.lng, className: 'mother', depthScale: false, data: { id: p.id, name: s.name, mode: s.mode },
        html: (!o || o.sig !== sig)
          ? (s.vehicle
            ? `<div class="cwrap other">${faceBubble(s.look, s.name)}${carSprite(s.vehicle, { dir: s.dir, moving: walking })}</div>`
            : `<div class="owrap"><div class="pshadow"></div>${charHtml(s.look, { dir: s.dir, walking, scale: 2.3 })}<span class="oname">${esc(s.name)}</span></div>`)
          : null,
      });
      map.objects.get(key).sig = sig;
    }
  }

  setInterval(step, 100);
  presence.addEventListener('change', step);
  return { count: () => shown.size, onTap };
}
