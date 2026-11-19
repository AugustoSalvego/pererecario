// Testes que só fazem sentido num PostgreSQL de verdade (o banco de produção).
// Rodam quando existe TEST_DATABASE_URL; o GitHub Actions sobe um Postgres e roda sempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';

const url = process.env.TEST_DATABASE_URL;
const withApp = (u, name) => `${u}${u.includes('?') ? '&' : '?'}application_name=${name}`;

test('Postgres: conexões que caem (banco reiniciou ou dormiu) não derrubam o servidor', { skip: !url && 'sem TEST_DATABASE_URL' }, async () => {
  const db = await openDb({ url: withApp(url, 'pererecario-vitima') });
  const killer = await openDb({ url: withApp(url, 'pererecario-carrasco') });
  // várias conexões abertas ao mesmo tempo, que depois ficam paradas no pool
  await Promise.all([1, 2, 3].map(() => db.query('SELECT pg_sleep(0.05)')));
  // derruba todas, como acontece quando o banco reinicia ou o Neon põe o banco para dormir
  const killed = await killer.query(
    "SELECT pg_terminate_backend(pid) AS ok FROM pg_stat_activity WHERE application_name = 'pererecario-vitima'",
  );
  assert.ok(killed.length >= 1, 'nenhuma conexão para derrubar');
  await new Promise((r) => setTimeout(r, 300));   // sem o pool.on('error'), o processo cairia aqui
  // a próxima consulta abre uma conexão nova e funciona
  const row = await db.one('SELECT 1 AS um');
  assert.equal(Number(row.um), 1);
  // e uma transação inteira também
  const n = await db.tx(async (q) => (await q.query('SELECT 2 AS dois'))[0].dois);
  assert.equal(Number(n), 2);
  await db.close();
  await killer.close();
});
