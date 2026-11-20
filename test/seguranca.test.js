// Painel /admin protegido e contas da organização (demonstração).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let clock = Date.UTC(2026, 10, 21, 12, 0, 0);
const now = () => clock;
let db, server, base, off, offBase;

async function cleanup() {
  await db.run("DELETE FROM players WHERE email LIKE '%@seguranca.test'");
}

before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '', file: ':memory:' });
  if (process.env.TEST_DATABASE_URL) await cleanup();
  const app = await createApp({ db, adminKey: 'chave-forte-de-teste', tokenSecret: 's', now, quiet: true, mailer: null });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  // painel desligado (hospedado sem ADMIN_KEY forte)
  const app2 = await createApp({ db, adminKey: null, tokenSecret: 's', now, quiet: true, mailer: null });
  off = app2.server();
  await new Promise((r) => off.listen(0, r));
  offBase = `http://127.0.0.1:${off.address().port}`;
});
after(async () => {
  server.close(); off.close();
  if (process.env.TEST_DATABASE_URL) await cleanup();
  await db.close();
});

let ipN = 1;
// quem cria conta na tela marca "Li e concordo com os termos"; os testes fazem o mesmo, salvo quando dizem o contrário
const withTerms = (p, body) => (body && (p === '/api/auth/register' || p === '/api/auth/google') && body.acceptTerms === undefined ? { ...body, acceptTerms: true } : body);
async function call(method, p, body, { at = base, key, token, ip = `10.9.0.${ipN}` } = {}) {
  body = withTerms(p, body);
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
  if (key != null) headers['X-Admin-Key'] = key;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(at + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('painel desligado quando não há chave forte', async () => {
  const r = await call('GET', '/api/admin/overview', null, { at: offBase, key: 'brejo-admin' });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Painel desligado/);
  assert.equal((await call('GET', '/api/admin/backup', null, { at: offBase, key: '' })).status, 403);
  // o jogo continua funcionando
  assert.equal((await call('GET', '/api/config', null, { at: offBase })).status, 200);
});

test('chave errada 20 vezes bloqueia o aparelho por 10 minutos, até com a chave certa', async () => {
  ipN++;
  assert.equal((await call('GET', '/api/admin/overview', null, { key: 'chave-forte-de-teste' })).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await call('GET', '/api/admin/overview', null, { key: `chute${i}` })).status, 403);
  const locked = await call('GET', '/api/admin/overview', null, { key: 'chave-forte-de-teste' });
  assert.equal(locked.status, 429);
  // outro aparelho não é afetado
  assert.equal((await call('GET', '/api/admin/overview', null, { key: 'chave-forte-de-teste', ip: '10.9.9.9' })).status, 200);
  clock += 10 * 60_000 + 1000;
  assert.equal((await call('GET', '/api/admin/overview', null, { key: 'chave-forte-de-teste' })).status, 200);
});

test('conta da organização: some do ranking dos outros, mas continua sendo uma conta normal', async () => {
  ipN++;
  clock += 61_000;
  const demo = await call('POST', '/api/auth/register', { displayName: 'Demo', email: 'demo@seguranca.test', password: 'senha-da-demo' });
  const ana = await call('POST', '/api/auth/register', { displayName: 'Ana', email: 'ana@seguranca.test', password: 'senha-da-ana' });
  assert.equal(demo.status, 200);
  assert.equal(ana.status, 200);
  const key = 'chave-forte-de-teste';
  assert.equal((await call('POST', '/api/admin/staff', { user: 'demo@seguranca.test' })).status, 403);
  assert.equal((await call('POST', '/api/admin/staff', { user: 'ninguem@seguranca.test' }, { key })).status, 404);
  const mark = await call('POST', '/api/admin/staff', { user: 'DEMO@seguranca.test' }, { key });
  assert.equal(mark.status, 200);
  assert.equal(mark.body.staff, true);

  const seenByAna = await call('GET', '/api/ranking', null, { token: ana.body.token });
  const ids = (b) => b.top.map((r) => r.id);
  for (const board of ['xp', 'captures', 'gold']) assert.ok(!ids(seenByAna.body.boards[board]).includes(demo.body.player.id), board);
  assert.equal(seenByAna.body.boards.xp.me.id, ana.body.player.id);
  // a própria conta da organização se vê (dá para mostrar o ranking na apresentação)
  const seenByDemo = await call('GET', '/api/ranking', null, { token: demo.body.token });
  assert.ok(ids(seenByDemo.body.boards.xp).includes(demo.body.player.id));
  assert.equal(seenByDemo.body.boards.xp.me.id, demo.body.player.id);
  // e entra normalmente com a senha dela
  assert.equal((await call('POST', '/api/auth/login', { email: 'demo@seguranca.test', password: 'senha-da-demo' })).status, 200);

  const adm = await call('GET', '/api/admin/overview', null, { key });
  assert.equal(adm.body.counts.staff, 1);
  assert.equal(adm.body.counts.external, adm.body.counts.players - 1);
  assert.equal(adm.body.players.find((p) => p.email === 'demo@seguranca.test').staff, true);

  // desmarcar: volta ao ranking
  assert.equal((await call('POST', '/api/admin/staff', { user: 'demo@seguranca.test', staff: false }, { key })).body.staff, false);
  const again = await call('GET', '/api/ranking', null, { token: ana.body.token });
  assert.equal(again.body.players, seenByAna.body.players + 1);
});

test('admin: velocidade no modo controle e Brejais dados a uma conta', async () => {
  ipN++;
  clock += 61_000;
  const lu = await call('POST', '/api/auth/register', { displayName: 'Lu', email: 'lu@seguranca.test', password: 'senha-da-lu' });
  assert.equal(lu.status, 200);
  const key = 'chave-forte-de-teste';
  const token = lu.body.token;
  const snap = async () => (await call('POST', '/api/sync', { deviceId: 'lu1', ops: [] }, { token })).body.state;
  assert.equal((await snap()).player.speedMult, 1);

  // velocidade: só com a chave, só valores permitidos
  assert.equal((await call('POST', '/api/admin/speed', { user: 'lu@seguranca.test', mult: 10 })).status, 403);
  assert.equal((await call('POST', '/api/admin/speed', { user: 'lu@seguranca.test', mult: 7 }, { key })).status, 400);
  assert.equal((await call('POST', '/api/admin/speed', { user: 'ninguem@seguranca.test', mult: 10 }, { key })).status, 404);
  assert.equal((await call('POST', '/api/admin/speed', { user: 'LU@seguranca.test', mult: 10 }, { key })).body.mult, 10);
  assert.equal((await snap()).player.speedMult, 10);

  // Brejais: sem saldo não compra; depois de receber, compra
  const buy = (n) => call('POST', '/api/sync', { deviceId: 'lu1', ops: [{ opId: `compra-${n}`, type: 'shop.buy', ts: clock, payload: { buyId: `b-${n}`, item: 'hatch', boughtAt: clock } }] }, { token });
  assert.equal((await buy(1)).body.results[0].status, 'rejected');
  assert.equal((await call('POST', '/api/admin/grant', { user: 'lu@seguranca.test', amount: 200 })).status, 403);
  assert.equal((await call('POST', '/api/admin/grant', { user: 'lu@seguranca.test', amount: 0 }, { key })).status, 400);
  assert.equal((await call('POST', '/api/admin/grant', { user: 'lu@seguranca.test', amount: 1.5 }, { key })).status, 400);
  const g = await call('POST', '/api/admin/grant', { user: 'lu@seguranca.test', amount: 200, note: 'teste' }, { key });
  assert.equal(g.status, 200);
  const s1 = await snap();
  assert.equal(s1.grants.length, 1);
  assert.equal(s1.grants[0].amount, 200);
  assert.equal(s1.grants[0].note, 'teste');
  assert.equal((await buy(2)).body.results[0].status, 'applied');
  // dar Brejais não mexe no ranking de "Brejais ganhos"
  const rank = await call('GET', '/api/ranking', null, { token });
  assert.equal(rank.body.boards.gold.me.gold, 0);

  // teletransporte: guarda o ponto e a hora do pedido para o jogo da conta aplicar
  assert.equal(s1.player.teleport, null);
  assert.equal((await call('POST', '/api/admin/teleport', { user: 'lu@seguranca.test', lat: -23.1, lng: -50.3 })).status, 403);
  assert.equal((await call('POST', '/api/admin/teleport', { user: 'lu@seguranca.test', lat: 123, lng: -50.3 }, { key })).status, 400);
  const tp = await call('POST', '/api/admin/teleport', { user: 'lu@seguranca.test', lat: -23.1068, lng: -50.3602 }, { key });
  assert.equal(tp.status, 200);
  const s2 = await snap();
  assert.deepEqual({ lat: s2.player.teleport.lat, lng: s2.player.teleport.lng }, { lat: -23.1068, lng: -50.3602 });
  assert.equal(s2.player.teleport.at, clock);
});

test('servidor hospedado sem ADMIN_KEY forte: o jogo sobe, o painel não abre nem com a chave padrão', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perereca-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, RENDER: 'true', ALLOW_SQLITE: '1', SQLITE_PATH: path.join(dir, 'x.db'), PORT: String(port), ADMIN_KEY: 'curta' };
  delete env.DATABASE_URL;
  delete env.BREVO_API_KEY;
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    for (let i = 0; i < 50 && !/rodando/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, /ADMIN_KEY ausente ou curta/);
    const at = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${at}/healthz`)).status, 200);
    for (const k of ['brejo-admin', 'curta']) {
      const r = await fetch(`${at}/api/admin/overview`, { headers: { 'X-Admin-Key': k } });
      assert.equal(r.status, 403);
      assert.match((await r.json()).error, /Painel desligado/);
    }
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('apagar conta a pedido do jogador (LGPD): some tudo, com confirmação', async () => {
  ipN++;
  clock += 61_000;
  const key = 'chave-forte-de-teste';
  const r = await call('POST', '/api/auth/register', { displayName: 'Saindo', email: 'saindo@seguranca.test', password: 'senha-saindo' });
  assert.equal(r.status, 200);
  await call('POST', '/api/sync', { deviceId: 'cel-s', ops: [{ opId: 'op-saindo-1', type: 'expedition.start', ts: clock, payload: { id: 'exp-saindo', startedAt: clock } }] }, { token: r.body.token });
  assert.equal((await call('POST', '/api/admin/delete-player', { user: 'saindo@seguranca.test', confirm: 'outro@seguranca.test' }, { key })).status, 400);
  assert.equal((await call('POST', '/api/admin/delete-player', { user: 'saindo@seguranca.test', confirm: 'saindo@seguranca.test' })).status, 403);
  const del = await call('POST', '/api/admin/delete-player', { user: 'saindo@seguranca.test', confirm: 'SAINDO@seguranca.test' }, { key });
  assert.equal(del.status, 200);
  assert.equal(await db.one("SELECT id FROM players WHERE email='saindo@seguranca.test'"), null);
  assert.equal(await db.one('SELECT op_id FROM operations WHERE player_id=$1', [r.body.player.id]), null);
  assert.equal(await db.one('SELECT id FROM expeditions WHERE player_id=$1', [r.body.player.id]), null);
  assert.equal((await call('POST', '/api/auth/login', { email: 'saindo@seguranca.test', password: 'senha-saindo' })).status, 401);
  // o aparelho dele recebe "sessão inválida" (e guarda a fila, sem apagar nada do celular)
  assert.equal((await call('POST', '/api/sync', { deviceId: 'cel-s', ops: [] }, { token: r.body.token })).status, 401);
});
