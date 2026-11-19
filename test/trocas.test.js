// Trocas de pererecas entre amigos e Brejais por novo parceiro.
// Fluxo: convidar → o amigo aceita → cada um escolhe a perereca que vai dar → troca na hora em que a
// segunda escolha chega. Tudo por operações na fila (funciona offline), com os conflitos decididos no servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { spawnsFor, windowOf, visibleInMode, BALANCO } from '../client/js/shared/game.js';

let clock = Date.UTC(2026, 10, 22, 14, 0, 0);
const now = () => clock;
const ADMIN = 'chave-das-trocas';
let db, app, server, base, brejo;
const names = [];

before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '', file: ':memory:' });
  app = await createApp({ db, adminKey: ADMIN, tokenSecret: 's', now, quiet: true, mailer: null });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await call('POST', '/api/admin/brejos', { name: 'Lago das trocas', lat: -23.2, lng: -50.5, radius: 40 }, { 'X-Admin-Key': ADMIN });
  brejo = r.body.brejos.find((b) => b.id === r.body.id);
});
after(async () => {
  server.close();
  if (process.env.TEST_DATABASE_URL) {
    for (const n of names) {
      const p = await db.one('SELECT id FROM players WHERE username=$1', [n]);
      if (!p) continue;
      for (const t of ['captures', 'operations', 'sales', 'friendships', 'expeditions']) await db.run(`DELETE FROM ${t} WHERE player_id=$1`, [p.id]);
      await db.run('DELETE FROM friendships WHERE friend_id=$1', [p.id]);
      await db.run('DELETE FROM trades WHERE from_id=$1 OR to_id=$1', [p.id]);
      await db.run('DELETE FROM players WHERE id=$1', [p.id]);
    }
    await db.run("DELETE FROM brejos WHERE name='Lago das trocas'");
  }
  await db.close();
});

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const op = (type, payload) => ({ opId: crypto.randomUUID(), type, ts: clock, payload });
async function player(tag) {
  clock += 61_000;
  const username = `tr_${tag}_${crypto.randomUUID().slice(0, 6)}`;
  names.push(username);
  const r = await call('POST', '/api/auth/register', { username, password: 'senha123', displayName: tag });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = { id: r.body.player.id, token: r.body.token, dev: `cel-${tag}` };
  p.sync = (ops = []) => call('POST', '/api/sync', { deviceId: p.dev, ops }, { Authorization: `Bearer ${p.token}` });
  p.get = (path) => call('GET', path, null, { Authorization: `Bearer ${p.token}` });
  return p;
}
// pega n pererecas no brejo de teste e devolve os ids das capturas
async function catchFrogs(p, n) {
  const spawns = spawnsFor(brejo, windowOf(clock), app.catalog, p.id).filter((s) => visibleInMode(s, 'gps')).slice(0, n);
  const ops = spawns.map((s) => op('capture', { captureId: crypto.randomUUID(), spawnId: s.id, speciesId: s.speciesId, sizeCm: s.sizeCm, caughtAt: clock, lat: s.lat, lng: s.lng }));
  const r = await p.sync(ops);
  assert.deepEqual(r.body.results.map((x) => x.status), ops.map(() => 'applied'));
  return ops.map((o) => o.payload.captureId);
}
async function befriend(a, b) {
  const r = await a.sync([op('friend.add', { friendId: b.id, at: clock })]);
  assert.equal(r.body.results[0].status, 'applied');
}
const tradeOf = async (p, id) => (await p.sync()).body.state.trades.find((t) => t.id === id);
const bag = (state) => state.captures.filter((c) => !c.tradedAt);

test('cada novo parceiro de brejo dá Brejais aos dois; perfil do amigo mostra nível, XP e ouro', async () => {
  const a = await player('Ana');
  const b = await player('Beto');
  const c = await player('Caio');
  await catchFrogs(b, 2);
  assert.equal((await a.get(`/api/friends/profile?id=${b.id}`)).status, 404, 'ainda não são amigos');
  await befriend(a, b);
  await befriend(c, a);
  const prof = await a.get(`/api/friends/profile?id=${b.id}`);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.displayName, 'Beto');
  assert.ok(prof.body.xp > 0 && prof.body.level >= 1);
  assert.equal(prof.body.captures, 2);
  assert.equal(prof.body.gold, BALANCO.porAmigo);         // Beto tem 1 parceiro
  const rk = await a.get('/api/ranking');
  const goldOf = (id) => rk.body.boards.gold.top.find((x) => x.id === id)?.gold;
  assert.equal(goldOf(a.id), 2 * BALANCO.porAmigo);      // Ana tem 2 parceiros
  // adicionar de novo não paga de novo
  await befriend(a, b);
  assert.equal((await a.get(`/api/friends/profile?id=${c.id}`)).body.gold, BALANCO.porAmigo);
});

test('troca completa: convida, o amigo aceita, cada um escolhe e as pererecas trocam de dono', async () => {
  const a = await player('Duda');
  const b = await player('Enzo');
  const [ax] = await catchFrogs(a, 1);
  const [by] = await catchFrogs(b, 1);
  await befriend(a, b);
  const xpBefore = (await a.get('/api/ranking')).body.boards.xp.me.xp;
  const id = crypto.randomUUID();
  assert.equal((await a.sync([op('trade.offer', { tradeId: id, friendId: b.id, at: clock })])).body.results[0].status, 'applied');
  const seen = await tradeOf(b, id);
  assert.equal(seen.status, 'invited');
  assert.equal(seen.dir, 'in');
  assert.equal(seen.friendName, 'Duda');
  // o amigo não escolhe antes de aceitar; quem convidou já pode escolher
  assert.equal((await b.sync([op('trade.pick', { tradeId: id, captureId: by })])).body.results[0].status, 'conflict');
  assert.equal((await a.sync([op('trade.pick', { tradeId: id, captureId: ax })])).body.results[0].status, 'applied');
  assert.equal((await b.sync([op('trade.respond', { tradeId: id, accept: true })])).body.results[0].status, 'applied');
  const open = await tradeOf(b, id);
  assert.equal(open.status, 'open');
  assert.equal(open.theirs.captureId, ax, 'o amigo vê o que vai receber antes de escolher');
  assert.equal(open.mine, null);
  // a segunda escolha fecha a troca
  const pick = op('trade.pick', { tradeId: id, captureId: by });
  const r = await b.sync([pick]);
  assert.equal(r.body.results[0].status, 'applied');
  assert.equal(r.body.results[0].trade, 'done');
  assert.equal(r.body.state.trades.find((t) => t.id === id).status, 'done');
  const sa = (await a.sync()).body.state;
  const sb = r.body.state;
  // cada um tem a perereca do outro (tipo "troca") e a sua saiu da bolsa
  const gotA = sa.captures.find((c) => c.kind === 'trade');
  const gotB = sb.captures.find((c) => c.kind === 'trade');
  assert.equal(gotA.speciesId, sb.captures.find((c) => c.id === by).speciesId);
  assert.equal(gotB.speciesId, sa.captures.find((c) => c.id === ax).speciesId);
  assert.equal(gotA.friendId, b.id);
  assert.ok(sa.captures.find((c) => c.id === ax).tradedAt);
  assert.deepEqual(bag(sa).map((c) => c.id), [gotA.id]);
  // XP e contagem de capturas não mudam: quem pegou continua com o XP; a recebida não dá XP
  const after = (await a.get('/api/ranking')).body.boards;
  assert.equal(after.xp.me.xp, xpBefore);
  assert.equal(after.captures.me.captures, 1);
  // reenviar a escolha não troca de novo; vender a que saiu não dá dinheiro
  assert.equal((await b.sync([pick])).body.results[0].status, 'duplicate');
  assert.equal((await b.sync()).body.state.captures.filter((c) => c.kind === 'trade').length, 1);
  const sell = await a.sync([op('frog.sell', { sellId: crypto.randomUUID(), captureId: ax, soldAt: clock })]);
  assert.equal(sell.body.results[0].status, 'rejected');
  // e a perereca recebida pode ser trocada de novo depois
  const id2 = crypto.randomUUID();
  await a.sync([op('trade.offer', { tradeId: id2, friendId: b.id, at: clock })]);
  assert.equal((await a.sync([op('trade.pick', { tradeId: id2, captureId: gotA.id })])).body.results[0].status, 'applied');
});

test('recusar, cancelar, convite repetido e escolher perereca que não pode', async () => {
  const a = await player('Fabi');
  const b = await player('Gabi');
  const [a1, a2] = await catchFrogs(a, 2);
  const [b1] = await catchFrogs(b, 1);
  await befriend(a, b);
  // recusa
  const t1 = crypto.randomUUID();
  await a.sync([op('trade.offer', { tradeId: t1, friendId: b.id, at: clock })]);
  // só uma troca aberta por dupla: o segundo convite (de qualquer lado) perde
  assert.equal((await b.sync([op('trade.offer', { tradeId: crypto.randomUUID(), friendId: a.id, at: clock })])).body.results[0].status, 'conflict');
  await b.sync([op('trade.respond', { tradeId: t1, accept: false })]);
  assert.equal((await tradeOf(a, t1)).status, 'declined');
  // cancelada por quem convidou: a resposta que chega depois (estava offline) não vale
  const t2 = crypto.randomUUID();
  await a.sync([op('trade.offer', { tradeId: t2, friendId: b.id, at: clock })]);
  await a.sync([op('trade.cancel', { tradeId: t2 })]);
  const late = await b.sync([op('trade.respond', { tradeId: t2, accept: true })]);
  assert.equal(late.body.results[0].status, 'conflict');
  const t2b = await tradeOf(b, t2);
  assert.equal(t2b.status, 'cancelled');
  assert.equal(t2b.cancelledByMe, false);
  // favorita não entra; perereca de outro jogador também não
  const t3 = crypto.randomUUID();
  await a.sync([op('trade.offer', { tradeId: t3, friendId: b.id, at: clock })]);
  const fav = (await a.sync()).body.state.captures.find((c) => c.id === a1);
  await a.sync([op('favorite', { spawnId: fav.spawnId, favorite: true, ts: clock })]);
  const r1 = await a.sync([op('trade.pick', { tradeId: t3, captureId: a1 })]);
  assert.equal(r1.body.results[0].status, 'rejected');
  assert.match(r1.body.results[0].error, /favorita/);
  assert.equal((await a.sync([op('trade.pick', { tradeId: t3, captureId: b1 })])).body.results[0].status, 'rejected');
  // quem não é parceiro não convida
  const c = await player('Hugo');
  assert.equal((await c.sync([op('trade.offer', { tradeId: crypto.randomUUID(), friendId: a.id, at: clock })])).body.results[0].status, 'rejected');
  // escolher, mudar de ideia e escolher outra antes do amigo
  assert.equal((await a.sync([op('trade.pick', { tradeId: t3, captureId: a2 })])).body.results[0].status, 'applied');
  assert.equal((await tradeOf(b, t3)).theirs.captureId, a2);
});

test('perereca vendida no meio do caminho: a troca é desfeita e ninguém perde nada', async () => {
  const a = await player('Iara');
  const b = await player('Joca');
  const [ax] = await catchFrogs(a, 1);
  const [by] = await catchFrogs(b, 1);
  await befriend(a, b);
  const id = crypto.randomUUID();
  await a.sync([op('trade.offer', { tradeId: id, friendId: b.id, at: clock }), op('trade.pick', { tradeId: id, captureId: ax })]);
  await b.sync([op('trade.respond', { tradeId: id, accept: true })]);
  // Iara vende a perereca escolhida num outro celular (offline, a venda chega antes)
  const sold = await a.sync([op('frog.sell', { sellId: crypto.randomUUID(), captureId: ax, soldAt: clock })]);
  assert.equal(sold.body.results[0].status, 'applied');
  const r = await b.sync([op('trade.pick', { tradeId: id, captureId: by })]);
  assert.equal(r.body.results[0].status, 'conflict');
  const t = r.body.state.trades.find((x) => x.id === id);
  assert.equal(t.status, 'failed');
  assert.ok(t.reason);
  assert.equal(r.body.state.captures.filter((c) => c.kind === 'trade').length, 0);
  assert.ok(!r.body.state.captures.find((c) => c.id === by).tradedAt, 'a perereca do Joca continua com ele');
});

test('convite parado vence depois do prazo', async () => {
  const a = await player('Kim');
  const b = await player('Lua');
  await befriend(a, b);
  const id = crypto.randomUUID();
  await a.sync([op('trade.offer', { tradeId: id, friendId: b.id, at: clock })]);
  clock += (BALANCO.trocaValeHoras + 1) * 3600_000;
  assert.equal((await tradeOf(b, id)).status, 'expired');
  assert.equal((await b.sync([op('trade.respond', { tradeId: id, accept: true })])).body.results[0].status, 'conflict');
  // vencida não segura ninguém: dá para convidar de novo
  assert.equal((await a.sync([op('trade.offer', { tradeId: crypto.randomUUID(), friendId: b.id, at: clock })])).body.results[0].status, 'applied');
});
