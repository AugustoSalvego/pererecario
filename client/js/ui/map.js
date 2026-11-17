// Mapa do jogo, desenhado à mão: o mapa real (OpenStreetMap, estilo CARTO Voyager,
// com nomes de rua) visto de cima. Elementos "no chão" (anel de alcance) ficam na
// camada do plano; lagoinhas, matinhos, pererecas e o boneco ficam na camada de objetos.
// O plano aceita inclinação em perspectiva (tilt), mas o jogo usa o mapa reto.
const TILE = 256;
const RETINA = (globalThis.devicePixelRatio || 1) > 1.4 ? '@2x' : '';
const TILE_TEMPLATE = globalThis.PERERECARIO_TILES || `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}${RETINA}.png`;
export const BASE_ZOOM = 19.2;
const TILE_URL = (z, x, y) => TILE_TEMPLATE.replace('{s}', 'abcd'[(x + y) % 4]).replace('{z}', z).replace('{x}', x).replace('{y}', y);
const rad = (d) => (d * Math.PI) / 180;

export function worldPx(lat, lng, z) {
  const s = TILE * 2 ** z;
  const sin = Math.sin(rad(Math.max(-85, Math.min(85, lat))));
  return { x: ((lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}
export function unworld(x, y, z) {
  const s = TILE * 2 ** z;
  const lng = (x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / s;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng };
}
export const metersPerPx = (lat, z) => (156543.03392 * Math.cos(rad(lat))) / 2 ** z;

export function tilesAround(lat, lng, radiusM, z) {
  const c = worldPx(lat, lng, z);
  const r = radiusM / metersPerPx(lat, z);
  const out = [];
  for (let x = Math.floor((c.x - r) / TILE); x <= Math.floor((c.x + r) / TILE); x++) {
    for (let y = Math.floor((c.y - r) / TILE); y <= Math.floor((c.y + r) / TILE); y++) out.push(TILE_URL(z, x, y));
  }
  return out;
}

export class GameMap {
  constructor(el, { onTapGround, onTapObject, onUserMove, tilt = 0 } = {}) {
    this.el = el;
    this.cb = { onTapGround, onTapObject, onUserMove };
    this.tilt = tilt;
    this.center = { lat: -23.1, lng: -50.36 };
    this.zoom = BASE_ZOOM;
    this.follow = true;
    this.tiles = new Map();
    this.features = new Map();
    this.objects = new Map();
    el.classList.add('map');
    if (!tilt) el.classList.add('flat');
    el.innerHTML = `<div class="map-sky"><div class="cloud" style="left:10%"></div><div class="cloud" style="left:60%;animation-delay:-30s;width:60px"></div></div>
      <div class="map-plane"><div class="map-ground"></div><div class="map-tiles"></div><div class="map-features"></div></div>
      <div class="map-objects"></div><div class="map-fog"></div><div class="map-attrib">© OpenStreetMap · © CARTO</div>`;
    this.plane = el.querySelector('.map-plane');
    this.tileLayer = el.querySelector('.map-tiles');
    this.featLayer = el.querySelector('.map-features');
    this.objLayer = el.querySelector('.map-objects');
    this.sinT = Math.sin(rad(tilt));
    this.cosT = Math.cos(rad(tilt));
    this.measure();
    new ResizeObserver(() => { this.measure(); this.invalidate(); }).observe(el);
    this.bindGestures();
  }

  measure() {
    this.W = this.el.clientWidth || 360;
    this.H = this.el.clientHeight || 720;
    this.O = { x: this.W / 2, y: this.H * (this.tilt ? 0.64 : 0.56) };
    this.P = Math.max(560, this.H * 1.0);
    this.plane.style.transformOrigin = `${this.O.x}px ${this.O.y}px`;
    this.plane.style.transform = this.tilt ? `perspective(${this.P}px) rotateX(${this.tilt}deg)` : 'none';
  }

  // ----- projeções -----
  planeToScreen(px, py) {
    const w = 1 - (py * this.sinT) / this.P;
    return { x: this.O.x + px / w, y: this.O.y + (py * this.cosT) / w, s: 1 / w };
  }
  screenToPlane(sx, sy) {
    const xs = sx - this.O.x, ys = sy - this.O.y;
    const py = ys / (this.cosT + (ys * this.sinT) / this.P);
    const w = 1 - (py * this.sinT) / this.P;
    return { x: xs * w, y: py };
  }
  toPlane(lat, lng) {
    const c = worldPx(this.center.lat, this.center.lng, this.zoom);
    const p = worldPx(lat, lng, this.zoom);
    return { x: p.x - c.x, y: p.y - c.y };
  }
  planeToLatLng(px, py) {
    const c = worldPx(this.center.lat, this.center.lng, this.zoom);
    return unworld(c.x + px, c.y + py, this.zoom);
  }
  screenToLatLng(sx, sy) { const p = this.screenToPlane(sx, sy); return this.planeToLatLng(p.x, p.y); }
  latLngToScreen(lat, lng) { const p = this.toPlane(lat, lng); return this.planeToScreen(p.x, p.y); }

  // ----- estado -----
  setCenter(lat, lng, animate = false) {
    cancelAnimationFrame(this.anim);
    if (!animate) { this.center = { lat, lng }; return this.invalidate(); }
    const from = { ...this.center };
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - (1 - k) ** 3;
      this.center = { lat: from.lat + (lat - from.lat) * e, lng: from.lng + (lng - from.lng) * e };
      this.render();
      if (k < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.render(); });
  }

  // feature = elemento deitado no chão (círculo em metros)
  setFeature(key, { lat, lng, radiusM, className, html = '' }) {
    let f = this.features.get(key);
    if (!f) {
      const el = document.createElement('div');
      this.featLayer.appendChild(el);
      f = { el };
      this.features.set(key, f);
    }
    Object.assign(f, { lat, lng, radiusM });
    if (f.className !== className) { f.el.className = className; f.className = className; }
    if (f.html !== html) { f.el.innerHTML = html; f.html = html; }
    this.invalidate();
    return f.el;
  }
  removeFeature(key) { const f = this.features.get(key); if (f) { f.el.remove(); this.features.delete(key); } }

  // objeto = elemento em pé (perereca, rótulo, jogador)
  setObject(key, { lat, lng, html, className = '', depthScale = true, ground = false, data }) {
    let o = this.objects.get(key);
    if (!o) {
      const el = document.createElement('div');
      el.dataset.key = key;
      this.objLayer.appendChild(el);
      o = { el };
      this.objects.set(key, o);
    }
    Object.assign(o, { lat, lng, depthScale, ground, data });
    const cls = `mobj ${className}`;
    if (o.cls !== cls) { o.el.className = cls; o.cls = cls; }
    if (html != null && o.html !== html) { o.el.innerHTML = html; o.html = html; }
    this.invalidate();
    return o.el;
  }
  removeObject(key) { const o = this.objects.get(key); if (o) { o.el.remove(); this.objects.delete(key); } }
  objectKeys() { return [...this.objects.keys()]; }

  render() {
    const { W, H, O } = this;
    const L = Math.floor(this.zoom);
    const scale = 2 ** (this.zoom - L);
    const c = worldPx(this.center.lat, this.center.lng, L);
    // região do plano visível (inversa da perspectiva nos cantos da tela)
    const corners = [[0, this.tilt ? H * 0.08 : 0], [W, this.tilt ? H * 0.08 : 0], [0, H], [W, H]].map(([x, y]) => this.screenToPlane(x, y));
    const minX = Math.min(...corners.map((p) => p.x)), maxX = Math.max(...corners.map((p) => p.x));
    const minY = Math.max(-2400, Math.min(...corners.map((p) => p.y))), maxY = Math.max(...corners.map((p) => p.y));
    const n = 2 ** L;
    const tx0 = Math.floor((c.x + minX / scale) / TILE), tx1 = Math.floor((c.x + maxX / scale) / TILE);
    const ty0 = Math.floor((c.y + minY / scale) / TILE), ty1 = Math.floor((c.y + maxY / scale) / TILE);
    const keep = new Set();
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${L}/${tx}/${ty}`;
        keep.add(key);
        let img = this.tiles.get(key);
        if (!img) {
          img = new Image();
          img.decoding = 'async';
          img.draggable = false;
          img.onload = () => img.classList.add('ok');
          img.onerror = () => img.remove();
          img.src = TILE_URL(L, ((tx % n) + n) % n, ty);
          this.tileLayer.appendChild(img);
          this.tiles.set(key, img);
        }
        const px = (tx * TILE - c.x) * scale, py = (ty * TILE - c.y) * scale;
        img.style.transform = `translate(${O.x + px}px, ${O.y + py}px) scale(${scale * 1.004})`;
      }
    }
    for (const [key, img] of this.tiles) if (!keep.has(key)) { img.remove(); this.tiles.delete(key); }

    const mpp = metersPerPx(this.center.lat, this.zoom);
    for (const f of this.features.values()) {
      const p = this.toPlane(f.lat, f.lng);
      const d = (2 * f.radiusM) / mpp;
      f.el.style.width = `${d}px`;
      f.el.style.height = `${d}px`;
      f.el.style.transform = `translate(${O.x + p.x - d / 2}px, ${O.y + p.y - d / 2}px)`;
    }
    for (const o of this.objects.values()) {
      const p = this.toPlane(o.lat, o.lng);
      const s = this.planeToScreen(p.x, p.y);
      const off = s.y < -60 || s.y > H + 120 || s.x < -120 || s.x > W + 120 || p.y < minY;
      if (off) { if (!o.off) { o.el.style.display = 'none'; o.off = true; } continue; }
      if (o.off) { o.el.style.display = ''; o.off = false; }
      const zk = Math.max(0.55, Math.min(1.35, 2 ** ((this.zoom - BASE_ZOOM) * 0.7)));
      const k = o.depthScale ? Math.max(0.45, Math.min(1.25, s.s)) * zk : 1;
      o.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${k})`;
      o.el.style.zIndex = String(o.ground ? 1 : 1000 + Math.round(s.y));
    }
  }

  // ----- gestos: arrastar, pinça, roda do mouse, toque -----
  bindGestures() {
    const pts = new Map();
    let start = null, last = null, pinch = null, moved = 0;
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = el.getBoundingClientRect();
      if (pts.size === 1) {
        start = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), target: e.target };
        last = { ...start };
        moved = 0;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        moved = 99;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = el.getBoundingClientRect();
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(pinch.zoom + Math.log2(d / pinch.d));
        return;
      }
      if (pts.size !== 1 || !last) return;
      const cur = { x: e.clientX - r.left, y: e.clientY - r.top };
      moved += Math.hypot(cur.x - last.x, cur.y - last.y);
      if (moved < 8) return;
      if (this.follow) { this.follow = false; this.cb.onUserMove?.(); }
      const p0 = this.screenToPlane(last.x, last.y), p1 = this.screenToPlane(cur.x, cur.y);
      const c = worldPx(this.center.lat, this.center.lng, this.zoom);
      this.center = unworld(c.x - (p1.x - p0.x), c.y - (p1.y - p0.y), this.zoom);
      last = cur;
      this.invalidate();
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && start && moved < 8 && performance.now() - start.t < 500) {
        const obj = start.target.closest?.('.mobj[data-key]');
        if (obj && this.objects.has(obj.dataset.key)) this.cb.onTapObject?.(obj.dataset.key, this.objects.get(obj.dataset.key).data);
        else this.cb.onTapGround?.(this.screenToLatLng(start.x, start.y));
      }
      if (pts.size === 0) { start = null; last = null; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom - e.deltaY * 0.002); }, { passive: false });
  }

  setZoom(z) {
    this.zoom = Math.max(17.4, Math.min(20.2, z));
    this.invalidate();
  }
}
