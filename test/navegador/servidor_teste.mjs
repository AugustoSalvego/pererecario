// Servidor SÓ para o teste de resistência no navegador (nunca use em produção).
// É o jogo de verdade, com um banco SQLite temporário, mais duas rotas de teste:
//   /__teste/desastre?email=...&segundos=N  apaga do banco o que esse jogador mandou nos últimos N segundos
//                                         (como se o banco tivesse sido restaurado de um backup antigo)
//   /__teste/contagem?email=...           capturas que o servidor tem desse jogador
// Uso: node test/navegador/servidor_teste.mjs   (porta 8099, chave do painel "teste-resistencia")
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../server/db.js';
import { createApp } from '../../server/app.js';

const file = path.join(os.tmpdir(), `pererecario-resistencia-${Date.now()}.db`);
const db = await openDb({ url: '', file });
const app = await createApp({ db, adminKey: 'teste-resistencia', tokenSecret: 'teste', mailer: null, googleClientId: null });

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__teste/desastre' || u.pathname === '/__teste/contagem') {
    (async () => {
      const p = await db.one('SELECT id FROM players WHERE email=$1', [u.searchParams.get('email')]);
      if (!p) throw new Error('jogador não encontrado');
      if (u.pathname === '/__teste/desastre') {
        const since = Date.now() - Number(u.searchParams.get('segundos')) * 1000;
        for (const t of ['captures', 'jobs', 'sales', 'purchases', 'operations']) {
          await db.run(`DELETE FROM ${t} WHERE player_id=$1 AND received_at > $2`, [p.id, since]).catch(() => {});
        }
      }
      const caps = await db.query('SELECT spawn_id FROM captures WHERE player_id=$1', [p.id]);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ captures: caps.length, spawns: caps.map((c) => c.spawn_id) }));
    })().catch((e) => { res.writeHead(500); res.end(String(e.message)); });
    return;
  }
  app.handler(req, res);
}).listen(8099, () => console.log(`servidor de teste em http://localhost:8099 (banco ${file})`));
