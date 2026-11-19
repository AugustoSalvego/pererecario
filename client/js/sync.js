// Módulo de sincronização: detecta conectividade, envia a fila de operações,
// recebe o estado canônico e trata falhas com novas tentativas (backoff exponencial).
import { api, ServerDownError } from './api.js';
import { store } from './store.js';

const BATCH = 50;
const IDLE_MS = 25000;      // "batimento" quando está tudo em dia (também traz novidades de outros aparelhos)
const OFFLINE_MS = 4000;    // checagem enquanto não há rede
const MAX_BACKOFF = 30000;

class Sync extends EventTarget {
  status = 'starting'; // online | offline | server-down | syncing
  lastSyncAt = null;
  lastError = null;
  backoff = 0;
  nextAt = null;
  timer = null;
  flushing = null;
  dropNextResponse = false; // demonstração: a conexão "cai" depois que o servidor aplicou as operações
  lastAcked = null;         // demonstração: reenviar uma operação já confirmada

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  setStatus(s, error = null) {
    const changed = s !== this.status;
    this.status = s;
    this.lastError = error;
    if (changed) {
      this.emit('status', s);
      const msg = { online: 'Conectado ao servidor', offline: 'Sem internet: jogando offline', 'server-down': `Servidor indisponível${error ? ` (${error})` : ''}` }[s];
      if (msg) store.log(s === 'online' ? 'ok' : 'warn', msg);
    }
  }

  start() {
    window.addEventListener('online', () => { store.log('info', 'Rede voltou: tentando sincronizar'); this.kick(); });
    window.addEventListener('offline', () => { this.setStatus('offline'); this.schedule(OFFLINE_MS); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.kick(); });
    store.addEventListener('op', () => this.kick(300));
    this.kick(0);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.nextAt = Date.now() + ms;
    this.timer = setTimeout(() => this.tick(), ms);
    this.emit('status', this.status);
  }

  kick(delay = 50) {
    if (!store.session) return;
    this.schedule(delay);
  }

  async tick() {
    if (!store.session) return;
    if (api.isOffline()) {
      this.setStatus('offline');
      return this.schedule(OFFLINE_MS);
    }
    try {
      await this.flush();
      this.backoff = 0;
      this.schedule(store.outbox.length ? 1500 : IDLE_MS);
    } catch (e) {
      if (e.kind === 'offline') {
        this.setStatus('offline');
        return this.schedule(OFFLINE_MS);
      }
      if (e.status === 401) {
        this.setStatus('server-down', e.message);
        this.emit('auth-expired');
        return;
      }
      this.backoff = Math.min(MAX_BACKOFF, this.backoff ? this.backoff * 2 : 2000);
      this.setStatus('server-down', e.message);
      store.log('warn', `Falha na sincronização: ${e.message}. Nova tentativa em ${Math.round(this.backoff / 1000)} s`);
      this.schedule(this.backoff);
    }
  }

  flush() {
    if (!this.flushing) this.flushing = this._flush().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async _flush() {
    let rounds = 0;
    while (rounds++ < 10) {
      const batch = store.outbox.slice(0, BATCH);
      const wire = batch.map(({ opId, type, payload, ts }) => ({ opId, type, payload, ts }));
      // voltando da falta de internet, mostra "Sincronizando" mesmo sem nada na fila:
      // é a hora em que o celular confere com o servidor
      if (batch.length || this.status === 'offline') this.setStatus('syncing');
      if (batch.length) store.log('send', `Enviando ${batch.length} operaç${batch.length > 1 ? 'ões' : 'ão'} ao servidor`);
      const sentAt = Date.now();
      let resp;
      try {
        resp = await api.post('/api/sync', { deviceId: store.deviceId, ops: wire, brejosVersion: store.brejosVersion }, { timeout: 12000 });
      } catch (e) {
        if (batch.length) {
          for (const op of batch) op.attempts = (op.attempts || 0) + 1;
          import('./db.js').then((db) => db.outboxUpdate(batch)).catch(() => {});
        }
        throw e;
      }
      if (this.dropNextResponse && batch.length) {
        this.dropNextResponse = false;
        for (const op of batch) op.attempts = (op.attempts || 0) + 1;
        store.log('warn', 'Simulação: a conexão caiu antes da resposta chegar. As operações continuam na fila.');
        throw new ServerDownError('conexão interrompida durante a sincronização');
      }
      const events = await store.applySync(resp, batch, sentAt, Date.now());
      this.report(events);
      this.lastSyncAt = Date.now();
      this.setStatus('online');
      this.emit('synced', events);
      const okOps = events.filter((e) => e.result.status !== 'error');
      if (okOps.length) this.lastAcked = okOps[okOps.length - 1].op;
      if (batch.length < BATCH || !okOps.length || !store.outbox.length) break;
    }
  }

  report(events) {
    if (!events.length) return;
    const count = (s) => events.filter((e) => e.result.status === s).length;
    const parts = [];
    if (count('applied')) parts.push(`${count('applied')} aplicada(s)`);
    if (count('duplicate')) parts.push(`${count('duplicate')} duplicada(s) ignorada(s)`);
    if (count('conflict')) parts.push(`${count('conflict')} em conflito`);
    if (count('rejected')) parts.push(`${count('rejected')} rejeitada(s)`);
    store.log('ok', `Servidor confirmou: ${parts.join(', ')}`);
    for (const { op, result } of events) {
      if (result.conflict) {
        const what = op.type === 'capture' ? `Conflito na perereca ${op.payload.spawnId}: ficou a captura do aparelho ${result.conflict.kept.deviceId} (a mais antiga)`
          : `Conflito em ${op.type}: ${result.conflict.policy || 'mantido o que chegou primeiro'} (aparelho ${result.conflict.kept.deviceId})`;
        store.log('conflict', what);
        this.emit('conflict', { op, result });
      }
      if (result.status === 'rejected') {
        store.log('error', `Operação ${op.type} rejeitada: ${result.error}`);
        this.emit('rejected', { op, result });
      }
      if (result.status === 'duplicate') store.log('dup', `Operação ${op.opId.slice(0, 8)} já tinha sido aplicada: nada mudou`);
    }
  }

  // Demonstração: reenviar ao servidor uma operação que ele já confirmou.
  async resendLast() {
    const op = this.lastAcked;
    if (!op) throw new Error('Nenhuma operação confirmada ainda');
    store.log('send', `Reenviando operação já confirmada ${op.opId.slice(0, 8)} (${op.type})`);
    const resp = await api.post('/api/sync', { deviceId: store.deviceId, ops: [{ opId: op.opId, type: op.type, payload: op.payload, ts: op.ts }], brejosVersion: store.brejosVersion });
    const r = resp.results[0];
    store.log(r.status === 'duplicate' ? 'dup' : 'warn', `Servidor respondeu "${r.status}": ${r.status === 'duplicate' ? 'reconheceu o reenvio e não alterou nada' : 'inesperado'}`);
    await store.applySync({ ...resp, results: [] }, [], Date.now(), Date.now());
    return r;
  }
}

export const sync = new Sync();
