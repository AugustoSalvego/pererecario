// Testes do servidor: idempotência, conflitos, convergência e falhas.
// Rodar com: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { spawnsFor, windowOf, giftFor, dayOf, maskFromSpecies, pondsNear, brejosNear, distanceM } from '../client/js/shared/game.js';

let server, base, app, clock = Date.UTC(2026, 10, 18, 13, 0, 0);
const now = () => clock;
const ADMIN = 'teste-admin';

before(async () => {
  const db = await openDb({ url: '', file: ':memory:' });
  app = await createApp({ db, adminKey: ADMIN, tokenSecret: 'segredo-de-teste', now, quiet: true });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function newPlayer(name) {
  const r = await call('POST', '/api/auth/register', { username: name, password: 'senha123', displayName: name });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.player.id };
}

const auth = (p) => ({ Authorization: `Bearer ${p.token}` });
const sync = (p, deviceId, ops) => call('POST', '/api/sync', { deviceId, ops }, auth(p));

let brejo;
async function ensureBrejo() {
  if (brejo) return brejo;
  const r = await call('POST', '/api/admin/brejos', { name: 'Lago de teste', lat: -23.1, lng: -50.36, radius: 40 }, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 200);
  brejo = r.body.brejos.find((b) => b.id === r.body.id);
  return brejo;
}

function captureOp(spawn, at, extra = {}) {
  return {
    opId: crypto.randomUUID(), type: 'capture', ts: at,
    payload: { captureId: crypto.randomUUID(), spawnId: spawn.id, speciesId: spawn.speciesId, sizeCm: spawn.sizeCm, caughtAt: at, lat: spawn.lat, lng: spawn.lng, ...extra },
  };
}

test('cadastro, login e senha errada', async () => {
  await newPlayer('ana');
  const ok = await call('POST', '/api/auth/login', { username: 'ANA', password: 'senha123' });
  assert.equal(ok.status, 200);
  const bad = await call('POST', '/api/auth/login', { username: 'ana', password: 'errada' });
  assert.equal(bad.status, 401);
  const dup = await call('POST', '/api/auth/register', { username: 'ana', password: 'senha123', displayName: 'Ana' });
  assert.equal(dup.status, 409);
  const noauth = await call('POST', '/api/sync', { deviceId: 'x', ops: [] });
  assert.equal(noauth.status, 401);
});

test('brejo novo não pode nascer em cima nem do lado de outro', async () => {
  await ensureBrejo();
  const r = await call('POST', '/api/admin/brejos', { name: 'Colado', lat: -23.1003, lng: -50.36, radius: 30 }, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 409);
  const ok = await call('POST', '/api/admin/brejos', { name: 'Longe', lat: -23.1020, lng: -50.36, radius: 30 }, { 'X-Admin-Key': ADMIN });
  assert.equal(ok.status, 200);
});

test('pererecas de um brejo nascem afastadas entre si e da lagoinha', async () => {
  const b = await ensureBrejo();
  const { distanceM: dm, POND_CLEAR_M } = await import('../client/js/shared/game.js');
  for (let w = 0; w < 40; w++) {
    const sp = spawnsFor(b, windowOf(clock) + w, app.catalog);
    for (const s of sp) assert.ok(dm(s, b) >= POND_CLEAR_M - 0.5, 'em cima da lagoinha');
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) assert.ok(dm(sp[i], sp[j]) >= 8, 'pererecas coladas');
  }
});

test('lagoinhas automáticas em qualquer lugar: o servidor aceita, sem cadastro', async () => {
  const p = await newPlayer('nina');
  // um lugar qualquer, longe de todos os brejos cadastrados
  const here = { lat: 48.8584, lng: 2.2945 };
  const ponds = pondsNear(here, 400);
  assert.ok(ponds.length >= 12, `poucas lagoinhas: ${ponds.length}`);
  for (let i = 0; i < ponds.length; i++) for (let j = i + 1; j < ponds.length; j++) {
    assert.ok(distanceM(ponds[i], ponds[j]) >= ponds[i].radius + ponds[j].radius, 'lagoinhas sobrepostas');
  }
  const spawn = spawnsFor(ponds[0], windowOf(clock), app.catalog)[0];
  const ok = await sync(p, 'c1', [captureOp(spawn, clock)]);
  assert.equal(ok.body.results[0].status, 'applied', JSON.stringify(ok.body.results[0]));
  // id de lagoinha que não existe (o sorteio daquele ponto da grade deu "sem lagoinha") é recusado
  const fake = { ...spawn, id: spawn.id.replace(ponds[0].id, 'p1_99999999') };
  const bad = await sync(p, 'c1', [captureOp(fake, clock)]);
  assert.notEqual(bad.body.results[0].status, 'applied');
});

test('brejo cadastrado à mão esconde a lagoinha automática que está em cima dele', async () => {
  const p = await newPlayer('otto');
  const pond = pondsNear({ lat: -22.95, lng: -43.21 }, 300)[0];
  const r = await call('POST', '/api/admin/brejos', { name: 'Brejo da Sala', lat: pond.lat, lng: pond.lng + 0.0001, radius: 30 }, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 200);
  const shown = brejosNear(r.body.brejos, pond, 300);
  assert.ok(!shown.some((b) => b.id === pond.id), 'a automática deveria sumir');
  assert.ok(shown.some((b) => b.name === 'Brejo da Sala'));
  const spawn = spawnsFor(pond, windowOf(clock), app.catalog)[0];
  const res = await sync(p, 'c1', [captureOp(spawn, clock)]);
  assert.equal(res.body.results[0].status, 'rejected');
});

test('o servidor recalcula as mesmas pererecas que o cliente', async () => {
  const b = await ensureBrejo();
  const win = windowOf(clock);
  const a = spawnsFor(b, win, app.catalog);
  const again = spawnsFor({ ...b }, win, app.catalog);
  assert.deepEqual(a, again);
  assert.ok(a.length >= 3);
});

test('reenvio da mesma operação não duplica a captura (idempotência)', async () => {
  const p = await newPlayer('bia');
  const b = await ensureBrejo();
  const spawn = spawnsFor(b, windowOf(clock), app.catalog)[0];
  const op = captureOp(spawn, clock);
  const first = await sync(p, 'celular-1', [op]);
  assert.equal(first.body.results[0].status, 'applied');
  const second = await sync(p, 'celular-1', [op]);
  assert.equal(second.body.results[0].status, 'duplicate');
  const third = await sync(p, 'celular-1', [op, op]);
  assert.deepEqual(third.body.results.map((r) => r.status), ['duplicate', 'duplicate']);
  assert.equal(third.body.state.captures.length, 1);
});

test('captura inválida é rejeitada', async () => {
  const p = await newPlayer('caio');
  const b = await ensureBrejo();
  const spawn = spawnsFor(b, windowOf(clock), app.catalog)[1];
  const wrongSpecies = captureOp({ ...spawn, speciesId: spawn.speciesId === 'frog_star' ? 'frog_leaf' : 'frog_star' }, clock);
  const tooLate = captureOp(spawn, clock + 2 * 60 * 60 * 1000 - 1000);
  const tooFar = captureOp(spawn, clock, { lat: spawn.lat + 0.01 });
  const r = await sync(p, 'c1', [wrongSpecies, tooLate, tooFar]);
  assert.deepEqual(r.body.results.map((x) => x.status), ['rejected', 'rejected', 'rejected']);
  assert.equal(r.body.state.captures.length, 0);
});

test('conflito: mesma perereca em dois aparelhos offline -> vence a primeira captura, em qualquer ordem', async () => {
  const b = await ensureBrejo();
  const spawn = spawnsFor(b, windowOf(clock), app.catalog)[2];

  for (const order of [['A', 'B'], ['B', 'A']]) {
    const p = await newPlayer(`dani${order.join('')}`.toLowerCase());
    const ops = { A: captureOp(spawn, clock + 1000), B: captureOp(spawn, clock + 5000) }; // A pegou antes
    const dev = { A: 'aparelho-A', B: 'aparelho-B' };
    const r1 = await sync(p, dev[order[0]], [ops[order[0]]]);
    const r2 = await sync(p, dev[order[1]], [ops[order[1]]]);
    assert.equal(r1.body.results[0].status, 'applied');
    // o segundo a chegar: se for A (mais antigo) substitui; se for B, perde
    assert.equal(r2.body.results[0].status, order[1] === 'A' ? 'applied' : 'conflict');
    assert.ok(r2.body.results[0].conflict);
    const caps = r2.body.state.captures.filter((c) => c.spawnId === spawn.id);
    assert.equal(caps.length, 1, 'apenas uma captura por perereca');
    assert.equal(caps[0].id, ops.A.payload.captureId, 'a captura mais antiga é a que fica');
    assert.equal(caps[0].deviceId, 'aparelho-A');
  }
});

test('favorito usa "última escrita vence"', async () => {
  const p = await newPlayer('edu');
  const b = await ensureBrejo();
  const spawn = spawnsFor(b, windowOf(clock), app.catalog)[0];
  await sync(p, 'c1', [captureOp(spawn, clock)]);
  const fav = (v, ts) => ({ opId: crypto.randomUUID(), type: 'favorite', ts, payload: { spawnId: spawn.id, favorite: v, ts } });
  await sync(p, 'c1', [fav(true, clock + 20)]);
  const r = await sync(p, 'c2', [fav(false, clock + 10)]); // mais antiga: ignorada
  assert.equal(r.body.state.captures[0].favorite, true);
  const r2 = await sync(p, 'c2', [fav(false, clock + 30)]);
  assert.equal(r2.body.state.captures[0].favorite, false);
});

test('boneco escolhido sincroniza com "última escrita vence"', async () => {
  const p = await newPlayer('leo');
  const look = (v, ts) => ({ opId: crypto.randomUUID(), type: 'profile.look', ts, payload: { look: v, ts } });
  await sync(p, 'A', [look('explorer-escura', clock + 20)]);
  const r = await sync(p, 'B', [look('froghood-media', clock + 10)]);
  assert.equal(r.body.state.player.look, 'explorer-escura');
  const r2 = await sync(p, 'B', [look('froghood-feminino-media', clock + 40)]);
  assert.equal(r2.body.state.player.look, 'froghood-feminino-media');
  const bad = await sync(p, 'B', [look('dragao-azul', clock + 50)]);
  assert.equal(bad.body.results[0].status, 'rejected');
});

test('distância da expedição é um G-Counter por aparelho', async () => {
  const p = await newPlayer('fer');
  const id = crypto.randomUUID();
  const op = (type, payload) => ({ opId: crypto.randomUUID(), type, ts: clock, payload });
  await sync(p, 'A', [op('expedition.start', { id, startedAt: clock })]);
  await sync(p, 'A', [op('expedition.progress', { id, meters: 300, at: clock + 1 })]);
  await sync(p, 'B', [op('expedition.progress', { id, meters: 120, at: clock + 2 })]);
  await sync(p, 'A', [op('expedition.progress', { id, meters: 200, at: clock + 3 })]); // valor velho não diminui
  const r = await sync(p, 'B', [op('expedition.end', { id, endedAt: clock + 9, meters: 150 })]);
  const e = r.body.state.expeditions.find((x) => x.id === id);
  assert.deepEqual(e.distance, { A: 300, B: 150 });
  assert.equal(e.status, 'finished');
  const r2 = await sync(p, 'A', [op('expedition.end', { id, endedAt: clock + 5, meters: 310 })]);
  const e2 = r2.body.state.expeditions.find((x) => x.id === id);
  assert.equal(e2.endedAt, clock + 9, 'fim considerado é o mais tardio');
  assert.equal(e2.distance.A, 310);
});

test('QR code: amizade + perereca-presente (uma por amigo por dia)', async () => {
  const a = await newPlayer('gabi');
  const b = await newPlayer('hugo');
  const mask = maskFromSpecies(app.catalog, ['frog_star', 'frog_honey']);
  const gift = giftFor(a.id, b.id, dayOf(clock), mask, app.catalog);
  assert.ok(['frog_star', 'frog_honey'].includes(gift.speciesId));
  const friend = { opId: crypto.randomUUID(), type: 'friend.add', ts: clock, payload: { friendId: b.id, at: clock } };
  const cap = captureOp(gift, clock, { mask, lat: undefined, lng: undefined });
  const r = await sync(a, 'A', [friend, cap]);
  assert.deepEqual(r.body.results.map((x) => x.status), ['applied', 'applied']);
  assert.equal(r.body.state.friends[0].id, b.id);
  const again = await sync(a, 'A', [captureOp(gift, clock + 100, { mask })]);
  assert.equal(again.body.results[0].status, 'conflict', 'mesmo presente no mesmo dia não vale duas vezes');
  const rb = await sync(b, 'B', []);
  assert.equal(rb.body.state.friends[0].id, a.id, 'amizade é mútua');
  const self = await sync(a, 'A', [{ opId: crypto.randomUUID(), type: 'friend.add', ts: clock, payload: { friendId: a.id } }]);
  assert.equal(self.body.results[0].status, 'rejected');
});

test('servidor indisponível responde 503 e volta sozinho', async () => {
  const r = await call('POST', '/api/admin/outage', { seconds: 30 }, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/health')).status, 503);
  clock += 31000;
  assert.equal((await call('GET', '/api/health')).status, 200);
  const wrongKey = await call('POST', '/api/admin/outage', { seconds: 30 }, { 'X-Admin-Key': 'x' });
  assert.equal(wrongKey.status, 403);
});

test('lote parcialmente aplicado: reenviar o lote inteiro é seguro', async () => {
  const p = await newPlayer('ivo');
  const b = await ensureBrejo();
  const spawns = spawnsFor(b, windowOf(clock), app.catalog);
  const ops = spawns.slice(0, 3).map((s, i) => captureOp(s, clock + i));
  // primeira tentativa: só a primeira operação chegou (ex.: conexão caiu no meio)
  await sync(p, 'c1', [ops[0]]);
  const r = await sync(p, 'c1', ops);
  assert.deepEqual(r.body.results.map((x) => x.status), ['duplicate', 'applied', 'applied']);
  assert.equal(r.body.state.captures.length, 3);
});

test('ranking e progresso recuperado em outro aparelho', async () => {
  const p = await newPlayer('julia');
  const b = await ensureBrejo();
  const spawn = spawnsFor(b, windowOf(clock), app.catalog)[0];
  await sync(p, 'celular', [captureOp(spawn, clock)]);
  const login = await call('POST', '/api/auth/login', { username: 'julia', password: 'senha123' });
  const other = await sync({ token: login.body.token }, 'tablet', []);
  assert.equal(other.body.state.captures.length, 1);
  assert.ok(other.body.brejos.length >= 1);
  const rk = await call('GET', '/api/ranking', null, auth(p));
  assert.equal(rk.status, 200);
  assert.ok(rk.body.me.xp > 0);
});
