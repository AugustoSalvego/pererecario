// Estado do jogo no aparelho.
//
// Modelo: a "verdade" é o último estado confirmado pelo servidor (snapshot)
// + as operações locais ainda pendentes (outbox), reaplicadas por cima.
// Assim o jogador vê na hora tudo o que fez offline e, quando o servidor
// responde, o estado converge para a versão canônica sem perder nada.
import * as db from './db.js';
import { api } from './api.js';
import { getCatalog } from './catalog.js';
import { xpBreakdown, levelFor, windowOf, dayOf, dayExpeditionId } from './shared/game.js';

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

const EMPTY = { player: null, captures: [], expeditions: [], friends: [] };
const PROGRESS_EVERY_MS = 60 * 1000;

class Store extends EventTarget {
  session = null;
  deviceId = null;
  snapshot = EMPTY;
  outbox = [];
  brejos = [];
  brejosVersion = null;
  clockOffset = 0;
  settings = {};
  revealed = {};
  activity = {};
  myMeters = {};
  currentExpeditionId = null;
  view = null;
  lastProgressAt = 0;

  async init() {
    this.deviceId = await db.kvGet('deviceId');
    if (!this.deviceId) {
      this.deviceId = `${navigator.userAgent.includes('Mobile') ? 'cel' : 'pc'}-${uuid().slice(0, 8)}`;
      await db.kvSet('deviceId', this.deviceId);
    }
    this.session = await db.kvGet('session');
    this.snapshot = (await db.kvGet('snapshot')) || EMPTY;
    this.outbox = await db.outboxAll();
    this.brejos = (await db.kvGet('brejos')) || [];
    this.brejosVersion = await db.kvGet('brejosVersion');
    this.clockOffset = (await db.kvGet('clockOffset')) || 0;
    this.settings = (await db.kvGet('settings')) || {};
    this.revealed = (await db.kvGet('revealed')) || {};
    this.activity = (await db.kvGet('activity')) || {};
    this.myMeters = (await db.kvGet('myMeters')) || {};
    api.token = this.session?.token || null;
    api.forcedOffline = !!this.settings.forcedOffline;
    this.recompute();
  }

  now() { return Date.now() + this.clockOffset; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async log(kind, message, extra = {}) {
    const entry = { at: Date.now(), kind, message, ...extra };
    this.emit('log', entry);
    try { await db.logAdd(entry); } catch {}
  }

  // ---------- sessão ----------
  async login({ token, player, serverTime }) {
    const sameAccount = this.snapshot.player?.id === player.id;
    if (!sameAccount) {
      await db.wipe({ keep: ['deviceId', 'settings'] });
      this.snapshot = { ...EMPTY, player };
      this.outbox = [];
      this.activity = {}; this.myMeters = {}; this.revealed = {};
    }
    this.session = { token, player };
    api.token = token;
    this.clockOffset = serverTime ? serverTime - Date.now() : 0;
    await db.kvSet('session', this.session);
    await db.kvSet('clockOffset', this.clockOffset);
    await db.kvSet('snapshot', this.snapshot);
    this.recompute();
  }

  async logout() {
    await db.wipe({ keep: ['deviceId', 'settings'] });
    this.session = null; api.token = null;
    this.snapshot = EMPTY; this.outbox = []; this.brejos = []; this.brejosVersion = null;
    this.activity = {}; this.myMeters = {}; this.revealed = {}; this.currentExpeditionId = null;
    this.recompute();
  }

  async saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    await db.kvSet('settings', this.settings);
    api.forcedOffline = !!this.settings.forcedOffline;
    this.emit('settings', this.settings);
  }

  // ---------- operações ----------
  async addOp(type, payload, { kv = {}, coalesceKey } = {}) {
    const op = { opId: uuid(), type, payload, ts: this.now(), deviceId: this.deviceId, attempts: 0, createdAt: Date.now() };
    if (coalesceKey) op.coalesceKey = coalesceKey;
    let replaceSeq = null;
    if (coalesceKey) {
      const prev = [...this.outbox].reverse().find((o) => o.coalesceKey === coalesceKey);
      if (prev && this.outbox[this.outbox.length - 1] === prev) replaceSeq = prev.seq;
    }
    op.seq = await db.enqueue(op, kv, { replaceSeq });
    if (replaceSeq != null) this.outbox = this.outbox.filter((o) => o.seq !== replaceSeq);
    this.outbox.push(op);
    this.recompute();
    this.emit('op', op);
    return op;
  }

  // Resposta do servidor: remove da fila o que foi confirmado e adota o estado canônico.
  async applySync(resp, sentOps, sentAt, recvAt) {
    const acked = [];
    const events = [];
    for (const r of resp.results || []) {
      const op = sentOps.find((o) => o.opId === r.opId);
      if (!op) continue;
      if (r.status === 'error') { op.attempts = (op.attempts || 0) + 1; continue; }
      acked.push(op.seq);
      events.push({ op, result: r });
    }
    this.snapshot = resp.state;
    this.clockOffset = Math.round(resp.serverTime - (sentAt + recvAt) / 2);
    const kv = { snapshot: this.snapshot, clockOffset: this.clockOffset };
    if (resp.brejos) {
      this.brejos = resp.brejos;
      this.brejosVersion = resp.brejosVersion;
      kv.brejos = this.brejos;
      kv.brejosVersion = this.brejosVersion;
    }
    if (this.session && resp.state?.player) {
      this.session = { ...this.session, player: resp.state.player };
      kv.session = this.session;
    }
    await db.outboxRemove(acked, kv);
    const ackedSet = new Set(acked);
    this.outbox = this.outbox.filter((o) => !ackedSet.has(o.seq));
    this.recompute();
    if (resp.brejos) this.emit('brejos', this.brejos);
    return events;
  }

  async setBrejos(brejos, version) {
    this.brejos = brejos;
    this.brejosVersion = version;
    await db.kvSet('brejos', brejos);
    await db.kvSet('brejosVersion', version);
    this.emit('brejos', brejos);
  }

  // ---------- visão derivada ----------
  recompute() {
    const catalog = getCatalog();
    const s = this.snapshot || EMPTY;
    const captures = new Map((s.captures || []).map((c) => [c.spawnId, { ...c, pending: false }]));
    const exps = new Map((s.expeditions || []).map((e) => [e.id, { ...e, distance: { ...e.distance } }]));
    const friends = new Map((s.friends || []).map((f) => [f.id, { ...f }]));
    const player = s.player ? { ...s.player } : this.session?.player ? { ...this.session.player } : null;
    const me = this.deviceId;
    const ensureExp = (id, at) => {
      if (!exps.has(id)) exps.set(id, { id, startedAt: at, endedAt: null, status: 'active', updatedAt: at, distance: {}, pending: true });
      return exps.get(id);
    };

    for (const op of this.outbox) {
      const p = op.payload;
      switch (op.type) {
        case 'capture':
          if (!captures.has(p.spawnId)) {
            captures.set(p.spawnId, {
              id: p.captureId, spawnId: p.spawnId, speciesId: p.speciesId, sizeCm: p.sizeCm,
              kind: p.spawnId.startsWith('gift:') ? 'gift' : 'wild', brejoId: p.brejoId || null, friendId: p.friendId || null,
              expeditionId: p.expeditionId, caughtAt: p.caughtAt, deviceId: me, favorite: false, favoriteTs: 0, pending: true,
            });
          }
          if (p.expeditionId) { const e = ensureExp(p.expeditionId, p.caughtAt); e.updatedAt = Math.max(e.updatedAt, p.caughtAt); }
          break;
        case 'favorite': {
          const c = captures.get(p.spawnId);
          if (c && p.ts > (c.favoriteTs || 0)) { c.favorite = !!p.favorite; c.favoriteTs = p.ts; c.pendingFav = true; }
          break;
        }
        case 'expedition.start': ensureExp(p.id, p.startedAt); break;
        case 'expedition.progress': {
          const e = ensureExp(p.id, p.at);
          e.distance[me] = Math.max(e.distance[me] || 0, p.meters);
          e.updatedAt = Math.max(e.updatedAt, p.at);
          break;
        }
        case 'expedition.end': {
          const e = ensureExp(p.id, p.endedAt);
          e.distance[me] = Math.max(e.distance[me] || 0, p.meters || 0);
          e.status = 'finished';
          e.endedAt = Math.max(e.endedAt || 0, p.endedAt);
          e.pending = true;
          break;
        }
        case 'friend.add':
          if (!friends.has(p.friendId)) friends.set(p.friendId, { id: p.friendId, displayName: p.displayName, avatar: p.avatar, since: p.at, pending: true });
          break;
        case 'profile.look':
          if (player && p.ts > (player.lookTs || 0)) { player.look = p.look; player.lookTs = p.ts; }
          break;
        case 'profile.avatar':
          if (player && p.ts > (player.avatarTs || 0)) { player.avatar = p.speciesId; player.avatarTs = p.ts; }
          break;
        default: break;
      }
    }
    // distância local ainda não enviada
    for (const [id, m] of Object.entries(this.myMeters)) {
      const e = exps.get(id);
      if (e) e.distance[me] = Math.max(e.distance[me] || 0, m);
    }

    const capList = [...captures.values()].sort((a, b) => b.caughtAt - a.caughtAt);
    const xp = catalog ? xpBreakdown(capList, catalog) : { total: 0, perCapture: new Map(), species: new Set() };
    const bySpecies = new Map();
    for (const c of [...capList].reverse()) {
      if (!bySpecies.has(c.speciesId)) bySpecies.set(c.speciesId, { count: 0, first: c, biggest: c });
      const e = bySpecies.get(c.speciesId);
      e.count++;
      if (c.sizeCm > e.biggest.sizeCm) e.biggest = c;
    }
    const expList = [...exps.values()].map((e) => {
      const caps = capList.filter((c) => c.expeditionId === e.id);
      return {
        ...e,
        captures: caps,
        xp: caps.reduce((sum, c) => sum + (xp.perCapture.get(c.id)?.xp || 0), 0),
        meters: Object.values(e.distance || {}).reduce((a, b) => a + b, 0),
      };
    }).sort((a, b) => b.startedAt - a.startedAt);

    this.view = {
      player,
      captures: capList,
      capturedSpawns: new Set(captures.keys()),
      xp: xp.total,
      perCapture: xp.perCapture,
      level: levelFor(xp.total),
      discovered: xp.species,
      bySpecies,
      expeditions: expList,
      friends: [...friends.values()],
      pending: this.outbox.length,
      totalMeters: expList.reduce((a, e) => a + e.meters, 0),
    };
    this.emit('change', this.view);
  }

  // ---------- caçada do dia (a "partida") ----------
  todayId() { return this.view?.player ? dayExpeditionId(this.view.player.id, dayOf(this.now())) : null; }

  currentExpedition() { return this.view.expeditions.find((e) => e.id === this.todayId()) || null; }

  ensureExpedition() {
    if (!this._ensuring) this._ensuring = this._ensureExpedition().finally(() => { this._ensuring = null; });
    return this._ensuring;
  }

  async _ensureExpedition() {
    const id = this.todayId();
    if (!id) return null;
    this.currentExpeditionId = id;
    const cur = this.currentExpedition();
    if (cur) return cur;
    const t = this.now();
    this.activity[id] = t;
    await this.addOp('expedition.start', { id, startedAt: t }, { kv: { activity: this.activity } });
    return this.currentExpedition();
  }

  async addDistance(meters) {
    if (!this.session) return;
    const exp = await this.ensureExpedition();
    if (!exp) return;
    const t = this.now();
    this.myMeters[exp.id] = (this.myMeters[exp.id] || 0) + meters;
    this.activity[exp.id] = t;
    if (Date.now() - this.lastProgressAt > PROGRESS_EVERY_MS) await this.flushProgress();
    else { db.kvSet('myMeters', this.myMeters); db.kvSet('activity', this.activity); this.recompute(); }
  }

  async flushProgress() {
    const exp = this.currentExpedition();
    if (!exp) return;
    this.lastProgressAt = Date.now();
    await this.addOp('expedition.progress', { id: exp.id, meters: Math.round(this.myMeters[exp.id] || 0), at: this.now() }, {
      kv: { myMeters: this.myMeters, activity: this.activity },
      coalesceKey: `progress:${exp.id}`,
    });
  }

  // ---------- ações do jogador ----------
  async capture(spawn, pos) {
    const exp = await this.ensureExpedition();
    const t = this.now();
    const isNew = !this.view.discovered.has(spawn.speciesId);
    this.activity[exp.id] = t;
    const payload = {
      captureId: uuid(), spawnId: spawn.id, speciesId: spawn.speciesId, sizeCm: spawn.sizeCm, caughtAt: t,
      expeditionId: exp.id, brejoId: spawn.brejoId || null, friendId: spawn.friendId || null,
    };
    if (pos && spawn.kind === 'wild') { payload.lat = pos.lat; payload.lng = pos.lng; }
    if (spawn.kind === 'gift') payload.mask = spawn.mask;
    await this.addOp('capture', payload, { kv: { activity: this.activity } });
    const xp = this.view.perCapture.get(payload.captureId)?.xp || 0;
    return { capture: this.view.captures.find((c) => c.id === payload.captureId), isNew, xp };
  }

  async toggleFavorite(c) {
    await this.addOp('favorite', { spawnId: c.spawnId, favorite: !c.favorite, ts: this.now() });
  }

  async setLook(look) {
    await this.addOp('profile.look', { look, ts: this.now() });
  }

  async setAvatar(speciesId) {
    await this.addOp('profile.avatar', { speciesId, ts: this.now() });
  }

  async addFriend(friend) {
    if (this.view.friends.some((f) => f.id === friend.id)) return false;
    await this.addOp('friend.add', { friendId: friend.id, displayName: friend.displayName, avatar: friend.avatar, at: this.now() });
    return true;
  }

  async reveal(spawnIds) {
    const w = windowOf(this.now());
    for (const k of Object.keys(this.revealed)) if (this.revealed[k] < w) delete this.revealed[k];
    for (const id of spawnIds) this.revealed[id] = w;
    await db.kvSet('revealed', this.revealed);
    this.emit('revealed', spawnIds);
  }
}

export const store = new Store();
