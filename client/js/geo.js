// Localização do jogador. Dois modos de andar:
//  - GPS ("real"): o boneco segue o GPS do celular. Aparecem todas as pererecas.
//  - Controle ("sim"): o boneco anda com o joystick da tela (ou tocando no mapa).
//    Aparecem menos pererecas raras (BALANCO.noModoControle).
// A distância percorrida alimenta a caçada do dia.
import { distanceM, offsetLatLng } from './shared/game.js';
import { store } from './store.js';

const MAX_ACCURACY_FOR_DISTANCE = 35;
const WALK_SPEED = 6;    // m/s andando até o ponto tocado no mapa
const JOY_SPEED = 3.5;   // m/s com o joystick todo inclinado

class Geo extends EventTarget {
  pos = null;
  error = null;
  mode = 'real';
  watchId = null;
  walkTimer = null;
  joy = { x: 0, y: 0 };
  joySpeed = JOY_SPEED; // a pé; com carro a tela troca para a velocidade do carro
  joyTimer = null;
  glideTimer = null;

  // 'gps' ou 'controle' (é o que vai junto com cada captura)
  get playMode() { return this.mode === 'real' ? 'gps' : 'controle'; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  start() {
    this.mode = store.settings.simGps ? 'sim' : 'real';
    if (this.mode === 'sim') {
      const p = store.settings.simPos || this.defaultSimPos();
      if (p) this.update({ lat: p.lat, lng: p.lng, accuracy: 5, simulated: true }, false);
    } else this.watch();
  }

  defaultSimPos() {
    const b = store.brejos[0];
    return b ? { lat: b.lat - 0.0006, lng: b.lng } : { lat: -23.1068, lng: -50.3602 };
  }

  watch() {
    if (!('geolocation' in navigator)) { this.setError('unsupported'); return; }
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (this.mode !== 'real') return;
        this.error = null;
        this.update({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, simulated: false });
      },
      (e) => this.setError(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }

  stopWatch() {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  setError(code) {
    this.error = code;
    this.emit('error', code);
  }

  async setMode(mode) {
    this.mode = mode;
    clearInterval(this.walkTimer);
    this.setJoystick(0, 0);
    await store.saveSettings({ simGps: mode === 'sim' });
    if (mode === 'sim') {
      this.stopWatch();
      this.error = null;
      const p = this.pos || store.settings.simPos || this.defaultSimPos();
      if (p) this.update({ lat: p.lat, lng: p.lng, accuracy: 5, simulated: true }, false);
    } else {
      this.pos = null;
      this.watch();
    }
    this.emit('mode', mode);
  }

  update(next, countDistance = true) {
    const prev = this.pos;
    if (!next.simulated && prev) {
      // GPS parado "tremendo": ignora pulinhos menores que parte da imprecisão informada
      const d = distanceM(prev, next);
      // andando (o GPS informa velocidade): aceita passos pequenos, para o boneco acompanhar
      const moving = next.speed != null && next.speed > 0.6;
      const dead = moving ? 1 : Math.max(3, Math.min(12, (next.accuracy || 10) * 0.4));
      if (d < dead) return;
      if (countDistance && next.accuracy <= MAX_ACCURACY_FOR_DISTANCE && d < 80) store.addDistance(d);
      // suaviza leituras imprecisas e desliza o boneco até o novo ponto (sem teletransporte)
      const a = Math.max(0.4, Math.min(1, 12 / (next.accuracy || 12)));
      const target = d > 60 ? next : { ...next, lat: prev.lat + (next.lat - prev.lat) * a, lng: prev.lng + (next.lng - prev.lng) * a };
      this.glide(prev, target);
      return;
    }
    if (countDistance && prev && next.simulated) store.addDistance(distanceM(prev, next));
    this.set(next);
  }

  glide(from, to) {
    clearInterval(this.glideTimer);
    const steps = 6;
    let i = 0;
    this.glideTimer = setInterval(() => {
      i++;
      const t = i / steps;
      this.set({ ...to, lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t });
      if (i >= steps) clearInterval(this.glideTimer);
    }, 90);
  }

  set(next) {
    this.pos = { ...next, at: Date.now() };
    if (next.simulated) {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => store.saveSettings({ simPos: { lat: next.lat, lng: next.lng } }), 800);
    }
    this.emit('change', this.pos);
  }

  // modo simulado: anda até o ponto tocado no mapa
  walkTo(lat, lng) {
    if (this.mode !== 'sim' || !this.pos) return;
    clearInterval(this.walkTimer);
    const from = { ...this.pos };
    const total = distanceM(from, { lat, lng });
    const steps = Math.max(1, Math.round(total / WALK_SPEED / 0.25));
    let i = 0;
    this.walkTimer = setInterval(() => {
      i++;
      const t = i / steps;
      this.update({ lat: from.lat + (lat - from.lat) * t, lng: from.lng + (lng - from.lng) * t, accuracy: 5, simulated: true });
      if (i >= steps) clearInterval(this.walkTimer);
    }, 250);
  }

  // modo controle: x = leste, y = norte, de -1 a 1 (joystick ou setas do teclado)
  setJoystick(x, y) {
    const m = Math.hypot(x, y);
    this.joy = m > 1 ? { x: x / m, y: y / m } : { x, y };
    if (m < 0.08 || this.mode !== 'sim') {
      clearInterval(this.joyTimer);
      this.joyTimer = null;
      return;
    }
    if (this.joyTimer) return;
    clearInterval(this.walkTimer);
    let last = performance.now();
    this.joyTimer = setInterval(() => {
      const t = performance.now();
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      if (!this.pos) return;
      const n = this.joy.y * this.joySpeed * dt, e = this.joy.x * this.joySpeed * dt;
      const p = offsetLatLng(this.pos.lat, this.pos.lng, n, e);
      this.update({ lat: p.lat, lng: p.lng, accuracy: 5, simulated: true });
    }, 100);
  }

  teleport(lat, lng) {
    clearInterval(this.walkTimer);
    this.update({ lat, lng, accuracy: 5, simulated: true }, false);
  }
}

export const geo = new Geo();
