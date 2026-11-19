// Armazenamento local persistente (IndexedDB).
//  kv     -> sessão, último estado recebido do servidor, brejos, configurações
//  outbox -> fila de operações ainda não confirmadas pelo servidor (ordem preservada)
//  log    -> histórico de eventos de sincronização (para a demonstração)
//  history-> toda operação que o servidor já confirmou, na ordem. Se o servidor um dia perder dados
//            (banco restaurado de um backup, por exemplo), o celular reenvia o que faltar.
const DB_NAME = 'pererecario';
const VERSION = 2;
let dbp = null;

// Abre o banco (uma conexão só, reaproveitada). O celular pode fechar essa conexão sozinho: a aba foi
// para o segundo plano (por exemplo, enquanto a tela do Google estava aberta), faltou memória ou outra
// aba atualizou o banco. Quando isso acontece, esquecemos a conexão e a próxima operação abre outra.
function open() {
  if (dbp) return dbp;
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'hseq', autoIncrement: true }).createIndex('player', 'playerId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { if (dbp === p) dbp = null; };                           // fechada pelo navegador
      db.onversionchange = () => { db.close(); if (dbp === p) dbp = null; };       // outra aba precisa atualizar
      resolve(db);
    };
    req.onerror = () => { if (dbp === p) dbp = null; reject(req.error); };
  });
  dbp = p;
  return p;
}

const done = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new DOMException('Transação interrompida', 'AbortError'));
});
const reqp = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// conexão fechada no meio do caminho ("The database connection is closing", transação interrompida)
const lostConnection = (e) => !!e && (e.name === 'InvalidStateError' || e.name === 'AbortError' || e.name === 'UnknownError'
  || /clos(ing|ed)/i.test(String(e.message || '')));

// Roda uma transação inteira. Se a conexão tinha sido fechada, abre outra e tenta de novo (até 3 vezes).
// Repetir é seguro: uma transação que não chegou ao fim não grava nada (é tudo ou nada).
async function run(stores, mode, fn) {
  for (let attempt = 1; ; attempt++) {
    let db;
    try {
      db = await open();
      const tx = db.transaction(stores, mode);
      const fin = done(tx);
      fin.catch(() => {});
      const result = await fn(tx);
      await fin;
      return result;
    } catch (e) {
      if (attempt >= 3 || !lostConnection(e)) throw e;
      try { db?.close(); } catch {}
      dbp = null;
      await new Promise((r) => setTimeout(r, 60 * attempt));
    }
  }
}

export function kvGet(key, fallback = null) {
  return run('kv', 'readonly', async (tx) => {
    const v = await reqp(tx.objectStore('kv').get(key));
    return v === undefined ? fallback : v;
  });
}

export function kvSet(key, value) {
  return run('kv', 'readwrite', (tx) => { tx.objectStore('kv').put(value, key); });
}

export async function kvByPrefix(prefix) {
  return run('kv', 'readonly', async (tx) => {
    const store = tx.objectStore('kv');
    const keys = (await reqp(store.getAllKeys())).filter((k) => typeof k === 'string' && k.startsWith(prefix));
    const values = await Promise.all(keys.map((k) => reqp(store.get(k))));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  });
}

export function kvDelete(key) {
  return run('kv', 'readwrite', (tx) => { tx.objectStore('kv').delete(key); });
}

export function outboxAll() {
  return run('outbox', 'readonly', (tx) => reqp(tx.objectStore('outbox').getAll()));
}

// Grava a operação e (opcionalmente) valores no kv na MESMA transação:
// ou os dois ficam salvos, ou nenhum.
export function enqueue(op, kvWrites = {}, { replaceSeq } = {}) {
  return run(['outbox', 'kv'], 'readwrite', (tx) => {
    const out = tx.objectStore('outbox');
    if (replaceSeq != null) out.delete(replaceSeq);
    const r = out.add(op);
    for (const [k, v] of Object.entries(kvWrites)) tx.objectStore('kv').put(v, k);
    return reqp(r);
  });
}

// Tira da fila o que o servidor confirmou e guarda no histórico, na MESMA transação
export function outboxRemove(seqs, kvWrites = {}, historyOps = []) {
  return run(['outbox', 'kv', 'history'], 'readwrite', (tx) => {
    for (const s of seqs) tx.objectStore('outbox').delete(s);
    for (const op of historyOps) tx.objectStore('history').add(op);
    for (const [k, v] of Object.entries(kvWrites)) tx.objectStore('kv').put(v, k);
  });
}

export function historyCount(playerId) {
  return run('history', 'readonly', (tx) => reqp(tx.objectStore('history').index('player').count(playerId)));
}

export function historyAll(playerId) {
  return run('history', 'readonly', (tx) => reqp(tx.objectStore('history').index('player').getAll(playerId)));
}

// Coloca operações na frente da fila (são mais antigas que as que já estão nela), numa transação só.
// Devolve a fila nova, na ordem.
export async function outboxPrepend(ops) {
  await run('outbox', 'readwrite', async (tx) => {
    const out = tx.objectStore('outbox');
    const current = await reqp(out.getAll());
    const known = new Set(current.map((o) => o.opId));
    out.clear();
    for (const op of ops) if (!known.has(op.opId)) { known.add(op.opId); out.add(op); }
    for (const { seq, ...op } of current) out.add(op);
  });
  return outboxAll();
}

export function outboxUpdate(ops) {
  return run('outbox', 'readwrite', (tx) => { for (const op of ops) tx.objectStore('outbox').put(op); });
}

export function logAdd(entry) {
  return run('log', 'readwrite', async (tx) => {
    const store = tx.objectStore('log');
    store.add({ at: Date.now(), ...entry });
    const keys = await reqp(store.getAllKeys());
    if (keys.length > 150) for (const k of keys.slice(0, keys.length - 150)) store.delete(k);
  });
}

export function logAll() {
  return run('log', 'readonly', (tx) => reqp(tx.objectStore('log').getAll()));
}

// Limpa a sessão do aparelho. Nunca apaga o histórico, nem as filas guardadas de outras contas
// ("parked:") e as marcas do histórico ("histBase:").
export function wipe({ keep = [], keepPrefix = ['parked:', 'histBase:'] } = {}) {
  // ler o que fica e apagar o resto na MESMA transação: ou limpa tudo certinho, ou nada muda
  return run(['kv', 'outbox', 'log'], 'readwrite', async (tx) => {
    const kv = tx.objectStore('kv');
    const keys = await reqp(kv.getAllKeys());
    const keepKeys = keys.filter((k) => keep.includes(k) || (typeof k === 'string' && keepPrefix.some((p) => k.startsWith(p))));
    const values = await Promise.all(keepKeys.map((k) => reqp(kv.get(k))));
    kv.clear();
    tx.objectStore('outbox').clear();
    tx.objectStore('log').clear();
    keepKeys.forEach((k, i) => { if (values[i] != null) kv.put(values[i], k); });
  });
}
