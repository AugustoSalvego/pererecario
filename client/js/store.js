// Estado do jogo no aparelho.
//
// Modelo: a "verdade" é o último estado confirmado pelo servidor (snapshot)
// + as operações locais ainda pendentes (outbox), reaplicadas por cima.
// Assim o jogador vê na hora tudo o que fez offline e, quando o servidor
// responde, o estado converge para a versão canônica sem perder nada.
import * as db from './db.js';
import { api } from './api.js';
import { getCatalog } from './catalog.js';
import { xpBreakdown, levelFor, windowOf, dayOf, dayExpeditionId, balanceOf, carById, frogPrice } from './shared/game.js';

const ACTIVE_TRADE = new Set(['invited', 'open', 'finishing']);

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

const EMPTY = { player: null, captures: [], expeditions: [], friends: [], jobs: [], purchases: [], sales: [] };
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
  // Nada da fila é apagado ao sair ou trocar de conta: as ações que ainda não subiram ficam guardadas
  // neste aparelho ("parked") e voltam para a fila quando essa conta entrar de novo aqui.
  async parkOutbox() {
    const who = this.snapshot.player || this.session?.player;
    if (!who?.id || !this.outbox.length) return 0;
    const prev = (await db.kvGet(`parked:${who.id}`))?.ops || [];
    const known = new Set(prev.map((o) => o.opId));
    const ops = [...prev, ...this.outbox.filter((o) => !known.has(o.opId)).map(({ seq, ...o }) => o)];
    await db.kvSet(`parked:${who.id}`, { who: { id: who.id, displayName: who.displayName || '', email: who.email || '' }, ops });
    return this.outbox.length;
  }

  // contas com ações guardadas neste aparelho (para avisar na tela de entrada)
  async parkedAccounts() {
    return Object.values(await db.kvByPrefix('parked:')).filter((p) => p?.ops?.length).map((p) => ({ ...p.who, count: p.ops.length }));
  }

  async unparkOutbox(pid) {
    const ops = (await db.kvGet(`parked:${pid}`))?.ops;
    if (!ops?.length) return 0;
    this.outbox = await db.outboxPrepend(ops);
    await db.kvDelete(`parked:${pid}`);
    this.log('info', `${ops.length} ${ops.length === 1 ? 'ação guardada' : 'ações guardadas'} neste aparelho ${ops.length === 1 ? 'voltou' : 'voltaram'} para a fila`);
    return ops.length;
  }

  async login({ token, player, serverTime }) {
    const sameAccount = this.snapshot.player?.id === player.id;
    if (!sameAccount) {
      await this.parkOutbox();
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
    this.unparked = await this.unparkOutbox(player.id);
    this.recompute();
  }

  // Devolve quantas ações ficaram guardadas no aparelho (sobem quando a conta entrar de novo aqui)
  async logout() {
    const parked = await this.parkOutbox();
    await db.wipe({ keep: ['deviceId', 'settings'] });
    this.session = null; api.token = null;
    this.snapshot = EMPTY; this.outbox = []; this.brejos = []; this.brejosVersion = null;
    this.activity = {}; this.myMeters = {}; this.revealed = {}; this.currentExpeditionId = null;
    this.recompute();
    return parked;
  }

  // O servidor não aceitou mais a sessão (por exemplo, a chave das sessões do servidor mudou).
  // Sai da conta SEM apagar nada: entrando de novo com a mesma conta, o que está na fila sobe normalmente.
  async expireSession() {
    this.session = null;
    api.token = null;
    await db.kvSet('session', null);
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
    const tradesBefore = new Map((this.snapshot?.trades || []).map((t) => [t.id, t]));
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
    // o que o servidor confirmou vai para o histórico do aparelho (o reenvio de recuperação não entra de novo)
    const pid = resp.state?.player?.id || this.session?.player?.id;
    const history = events.filter(({ op }) => !op.replay).map(({ op, result }) => {
      const { seq, coalesceKey, attempts, ...rest } = op;
      return { ...rest, playerId: pid, status: result.status, ackedAt: Date.now() };
    });
    await db.outboxRemove(acked, kv, history);
    const ackedSet = new Set(acked);
    this.outbox = this.outbox.filter((o) => !ackedSet.has(o.seq));
    this.recompute();
    if (resp.brejos) this.emit('brejos', this.brejos);
    this.tradeChanges(tradesBefore, resp.state?.trades || []);
    await this.checkServerMemory(pid, resp.seen);
    return events;
  }

  // Anti-entropia: o servidor conta quantas operações deste aparelho ele guarda ("seen"). Se for menos
  // do que o aparelho sabe que já foram confirmadas, o banco perdeu algo (restaurado de um backup ou
  // voltado no tempo). O aparelho reenvia o histórico; o servidor ignora as repetidas (idempotência)
  // e recupera só o que faltava.
  async checkServerMemory(pid, seen) {
    if (!pid || typeof seen !== 'number') return;
    const total = await db.historyCount(pid);
    const key = `histBase:${pid}`;
    const mark = await db.kvGet(key);
    // primeira vez, ou fim de um reenvio: anota quantas operações o servidor tem além do histórico
    // (as de antes desta versão do jogo, que o aparelho não guardou)
    if (!mark || (mark.rebase && !this.outbox.some((o) => o.replay))) {
      await db.kvSet(key, { base: seen - total, rebase: false });
      return;
    }
    if (this.outbox.some((o) => o.replay)) return;      // reenvio em andamento
    if (seen >= mark.base + total) return;              // o servidor tem tudo
    const hist = await db.historyAll(pid);
    const ops = hist.map(({ hseq, playerId, status, ackedAt, ...op }) => ({ ...op, attempts: 0, replay: true }));
    this.outbox = await db.outboxPrepend(ops);
    await db.kvSet(key, { ...mark, rebase: true });
    this.recompute();
    this.log('warn', `O servidor tem menos dados deste aparelho do que deveria (${seen} de ${mark.base + total}). Reenviando o histórico (${ops.length} operações) para ele recuperar o que faltou.`);
    this.emit('resend', { count: seen - mark.base >= 0 ? mark.base + total - seen : ops.length });
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
    const jobs = new Map((s.jobs || []).map((j) => [j.jobId, { ...j, pending: false }]));
    const purchases = new Map((s.purchases || []).map((b) => [b.item, { ...b, pending: false }]));
    const sales = new Map((s.sales || []).map((v) => [v.captureId, { ...v, pending: false }]));
    const trades = new Map((s.trades || []).map((t) => [t.id, { ...t, pending: false }]));
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
        // trocas: o celular mostra na hora o que fez; o servidor confirma (ou não) quando a fila chegar
        case 'trade.offer':
          if (!trades.has(p.tradeId)) {
            trades.set(p.tradeId, { id: p.tradeId, dir: 'out', friendId: p.friendId, friendName: p.friendName || '', friendLook: p.friendLook || null,
              status: 'invited', mine: null, theirs: null, createdAt: p.at, updatedAt: p.at, pending: true });
          }
          break;
        case 'trade.respond': {
          const t = trades.get(p.tradeId);
          if (t && t.status === 'invited') { t.status = p.accept ? 'open' : 'declined'; t.pending = true; }
          break;
        }
        case 'trade.pick': {
          const t = trades.get(p.tradeId);
          const cap = [...captures.values()].find((c) => c.id === p.captureId);
          if (t && cap && (t.status === 'invited' || t.status === 'open')) {
            t.mine = { captureId: cap.id, speciesId: cap.speciesId, sizeCm: cap.sizeCm };
            t.pending = true;
            if (t.status === 'open' && t.theirs) t.status = 'finishing';   // as duas escolhidas: o servidor troca
          }
          break;
        }
        case 'trade.cancel': {
          const t = trades.get(p.tradeId);
          if (t && (t.status === 'invited' || t.status === 'open')) { t.status = 'cancelled'; t.cancelledByMe = true; t.pending = true; }
          break;
        }
        case 'profile.look':
          if (player && p.ts > (player.lookTs || 0)) { player.look = p.look; player.lookTs = p.ts; }
          break;
        case 'profile.avatar':
          if (player && p.ts > (player.avatarTs || 0)) { player.avatar = p.speciesId; player.avatarTs = p.ts; }
          break;
        case 'job.done':
          if (!jobs.has(p.jobId)) jobs.set(p.jobId, { id: p.doneId, jobId: p.jobId, type: p.type, pay: p.pay, mode: p.mode, doneAt: p.doneAt, deviceId: me, pending: true });
          break;
        case 'shop.buy': {
          // compra otimista: só entra se o saldo local cobrir (o servidor confere de novo)
          const car = carById(p.item);
          const bal = balanceOf([...jobs.values()], [...purchases.values()], [...sales.values()], friends.size);
          if (car && !purchases.has(car.id) && bal >= car.price) purchases.set(car.id, { id: p.buyId, item: car.id, price: car.price, boughtAt: p.boughtAt, deviceId: me, pending: true });
          break;
        }
        case 'frog.sell': {
          // venda otimista: só se a perereca está no brejo, não foi vendida e não é favorita
          const cap = [...captures.values()].find((c) => c.id === p.captureId);
          if (cap && !sales.has(cap.id) && !cap.favorite) {
            sales.set(cap.id, { id: p.sellId, captureId: cap.id, speciesId: cap.speciesId, price: frogPrice(catalog, cap.speciesId, cap.sizeCm), soldAt: p.soldAt, deviceId: me, pending: true });
          }
          break;
        }
        case 'vehicle.select':
          if (player && p.ts > (player.vehicleTs || 0) && (p.vehicle == null || purchases.has(p.vehicle))) { player.vehicle = p.vehicle; player.vehicleTs = p.ts; }
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
    const order = { invited: 0, open: 0, finishing: 0 };
    const tradeList = [...trades.values()].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1) || b.updatedAt - a.updatedAt);
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
      discovered: xp.collected,   // a coleção inclui as pererecas recebidas em trocas
      bySpecies,
      expeditions: expList,
      friends: [...friends.values()],
      pending: this.outbox.length,
      totalMeters: expList.reduce((a, e) => a + e.meters, 0),
      jobs: [...jobs.values()].sort((a, b) => b.doneAt - a.doneAt),
      jobsDone: new Set(jobs.keys()),
      purchases: [...purchases.values()],
      cars: new Set(purchases.keys()),
      balance: balanceOf([...jobs.values()], [...purchases.values()], [...sales.values()], friends.size),
      sales: [...sales.values()].sort((a, b) => b.soldAt - a.soldAt),
      sold: new Set(sales.keys()),
      // o Meu Brejo: o que não foi vendido nem foi para um amigo numa troca
      bag: capList.filter((c) => !sales.has(c.id) && !c.tradedAt),
      trades: tradeList,
      activeTrades: tradeList.filter((t) => ACTIVE_TRADE.has(t.status)),
      // trocas esperando algo DESTE jogador: aceitar um convite, ou escolher a perereca
      tradeActions: tradeList.filter((t) => (t.dir === 'in' && t.status === 'invited') || (t.status === 'open' && !t.mine)).length,
      // pererecas escolhidas em trocas abertas: ficam reservadas (não vendem, não entram em outra troca)
      reserved: new Set(tradeList.filter((t) => ACTIVE_TRADE.has(t.status) && t.mine).map((t) => t.mine.captureId)),
      vehicle: player?.vehicle && purchases.has(player.vehicle) ? player.vehicle : null,
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
  async capture(spawn, pos, mode = 'gps') {
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
    else payload.mode = mode === 'controle' ? 'controle' : 'gps';
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

  // ---------- trabalhos e loja ----------
  async jobDone(job, pos, mode, pay) {
    const doneAt = this.now();
    await this.addOp('job.done', { doneId: uuid(), jobId: job.id, type: job.type, pay, mode, doneAt, lat: pos.lat, lng: pos.lng });
  }

  async buy(carId) {
    await this.addOp('shop.buy', { buyId: uuid(), item: carId, boughtAt: this.now() });
  }

  // vende uma ou várias pererecas do Meu Brejo (cada uma vira uma operação: vender nos dois
  // celulares paga uma vez só, e o servidor recalcula o preço)
  async sell(captures) {
    for (const c of [].concat(captures)) {
      await this.addOp('frog.sell', { sellId: uuid(), captureId: c.id, speciesId: c.speciesId, soldAt: this.now() });
    }
  }

  async selectVehicle(carId) {
    await this.addOp('vehicle.select', { vehicle: carId || null, ts: this.now() });
  }

  async setAvatar(speciesId) {
    await this.addOp('profile.avatar', { speciesId, ts: this.now() });
  }

  // o que mudou nas trocas desde a última resposta do servidor (para avisar o jogador)
  tradeChanges(before, after) {
    const out = [];
    for (const t of after) {
      const b = before.get(t.id);
      if (!b) { if (t.dir === 'in' && t.status === 'invited') out.push({ kind: 'invited', trade: t }); continue; }
      if (b.status !== t.status) out.push({ kind: t.status, trade: t, before: b });
      else if (t.theirs && t.theirs.captureId !== b.theirs?.captureId) out.push({ kind: 'picked', trade: t });
    }
    if (out.length) this.emit('trades', out);
  }

  // ----- trocas -----
  async offerTrade(friend) {
    const tradeId = uuid();
    await this.addOp('trade.offer', { tradeId, friendId: friend.id, at: this.now(), friendName: friend.displayName, friendLook: friend.look || null });
    return tradeId;
  }
  async respondTrade(t, accept) { await this.addOp('trade.respond', { tradeId: t.id, accept: !!accept }); }
  async pickTrade(t, cap) { await this.addOp('trade.pick', { tradeId: t.id, captureId: cap.id }); }
  async cancelTrade(t) { await this.addOp('trade.cancel', { tradeId: t.id }); }

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
