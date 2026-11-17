// Armazenamento local persistente (IndexedDB).
//  kv     -> sessão, último estado recebido do servidor, brejos, configurações
//  outbox -> fila de operações ainda não confirmadas pelo servidor (ordem preservada)
//  log    -> histórico de eventos de sincronização (para a demonstração)
const DB_NAME = 'pererecario';
const VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const reqp = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function kvGet(key, fallback = null) {
  const db = await open();
  const v = await reqp(db.transaction('kv').objectStore('kv').get(key));
  return v === undefined ? fallback : v;
}

export async function kvSet(key, value) {
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  return done(tx);
}

export async function outboxAll() {
  const db = await open();
  return reqp(db.transaction('outbox').objectStore('outbox').getAll());
}

// Grava a operação e (opcionalmente) valores no kv na MESMA transação:
// ou os dois ficam salvos, ou nenhum.
export async function enqueue(op, kvWrites = {}, { replaceSeq } = {}) {
  const db = await open();
  const tx = db.transaction(['outbox', 'kv'], 'readwrite');
  const out = tx.objectStore('outbox');
  if (replaceSeq != null) out.delete(replaceSeq);
  const r = out.add(op);
  for (const [k, v] of Object.entries(kvWrites)) tx.objectStore('kv').put(v, k);
  const seq = await reqp(r);
  await done(tx);
  return seq;
}

export async function outboxRemove(seqs, kvWrites = {}) {
  const db = await open();
  const tx = db.transaction(['outbox', 'kv'], 'readwrite');
  for (const s of seqs) tx.objectStore('outbox').delete(s);
  for (const [k, v] of Object.entries(kvWrites)) tx.objectStore('kv').put(v, k);
  return done(tx);
}

export async function outboxUpdate(ops) {
  const db = await open();
  const tx = db.transaction('outbox', 'readwrite');
  for (const op of ops) tx.objectStore('outbox').put(op);
  return done(tx);
}

export async function logAdd(entry) {
  const db = await open();
  const tx = db.transaction('log', 'readwrite');
  const store = tx.objectStore('log');
  store.add({ at: Date.now(), ...entry });
  const keys = await reqp(store.getAllKeys());
  if (keys.length > 150) for (const k of keys.slice(0, keys.length - 150)) store.delete(k);
  return done(tx);
}

export async function logAll() {
  const db = await open();
  return reqp(db.transaction('log').objectStore('log').getAll());
}

export async function wipe({ keep = [] } = {}) {
  const db = await open();
  const kept = {};
  for (const k of keep) kept[k] = await kvGet(k);
  const tx = db.transaction(['kv', 'outbox', 'log'], 'readwrite');
  tx.objectStore('kv').clear();
  tx.objectStore('outbox').clear();
  tx.objectStore('log').clear();
  for (const [k, v] of Object.entries(kept)) if (v != null) tx.objectStore('kv').put(v, k);
  return done(tx);
}
