// Localização do jogador: GPS real (watchPosition) ou simulada (modo demonstração,
// para apresentar em sala sem sair andando). A distância percorrida alimenta a expedição.
import { distanceM } from './shared/game.js';
import { store } from './store.js';

const MAX_ACCURACY_FOR_DISTANCE = 35;
const WALK_SPEED = 6; // m/s no modo simulado

class Geo extends EventTarget {
  pos = null;
  error = null;
  mode = 'real';
  watchId = null;
  walkTimer = null;

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
    return b ? { lat: b.lat - 0.0006, lng: b.lng } : null;
  }

  watch() {
    if (!('geolocation' in navigator)) { this.setError('unsupported'); return; }
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (this.mode !== 'real') return;
        this.error = null;
        this.update({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, simulated: false });
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
    if (countDistance && prev) {
      const d = distanceM(prev, next);
      if (next.simulated) store.addDistance(d);
      else {
        if (d < 3) return; // ruído do GPS: ignora
        if (next.accuracy <= MAX_ACCURACY_FOR_DISTANCE && d < 80) store.addDistance(d);
      }
    }
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

  teleport(lat, lng) {
    clearInterval(this.walkTimer);
    this.update({ lat, lng, accuracy: 5, simulated: true }, false);
  }
}

export const geo = new Geo();
