// Backup completo do banco em JSON (todas as tabelas) e restauração.
// Usado pelo endpoint GET /api/admin/backup (baixado todo dia pelo GitHub Actions, ver
// .github/workflows/backup.yml) e pelo script scripts/restaurar_backup.js.
// A restauração só acrescenta: linha que já existe (mesma chave) é mantida como está, então
// restaurar duas vezes, ou num banco que já tem parte dos dados, não duplica nada.

export const TABLES = [
  'players', 'brejos', 'captures', 'expeditions', 'expedition_distance', 'friendships',
  'operations', 'conflicts', 'settings', 'jobs', 'purchases', 'sales', 'trades',
];

export async function exportAll(db, { now = Date.now(), version = '' } = {}) {
  const tables = {};
  const counts = {};
  for (const t of TABLES) {
    tables[t] = await db.query(`SELECT * FROM ${t}`);
    counts[t] = tables[t].length;
  }
  return { app: 'pererecario', format: 1, version, createdAt: now, db: db.kind, counts, tables };
}

export async function importAll(db, data) {
  if (!data || data.app !== 'pererecario' || typeof data.tables !== 'object') {
    throw new Error('Esse arquivo não é um backup do Pererecário');
  }
  const added = {};
  await db.tx(async (q) => {
    for (const t of TABLES) {
      const rows = Array.isArray(data.tables[t]) ? data.tables[t] : [];
      let n = 0;
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => /^[a-z_]+$/.test(c));
        if (!cols.length) continue;
        const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO NOTHING`;
        const res = await q.run(sql, cols.map((c) => row[c]));
        n += res.changes || 0;
      }
      added[t] = n;
    }
  });
  return added;
}
