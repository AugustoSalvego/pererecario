// Presença: avisa o servidor onde o jogador está (a cada poucos segundos, só com o jogo aberto
// e online) e recebe os jogadores que estão por perto. É um dado "leve" e passageiro: não entra
// na fila offline nem no IndexedDB. Sem internet, os outros jogadores somem do mapa sozinhos.
import { api } from './api.js';
import { geo } from './geo.js';
import { store } from './store.js';
import { normalizeLook } from './shared/game.js';

const EVERY_MS = 4000;
const STALE_MS = 30000;

class Presence extends EventTarget {
  others = new Map(); // id -> { id, name, look, lat, lng, mode, seenAt }
  timer = null;
  busy = false;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), EVERY_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
    geo.addEventListener('mode', () => this.tick());
    this.tick();
  }

  list() { return [...this.others.values()]; }

  async tick() {
    if (this.busy) return;
    if (document.hidden || !geo.pos || !api.token || api.isOffline()) { this.expire(); return; }
    this.busy = true;
    try {
      const r = await api.post('/api/presence', {
        lat: geo.pos.lat, lng: geo.pos.lng, mode: geo.playMode,
        look: normalizeLook(store.view.player?.look), hidden: !!store.settings.hidePresence,
      }, { timeout: 5000 });
      const t = Date.now();
      const seen = new Set();
      for (const o of r.players || []) {
        seen.add(o.id);
        this.others.set(o.id, { ...o, seenAt: t - (o.age || 0) });
      }
      for (const id of [...this.others.keys()]) if (!seen.has(id)) this.others.delete(id);
      this.emit();
    } catch {
      this.expire();
    } finally {
      this.busy = false;
    }
  }

  expire() {
    const t = Date.now();
    let changed = false;
    for (const [id, o] of this.others) if (t - o.seenAt > STALE_MS) { this.others.delete(id); changed = true; }
    if (changed) this.emit();
  }

  emit() { this.dispatchEvent(new CustomEvent('change')); }
}

export const presence = new Presence();
