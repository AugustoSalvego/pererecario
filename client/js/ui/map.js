// Mapa do jogo, desenhado à mão: o mapa real (OpenStreetMap, ou CARTO Voyager com
// chave) visto de cima. Elementos "no chão" (anel de alcance) ficam na
// camada do plano; lagoinhas, matinhos, pererecas e o boneco ficam na camada de objetos.
// O plano aceita inclinação em perspectiva (tilt), mas o jogo usa o mapa reto.
const TILE = 256;
const RETINA = (globalThis.devicePixelRatio || 1) > 1.4 ? '@2x' : '';
// Sem chave: tiles padrão do OpenStreetMap (até zoom 19, sem baixar em lote).
// Com CARTO_KEY no servidor: estilo Voyager do CARTO (chave gratuita em carto.com/basemaps/apikey).
let provider = { kind: 'osm', template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: '© colaboradores do OpenStreetMap', prefetch: false };
export function setTileProvider({ cartoKey } = {}) {
  if (globalThis.PERERECARIO_TILES) {
    provider = { kind: 'test', template: globalThis.PERERECARIO_TILES, maxZoom: 20, attribution: '© OpenStreetMap', prefetch: false };
  } else if (cartoKey) {
    provider = { kind: 'carto', template: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}${RETINA}.png?key=${encodeURIComponent(cartoKey)}`, maxZoom: 20, attribution: '© OpenStreetMap · © CARTO', prefetch: true };
  }
  return provider;
}
setTileProvider();
export const tileProvider = () => provider;
const TILE_URL = (z, x, y) => provider.template.replace('{s}', 'abcd'[(x + y) % 4]).replace('{z}', z).replace('{x}', x).replace('{y}', y);
// zoom inicial: perto o bastante para o anel de alcance (10 m) ficar bem maior que o boneco
export const BASE_ZOOM = 19.55;
const MIN_ZOOM = 17.4, MAX_ZOOM = 20.8;
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
  constructor(el, { onTapGround, onTapObject, onUserMove, onRender, tilt = 0 } = {}) {
    this.el = el;
    this.cb = { onTapGround, onTapObject, onUserMove, onRender };
    this.tilt = tilt;
    this.center = { lat: -23.1, lng: -50.36 };
    this.zoom = BASE_ZOOM;
    this.follow = true;
    this.tiles = new Map();
    this.features = new Map();
    this.objects = new Map();
    el.classList.add('map', `tiles-${provider.kind}`);
    if (!tilt) el.classList.add('flat');
    el.innerHTML = `<div class="map-sky"><div class="cloud" style="left:10%"></div><div class="cloud" style="left:60%;animation-delay:-30s;width:60px"></div></div>
      <div class="map-plane"><div class="map-ground"></div><div class="map-tiles"></div><div class="map-features"></div></div>
      <div class="map-objects"></div><div class="map-night"><i class="night-light"></i></div>
      <div class="fireflies">${Array.from({ length: 8 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--y:${(i * 61 + 13) % 100}%;--t:${6 + (i % 5) * 1.7}s;--dl:${-i * 1.3}s"></i>`).join('')}</div>
      <div class="map-fog"></div><div class="map-attrib">${provider.attribution}</div>`;
    this.plane = el.querySelector('.map-plane');
    this.tileLayer = el.querySelector('.map-tiles');
    this.featLayer = el.querySelector('.map-features');
    this.objLayer = el.querySelector('.map-objects');
    this.light = el.querySelector('.night-light');
    this.tileOrigin = null;
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
    const moved = f.lat !== lat || f.lng !== lng || f.radiusM !== radiusM;
    Object.assign(f, { lat, lng, radiusM });
    if (f.className !== className) { f.el.className = className; f.className = className; }
    if (f.html !== html) { f.el.innerHTML = html; f.html = html; }
    if (moved) this.invalidate();
    return f.el;
  }
  removeFeature(key) { const f = this.features.get(key); if (f) { f.el.remove(); this.features.delete(key); } }

  // objeto = elemento em pé (perereca, rótulo, jogador)
  setObject(key, { lat, lng, html, className = '', depthScale = true, ground = false, top = false, data }) {
    let o = this.objects.get(key);
    if (!o) {
      const el = document.createElement('div');
      el.dataset.key = key;
      this.objLayer.appendChild(el);
      o = { el };
      this.objects.set(key, o);
    }
    // só pede um redesenho do mapa se o objeto andou (o laço dos outros jogadores chama isto
    // 10 vezes por segundo; redesenhar sem mudança nenhuma esquentava o celular)
    const moved = o.lat !== lat || o.lng !== lng || o.depthScale !== depthScale || o.ground !== ground || o.top !== top;
    Object.assign(o, { lat, lng, depthScale, ground, top, data });
    const cls = `mobj ${className}`;
    if (o.cls !== cls) { o.el.className = cls; o.cls = cls; }
    if (html != null && o.html !== html) { o.el.innerHTML = html; o.html = html; }
    if (moved) { o.tf = null; this.invalidate(); }
    return o.el;
  }
  removeObject(key) { const o = this.objects.get(key); if (o) { o.el.remove(); this.objects.delete(key); } }
  objectKeys() { return [...this.objects.keys()]; }

  // Luz em volta do jogador à noite: um elemento grande, só deslocado (o celular move sem redesenhar).
  setLight(x, y) {
    const cx = Math.round(Math.max(-this.W * 0.5, Math.min(this.W * 1.5, x)));
    const cy = Math.round(Math.max(-this.H * 0.5, Math.min(this.H * 1.5, y)));
    const tf = `translate(${cx - 2000}px, ${cy - 2000}px)`;
    if (this.light && this.light.__tf !== tf) { this.light.style.transform = tf; this.light.__tf = tf; }
  }

  render() {
    const { W, H, O } = this;
    const L = Math.min(Math.floor(this.zoom), provider.maxZoom); // acima do máximo, amplia o último nível
    const scale = 2 ** (this.zoom - L);
    const c = worldPx(this.center.lat, this.center.lng, L);
    // Os tiles ficam parados dentro de um contêiner, a partir de uma origem fixa; andar e dar zoom
    // só move/escala o contêiner inteiro (uma transformação só, feita pela placa de vídeo, sem
    // redesenhar os tiles). A origem muda quando troca o nível de zoom ou o jogador vai muito longe.
    const org = this.tileOrigin;
    if (!org || org.L !== L || Math.abs(c.x - org.x) > 60000 || Math.abs(c.y - org.y) > 60000) {
      this.tileOrigin = { L, x: Math.floor(c.x / TILE) * TILE, y: Math.floor(c.y / TILE) * TILE };
      for (const img of this.tiles.values()) img.__tf = null;
    }
    const ox = this.tileOrigin.x, oy = this.tileOrigin.y;
    const ltf = `translate(${O.x + (ox - c.x) * scale}px, ${O.y + (oy - c.y) * scale}px) scale(${scale})`;
    if (this.tileLayer.__tf !== ltf) { this.tileLayer.style.transform = ltf; this.tileLayer.__tf = ltf; }
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
        const tf = `translate(${tx * TILE - ox}px, ${ty * TILE - oy}px)`;
        if (img.__tf !== tf) { img.style.transform = tf; img.__tf = tf; }
      }
    }
    for (const [key, img] of this.tiles) if (!keep.has(key)) { img.remove(); this.tiles.delete(key); }

    const mpp = metersPerPx(this.center.lat, this.zoom);
    for (const f of this.features.values()) {
      const p = this.toPlane(f.lat, f.lng);
      const d = (2 * f.radiusM) / mpp;
      const key = `${d.toFixed(1)}|${(O.x + p.x - d / 2).toFixed(1)}|${(O.y + p.y - d / 2).toFixed(1)}`;
      if (f.key === key) continue;
      f.key = key;
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
      const tf = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) scale(${k.toFixed(3)})`;
      if (o.tf !== tf) { o.el.style.transform = tf; o.tf = tf; }
      const z = String(o.ground ? 1 : o.top ? 100000 : 1000 + Math.round(s.y));
      if (o.z !== z) { o.el.style.zIndex = z; o.z = z; }
    }
    this.cb.onRender?.();
  }

  // ----- gestos: arrastar, pinça, roda do mouse, toque -----
  // Cada dedo é "capturado" pelo mapa (setPointerCapture): mesmo passando por cima de um botão,
  // o mapa continua recebendo o movimento e a hora em que o dedo sai. Sem isso, um dedo que
  // saía em cima de um botão ficava "preso" na lista e a pinça seguinte não funcionava direito.
  bindGestures() {
    const pts = new Map();
    let start = null, last = null, pinch = null, moved = 0;
    const el = this.el;
    const TAP_SLOP = 12;   // um toque com o dedo mexe um pouco: até 12 px ainda é toque
    const local = (p) => { const r = el.getBoundingClientRect(); return { x: p.x - r.left, y: p.y - r.top }; };
    const startPinch = () => {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom };
      moved = 99;   // depois de uma pinça, não vale como toque
    };
    // Esquece todos os dedos (gesto encerrado de um jeito que o celular não avisou).
    const reset = () => { pts.clear(); pinch = null; start = null; last = null; };
    el.addEventListener('pointerdown', (e) => {
      // O primeiro dedo de um gesto novo (isPrimary) quer dizer que não há outro dedo na tela: se a lista
      // ainda tem algum, é um "fantasma" (o celular não avisou que ele saiu: notificação, troca de app,
      // tela apagando). Sem limpar, o arrasto de um dedo só virava pinça com o fantasma e dava zoom.
      if (e.isPrimary) reset();
      if (pts.size >= 2) return;   // um terceiro dedo é ignorado
      try { el.setPointerCapture(e.pointerId); } catch {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        const p = local({ x: e.clientX, y: e.clientY });
        start = { ...p, t: performance.now(), target: e.target };
        last = { ...p };
        moved = 0;
      } else startPinch();
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(pinch.zoom + Math.log2(d / pinch.d));
        return;
      }
      if (pts.size !== 1 || !last) return;
      const cur = local({ x: e.clientX, y: e.clientY });
      moved += Math.hypot(cur.x - last.x, cur.y - last.y);
      if (moved < TAP_SLOP) return;
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
      // tirou um dedo da pinça: o que ficou continua arrastando a partir de onde ele está agora
      // (antes ele "pulava" para a posição antiga e o mapa dava um tranco)
      if (pts.size === 1) { last = local([...pts.values()][0]); }
      if (pts.size === 0 && start && moved < TAP_SLOP && performance.now() - start.t < 500) {
        const obj = start.target.closest?.('.mobj[data-key]');
        if (obj && this.objects.has(obj.dataset.key)) this.cb.onTapObject?.(obj.dataset.key, this.objects.get(obj.dataset.key).data);
        else this.cb.onTapGround?.(this.screenToLatLng(start.x, start.y));
      }
      if (pts.size === 0) { start = null; last = null; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // só quando o próprio mapa perde o dedo (o evento sobe de elementos de dentro também: esses não contam)
    el.addEventListener('lostpointercapture', (e) => { if (e.target === el) end(e); });
    // app em segundo plano ou janela sem foco no meio de um toque: o fim do toque pode nunca chegar
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    window.addEventListener('pagehide', reset);
    window.addEventListener('blur', reset);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom - e.deltaY * 0.002); }, { passive: false });
  }

  setZoom(z) {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    this.invalidate();
  }
}
