// Camada de banco de dados com dois motores e o mesmo SQL:
//  - SQLite (node:sqlite, embutido no Node 22) para rodar localmente e nos testes;
//  - PostgreSQL (pacote "pg") quando a variável DATABASE_URL existe (ex.: Render).
// O SQL usa placeholders $1, $2...; no SQLite eles viram ?1, ?2...
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'frog_leaf',
    avatar_ts BIGINT NOT NULL DEFAULT 0,
    friend_code TEXT NOT NULL UNIQUE,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS brejos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    radius DOUBLE PRECISION NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    spawn_id TEXT NOT NULL,
    species_id TEXT NOT NULL,
    size_cm DOUBLE PRECISION NOT NULL,
    kind TEXT NOT NULL,
    brejo_id TEXT,
    friend_id TEXT,
    expedition_id TEXT,
    caught_at BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    received_at BIGINT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    favorite_ts BIGINT NOT NULL DEFAULT 0,
    UNIQUE (player_id, spawn_id)
  )`,
  `CREATE TABLE IF NOT EXISTS expeditions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    started_at BIGINT NOT NULL,
    ended_at BIGINT,
    status TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expedition_distance (
    expedition_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    meters DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (expedition_id, device_id)
  )`,
  `CREATE TABLE IF NOT EXISTS friendships (
    player_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (player_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS operations (
    op_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    result TEXT NOT NULL,
    client_ts BIGINT NOT NULL,
    received_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conflicts (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    spawn_id TEXT NOT NULL,
    kept_capture_id TEXT NOT NULL,
    kept_device TEXT NOT NULL,
    kept_at BIGINT NOT NULL,
    discarded_capture_id TEXT NOT NULL,
    discarded_device TEXT NOT NULL,
    discarded_at BIGINT NOT NULL,
    resolved_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL,
    pay INTEGER NOT NULL,
    mode TEXT NOT NULL,
    done_at BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    received_at BIGINT NOT NULL,
    UNIQUE (player_id, job_id)
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    item TEXT NOT NULL,
    price INTEGER NOT NULL,
    bought_at BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    received_at BIGINT NOT NULL,
    UNIQUE (player_id, item)
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    capture_id TEXT NOT NULL,
    species_id TEXT NOT NULL,
    price INTEGER NOT NULL,
    sold_at BIGINT NOT NULL,
    device_id TEXT NOT NULL,
    received_at BIGINT NOT NULL,
    UNIQUE (player_id, capture_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_captures_player ON captures (player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expeditions_player ON expeditions (player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_operations_received ON operations (received_at)`,
];

// Fila simples: só uma transação de escrita por vez. Evita intercalar comandos
// de requisições concorrentes e elimina corridas na verificação de conflitos.
function mutex() {
  let last = Promise.resolve();
  return (fn) => {
    const run = last.then(fn, fn);
    last = run.then(() => {}, () => {});
    return run;
  };
}

async function openSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const conv = (sql) => sql.replace(/\$(\d+)/g, '?$1');
  const cache = new Map();
  const prep = (sql) => {
    let st = cache.get(sql);
    if (!st) { st = raw.prepare(conv(sql)); cache.set(sql, st); }
    return st;
  };
  const clean = (rows) => rows.map((r) => ({ ...r }));
  const exec = {
    async query(sql, params = []) { return clean(prep(sql).all(...params)); },
    async one(sql, params = []) { const r = prep(sql).get(...params); return r ? { ...r } : null; },
    async run(sql, params = []) { return { changes: Number(prep(sql).run(...params).changes) }; },
  };
  const lock = mutex();
  return {
    kind: 'sqlite',
    ...exec,
    tx(fn) {
      return lock(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try { const out = await fn(exec); raw.exec('COMMIT'); return out; }
        catch (e) { try { raw.exec('ROLLBACK'); } catch {} throw e; }
      });
    },
    async close() { raw.close(); },
  };
}

function withoutSslParams(url) {
  try {
    const u = new URL(url);
    const keys = ['sslmode', 'channel_binding', 'sslrootcert'].filter((k) => u.searchParams.has(k));
    if (!keys.length) return url;
    for (const k of keys) u.searchParams.delete(k);
    return u.toString();
  } catch { return url; }
}

async function openPostgres(url) {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT -> number
  // SSL: desligado no próprio computador; certificado interno no Render; verificado nos demais
  // (Neon, Supabase etc. exigem SSL com certificado válido).
  const local = /localhost|127\.0\.0\.1/.test(url) || process.env.PGSSL === 'off' || /sslmode=disable/.test(url);
  const ssl = local ? false : (url.includes('.render.com') ? { rejectUnauthorized: false } : true);
  const pool = new pg.Pool({
    connectionString: withoutSslParams(url),   // o SSL é decidido acima, não pela URL
    ssl,
    max: 5,
    idleTimeoutMillis: 30000,        // solta conexões paradas antes de o banco gratuito "dormir"
    connectionTimeoutMillis: 15000,  // o banco que estava dormindo leva alguns segundos para acordar
  });
  // Uma conexão parada que cai (o banco reiniciou ou dormiu) não pode derrubar o servidor:
  // o pool abre outra na próxima consulta.
  pool.on('error', (e) => console.warn('Postgres: uma conexão parada caiu e será reaberta:', e.message));
  const wrap = (client) => ({
    async query(sql, params = []) { return (await client.query(sql, params)).rows; },
    async one(sql, params = []) { return (await client.query(sql, params)).rows[0] || null; },
    async run(sql, params = []) { return { changes: (await client.query(sql, params)).rowCount }; },
  });
  const lock = mutex();
  return {
    kind: 'postgres',
    ...wrap(pool),
    tx(fn) {
      return lock(async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn(wrap(client));
          await client.query('COMMIT');
          return out;
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch {}
          throw e;
        } finally { client.release(); }
      });
    },
    async close() { await pool.end(); },
  };
}

// Colunas adicionadas depois da primeira versão (bancos já existentes recebem via ALTER TABLE)
const MIGRATIONS = [
  "ALTER TABLE players ADD COLUMN look TEXT NOT NULL DEFAULT 'froghood-masculino-clara'",
  'ALTER TABLE players ADD COLUMN look_ts BIGINT NOT NULL DEFAULT 0',
  "ALTER TABLE captures ADD COLUMN mode TEXT NOT NULL DEFAULT 'gps'",
  'ALTER TABLE players ADD COLUMN vehicle TEXT',
  'ALTER TABLE players ADD COLUMN vehicle_ts BIGINT NOT NULL DEFAULT 0',
  // contas por e-mail e "Continuar com Google" (o usuário antigo continua valendo por dentro)
  'ALTER TABLE players ADD COLUMN email TEXT',
  'ALTER TABLE players ADD COLUMN google_sub TEXT',
  'ALTER TABLE players ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_email ON players (email)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google ON players (google_sub)',
];

export async function openDb({ url = process.env.DATABASE_URL, file = process.env.SQLITE_PATH || 'data/pererecario.db' } = {}) {
  const db = url ? await openPostgres(url) : await openSqlite(file);
  for (const stmt of SCHEMA) await db.run(stmt);
  for (const stmt of MIGRATIONS) {
    try { await db.run(stmt); } catch (e) {
      if (!/duplicate column|already exists/i.test(e.message)) throw e;
    }
  }
  return db;
}
