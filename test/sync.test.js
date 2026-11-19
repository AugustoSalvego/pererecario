// Testes do servidor: idempotência, conflitos, convergência e falhas.
// Rodar com: npm test  (SQLite em memória)
// Contra um PostgreSQL de verdade: TEST_DATABASE_URL="postgres://..." npm test  (o GitHub faz isso sozinho)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { importAll } from '../server/backup.js';
import { createApp } from '../server/app.js';
import { spawnsFor, findBrejo, windowOf, windowStart, giftFor, dayOf, maskFromSpecies, pondsNear, moitasNear, brejosNear, distanceM, jobsNear, jobPay, visibleInMode, frogPrice } from '../client/js/shared/game.js';

let server, base, app, db, clock = Date.UTC(2026, 10, 18, 13, 0, 0);
const now = () => clock;
const ADMIN = 'teste-admin';

before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '', file: ':memory:' });
  app = await createApp({ db, adminKey: ADMIN, tokenSecret: 'segredo-de-teste', now, quiet: true });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

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
  const ponds = pondsNear(here, 400, p.id);
  assert.ok(ponds.length >= 12, `poucas lagoinhas: ${ponds.length}`);
  for (let i = 0; i < ponds.length; i++) for (let j = i + 1; j < ponds.length; j++) {
    assert.ok(distanceM(ponds[i], ponds[j]) >= ponds[i].radius + ponds[j].radius, 'lagoinhas sobrepostas');
  }
  const spawn = spawnsFor(ponds[0], windowOf(clock), app.catalog, p.id)[0];
  const ok = await sync(p, 'c1', [captureOp(spawn, clock)]);
  assert.equal(ok.body.results[0].status, 'applied', JSON.stringify(ok.body.results[0]));
  // id de lagoinha que não existe (o sorteio daquele ponto da grade deu "sem lagoinha") é recusado
  const fake = { ...spawn, id: spawn.id.replace(ponds[0].id, 'p1_99999999') };
  const bad = await sync(p, 'c1', [captureOp(fake, clock)]);
  assert.notEqual(bad.body.results[0].status, 'applied');
});

test('pererecas soltas no mato: valem como as da lagoinha, e moitinha inventada é recusada', async () => {
  const p = await newPlayer('moita');
  const here = { lat: 48.8584, lng: 2.2945 };
  const moitas = moitasNear(here, 300, p.id);
  assert.ok(moitas.length >= 5, `poucas moitinhas: ${moitas.length}`);
  for (const m of moitas) {
    for (const pond of pondsNear(m, 120, p.id)) assert.ok(distanceM(m, pond) > pond.radius, 'moitinha em cima de lagoinha');
  }
  const spawn = spawnsFor(moitas[0], windowOf(clock), app.catalog, p.id).find((s) => visibleInMode(s, 'gps'));
  assert.ok(distanceM(spawn, moitas[0]) <= moitas[0].radius + 1, 'perereca longe da moitinha');
  const ok = await sync(p, 'c1', [captureOp(spawn, clock)]);
  assert.equal(ok.body.results[0].status, 'applied', JSON.stringify(ok.body.results[0]));
  const fake = { ...spawn, id: spawn.id.replace(moitas[0].id, 'm1_99999999') };
  const bad = await sync(p, 'c1', [captureOp(fake, clock)]);
  assert.notEqual(bad.body.results[0].status, 'applied');
});

test('brejo cadastrado à mão esconde a lagoinha automática que está em cima dele', async () => {
  const p = await newPlayer('otto');
  const pond = pondsNear({ lat: -22.95, lng: -43.21 }, 300, p.id)[0];
  const r = await call('POST', '/api/admin/brejos', { name: 'Brejo da Sala', lat: pond.lat, lng: pond.lng + 0.0001, radius: 30 }, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 200);
  const shown = brejosNear(r.body.brejos, pond, 300, p.id);
  assert.ok(!shown.some((b) => b.id === pond.id), 'a automática deveria sumir');
  assert.ok(shown.some((b) => b.name === 'Brejo da Sala'));
  const spawn = spawnsFor(pond, windowOf(clock), app.catalog, p.id)[0];
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

test('cada jogador tem lagoinhas e pererecas próprias', async () => {
  const a = await newPlayer('lia');
  const b = await newPlayer('teo');
  const here = { lat: -23.1068, lng: -50.3602 };
  const pa = pondsNear(here, 400, a.id), pb = pondsNear(here, 400, b.id);
  assert.notDeepEqual(pa.map((x) => [x.id, x.lat]), pb.map((x) => [x.id, x.lat]), 'lagoinhas iguais para jogadores diferentes');
  const br = await ensureBrejo();
  const sa = spawnsFor(br, windowOf(clock), app.catalog, a.id), sb = spawnsFor(br, windowOf(clock), app.catalog, b.id);
  assert.notDeepEqual(sa.map((x) => [x.speciesId, x.lat]), sb.map((x) => [x.speciesId, x.lat]));
  // a perereca de um jogador não pode ser capturada por outro. Escolhe uma perereca de A que não exista
  // igual para B: o servidor recalcula a lagoinha pelo id com a semente de B, e por acaso B pode ter, no
  // mesmo ponto da grade, uma lagoinha com uma perereca da mesma espécie no mesmo lugar (aí ela é dele mesmo).
  const w = windowOf(clock);
  const deB = (s) => {
    const [pondId, , n] = s.id.split(':');
    const pond = findBrejo(pondId, [], b.id);
    return pond ? spawnsFor(pond, w, app.catalog, b.id)[Number(n)] : null;
  };
  const alheia = pa.flatMap((x) => spawnsFor(x, w, app.catalog, a.id)).find((s) => deB(s)?.speciesId !== s.speciesId);
  assert.ok(alheia);
  const r = await sync(b, 'c1', [captureOp(alheia, clock)]);
  assert.notEqual(r.body.results[0].status, 'applied');
});

test('modo controle: pererecas "só GPS" são recusadas; no modo GPS valem', async () => {
  const p = await newPlayer('rui');
  const here = { lat: -23.2, lng: -50.5 };
  let gpsOnly = null;
  for (let w = 0; w < 400 && !gpsOnly; w++) {
    for (const pond of pondsNear(here, 400, p.id)) {
      gpsOnly = spawnsFor(pond, windowOf(clock) - w, app.catalog, p.id).find((s) => s.gpsOnly);
      if (gpsOnly) break;
    }
  }
  assert.ok(gpsOnly, 'deveria existir alguma perereca só de GPS');
  const at = windowStart(gpsOnly.win) + 1000;
  const ctl = await sync(p, 'c1', [captureOp(gpsOnly, at, { mode: 'controle' })]);
  assert.equal(ctl.body.results[0].status, 'rejected');
  const gps = await sync(p, 'c1', [captureOp(gpsOnly, at, { mode: 'gps' })]);
  assert.equal(gps.body.results[0].status, 'applied', JSON.stringify(gps.body.results[0]));
});

test('presença: jogadores perto se veem, longe não, e quem se esconde some', async () => {
  const a = await newPlayer('ana2'), b = await newPlayer('bel2'), c = await newPlayer('cid2');
  const sala = { lat: -23.10680, lng: -50.36020 };
  await call('POST', '/api/presence', { ...sala }, auth(a));
  await call('POST', '/api/presence', { lat: sala.lat + 0.00001, lng: sala.lng, look: 'ninja-feminino-media' }, auth(b));
  await call('POST', '/api/presence', { lat: sala.lat + 0.05, lng: sala.lng }, auth(c)); // ~5 km
  const r = await call('POST', '/api/presence', { ...sala }, auth(a));
  const ids = r.body.players.map((o) => o.id);
  assert.ok(ids.includes(b.id) && !ids.includes(c.id) && !ids.includes(a.id));
  assert.equal(r.body.players.find((o) => o.id === b.id).look, 'ninja-feminino-media');
  await call('POST', '/api/presence', { ...sala, hidden: true }, auth(b));
  const r2 = await call('POST', '/api/presence', { ...sala }, auth(a));
  assert.ok(!r2.body.players.some((o) => o.id === b.id));
  const r3 = await call('POST', '/api/presence', { ...sala }, auth(c)); // c chega na sala: vê a
  assert.ok(r3.body.players.some((o) => o.id === a.id));
  clock += 60_000; // sem notícias de a por 1 min: a presença expira sozinha
  const r4 = await call('POST', '/api/presence', { ...sala }, auth(c));
  assert.ok(!r4.body.players.some((o) => o.id === a.id));
  clock -= 60_000;
});

// trabalhos de um jogador perto de um ponto, voltando no tempo até achar 'n' (sem entregas, se pedido)
function findJobs(p, n, { types = ['casa', 'carro', 'horta'] } = {}) {
  const out = [];
  for (let w = windowOf(clock); out.length < n && w > windowOf(clock) - 400; w--) {
    for (const j of jobsNear({ lat: -23.3, lng: -50.6 }, 1500, w, p.id)) if (types.includes(j.type) && out.length < n) out.push(j);
  }
  return out;
}
const jobOp = (j, extra = {}) => ({
  opId: crypto.randomUUID(), type: 'job.done', ts: clock,
  payload: { doneId: crypto.randomUUID(), jobId: j.id, mode: 'gps', doneAt: windowStart(j.win) + 60000, lat: j.lat, lng: j.lng, ...extra },
});
const buyOp = (item) => ({ opId: crypto.randomUUID(), type: 'shop.buy', ts: clock, payload: { buyId: crypto.randomUUID(), item, boughtAt: clock } });

test('trabalho paga uma vez só, no lugar e na hora certos (GPS paga mais)', async () => {
  const p = await newPlayer('pedro');
  const [j] = findJobs(p, 1);
  const r = await sync(p, 'c1', [jobOp(j)]);
  assert.equal(r.body.results[0].status, 'applied', JSON.stringify(r.body.results[0]));
  assert.equal(r.body.results[0].pay, jobPay(j.type, 'gps'));
  const again = await sync(p, 'c2', [jobOp(j)]);                       // outro aparelho, mesmo trabalho
  assert.equal(again.body.results[0].status, 'conflict');
  assert.equal(again.body.state.jobs.length, 1);
  const far = await sync(p, 'c1', [jobOp(findJobs(p, 2)[1], { lat: j.lat + 0.01 })]);   // ~1 km longe
  assert.equal(far.body.results[0].status, 'rejected');
  const ctl = findJobs(p, 3)[2];
  const r2 = await sync(p, 'c1', [jobOp(ctl, { mode: 'controle' })]);
  assert.equal(r2.body.results[0].pay, jobPay(ctl.type, 'controle'));
  assert.ok(jobPay(ctl.type, 'gps') > jobPay(ctl.type, 'controle'));
});

test('entrega só conta chegando no ponto de entrega', async () => {
  const p = await newPlayer('carla');
  const [j] = findJobs(p, 1, { types: ['entrega'] });
  const atNpc = await sync(p, 'c1', [jobOp(j)]);
  assert.equal(atNpc.body.results[0].status, 'rejected');
  const atDest = await sync(p, 'c1', [jobOp(j, { lat: j.dest.lat, lng: j.dest.lng })]);
  assert.equal(atDest.body.results[0].status, 'applied', JSON.stringify(atDest.body.results[0]));
});

test('loja: sem saldo é recusada; item repetido não cobra; dois aparelhos gastando o mesmo dinheiro', async () => {
  const p = await newPlayer('lojinha');
  const poor = await sync(p, 'c1', [buyOp('hatch')]);
  assert.equal(poor.body.results[0].status, 'rejected');
  // trabalhos até juntar B$ 250 (o sedã); os moradores são sorteados, então o total varia um pouco
  const jobs = [];
  let sum = 0;
  for (const j of findJobs(p, 12)) { if (sum >= 250) break; jobs.push(j); sum += jobPay(j.type, 'gps'); }
  await sync(p, 'c1', jobs.map((j) => jobOp(j)));
  let st = (await sync(p, 'c1', [])).body.state;
  const earned = st.jobs.reduce((t, j) => t + j.pay, 0);
  assert.ok(earned >= 250 && earned < 400, `ganhou ${earned}`);
  // aparelho A e B, offline, compram o sedã (B$ 250) com o mesmo dinheiro
  const a = await sync(p, 'A', [buyOp('sedan')]);
  const b = await sync(p, 'B', [buyOp('sedan')]);
  assert.equal(a.body.results[0].status, 'applied');
  assert.equal(b.body.results[0].status, 'conflict');               // já tem: não cobra de novo
  const c = await sync(p, 'B', [buyOp('pickup')]);                    // não sobrou dinheiro para a picape
  assert.equal(c.body.results[0].status, 'rejected');
  st = c.body.state;
  assert.deepEqual(st.purchases.map((x) => x.item), ['sedan']);
  // carro em uso: só o que tem
  const v1 = await sync(p, 'A', [{ opId: crypto.randomUUID(), type: 'vehicle.select', ts: clock, payload: { vehicle: 'pickup', ts: clock } }]);
  assert.equal(v1.body.results[0].status, 'rejected');
  const v2 = await sync(p, 'A', [{ opId: crypto.randomUUID(), type: 'vehicle.select', ts: clock, payload: { vehicle: 'sedan', ts: clock } }]);
  assert.equal(v2.body.state.player.vehicle, 'sedan');
});

test('venda de perereca: paga uma vez só, preço do servidor, favorita e captura perdida não vendem', async () => {
  const p = await newPlayer('vendedor');
  const b = await ensureBrejo();
  const spawns = spawnsFor(b, windowOf(clock), app.catalog, p.id);
  const caps = spawns.slice(0, 3).map((s) => captureOp(s, clock));
  await sync(p, 'c1', caps);
  const sellOp = (cap, extra = {}) => ({ opId: crypto.randomUUID(), type: 'frog.sell', ts: clock, payload: { sellId: crypto.randomUUID(), captureId: cap.payload.captureId, soldAt: clock, ...extra } });
  // venda normal: o preço é o do servidor (raridade + tamanho), mesmo que o celular mande outro
  const s1 = await sync(p, 'A', [sellOp(caps[0], { price: 99999 })]);
  assert.equal(s1.body.results[0].status, 'applied');
  const expected = frogPrice(app.catalog, spawns[0].speciesId, spawns[0].sizeCm);
  assert.equal(s1.body.results[0].price, expected);
  // a mesma perereca vendida no outro aparelho: conflito, não paga de novo
  const s2 = await sync(p, 'B', [sellOp(caps[0])]);
  assert.equal(s2.body.results[0].status, 'conflict');
  // favorita não vende
  await sync(p, 'A', [{ opId: crypto.randomUUID(), type: 'favorite', ts: clock + 5, payload: { spawnId: spawns[1].id, favorite: true, ts: clock + 5 } }]);
  const s3 = await sync(p, 'A', [sellOp(caps[1])]);
  assert.equal(s3.body.results[0].status, 'rejected');
  // captura que perdeu o conflito (mesmo encontro capturado antes em outro aparelho) não existe no servidor
  const lost = captureOp(spawns[2], clock + 1);
  const r = await sync(p, 'B', [lost, sellOp(lost)]);
  assert.equal(r.body.results[0].status, 'conflict');
  assert.equal(r.body.results[1].status, 'rejected');
  const st = r.body.state;
  assert.equal(st.sales.length, 1);
  assert.equal(st.sales[0].price, expected);
  // o dinheiro da venda entra no saldo que o servidor usa para a loja
  const jobs = findJobs(p, 4);
  await sync(p, 'A', jobs.map((j) => jobOp(j)));
  const earned = (await sync(p, 'A', [])).body.state.jobs.reduce((t, j) => t + j.pay, 0);
  const need = 150 - earned;   // quanto faltaria para o hatch sem a venda
  if (need > 0 && need <= expected) {
    const buy = await sync(p, 'A', [buyOp('hatch')]);
    assert.equal(buy.body.results[0].status, 'applied');
  }
});

test('reenvio da mesma operação não duplica a captura (idempotência)', async () => {
  const p = await newPlayer('bia');
  const b = await ensureBrejo();
  const spawn = spawnsFor(b, windowOf(clock), app.catalog, p.id)[0];
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
  const spawn = spawnsFor(b, windowOf(clock), app.catalog, p.id)[1];
  const wrongSpecies = captureOp({ ...spawn, speciesId: spawn.speciesId === 'frog_star' ? 'frog_leaf' : 'frog_star' }, clock);
  const tooLate = captureOp(spawn, clock + 2 * 60 * 60 * 1000 - 1000);
  const tooFar = captureOp(spawn, clock, { lat: spawn.lat + 0.01 });
  const r = await sync(p, 'c1', [wrongSpecies, tooLate, tooFar]);
  assert.deepEqual(r.body.results.map((x) => x.status), ['rejected', 'rejected', 'rejected']);
  assert.equal(r.body.state.captures.length, 0);
});

test('conflito: mesma perereca em dois aparelhos offline -> vence a primeira captura, em qualquer ordem', async () => {
  const b = await ensureBrejo();

  for (const order of [['A', 'B'], ['B', 'A']]) {
    const p = await newPlayer(`dani${order.join('')}`.toLowerCase());
    const spawn = spawnsFor(b, windowOf(clock), app.catalog, p.id)[2]; // mesmo jogador = mesmas pererecas nos dois aparelhos
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
  const spawn = spawnsFor(b, windowOf(clock), app.catalog, p.id)[0];
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
  const spawns = spawnsFor(b, windowOf(clock), app.catalog, p.id);
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
  const spawn = spawnsFor(b, windowOf(clock), app.catalog, p.id)[0];
  await sync(p, 'celular', [captureOp(spawn, clock)]);
  const login = await call('POST', '/api/auth/login', { username: 'julia', password: 'senha123' });
  const other = await sync({ token: login.body.token }, 'tablet', []);
  assert.equal(other.body.state.captures.length, 1);
  assert.ok(other.body.brejos.length >= 1);
  const rk = await call('GET', '/api/ranking', null, auth(p));
  assert.equal(rk.status, 200);
  assert.ok(rk.body.me.xp > 0);
});

test('backup completo e restauração num banco novo (sem duplicar ao restaurar de novo)', async () => {
  clock += 61_000;   // o limite de 30 cadastros/logins por minuto vale também nos testes
  const p = await newPlayer('backupeiro');
  const b = await ensureBrejo();
  const spawns = spawnsFor(b, windowOf(clock), app.catalog, p.id);
  await sync(p, 'c1', spawns.slice(0, 2).map((s) => captureOp(s, clock)));
  const denied = await call('GET', '/api/admin/backup', undefined, { 'X-Admin-Key': 'errada' });
  assert.equal(denied.status, 403);
  const r = await call('GET', '/api/admin/backup', undefined, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.body.app, 'pererecario');
  assert.ok(r.body.counts.players >= 1 && r.body.counts.captures >= 2);
  // restaura num banco vazio (SQLite em memória, mesmo que o original seja Postgres)
  const fresh = await openDb({ url: '', file: ':memory:' });
  const added = await importAll(fresh, r.body);
  assert.deepEqual(added, r.body.counts);
  const again = await importAll(fresh, r.body);
  assert.ok(Object.values(again).every((n) => n === 0), 'restaurar de novo não pode duplicar');
  const caps = await fresh.query('SELECT * FROM captures WHERE player_id=$1', [p.id]);
  assert.equal(caps.length, 2);
  await fresh.close();
});

test('administrador redefine a senha de quem esqueceu, sem perder o progresso', async () => {
  clock += 61_000;   // o limite de 30 cadastros/logins por minuto vale também nos testes
  const p = await newPlayer('esquecido');
  const b = await ensureBrejo();
  await sync(p, 'c1', [captureOp(spawnsFor(b, windowOf(clock), app.catalog, p.id)[0], clock)]);
  const bad = await call('POST', '/api/admin/reset-password', { username: 'esquecido', password: 'nova1234' }, { 'X-Admin-Key': 'errada' });
  assert.equal(bad.status, 403);
  const r = await call('POST', '/api/admin/reset-password', { username: 'ESQUECIDO', password: 'nova1234' }, { 'X-Admin-Key': ADMIN });
  assert.equal(r.status, 200);
  const old = await call('POST', '/api/auth/login', { username: 'esquecido', password: 'senha123' });
  assert.equal(old.status, 401);
  const ok = await call('POST', '/api/auth/login', { username: 'esquecido', password: 'nova1234' });
  assert.equal(ok.status, 200);
  const st = (await sync({ token: ok.body.token }, 'c2', [])).body.state;
  assert.equal(st.captures.length, 1);
});

test('banco restaurado de um backup: o aparelho percebe ("seen") e reenvia; o servidor recupera tudo sem duplicar', async () => {
  clock += 61_000;
  const p = await newPlayer('rita');
  const b = await ensureBrejo();
  const spawns = spawnsFor(b, windowOf(clock), app.catalog, p.id).filter((s) => visibleInMode(s, 'gps')).slice(0, 3);
  assert.equal(spawns.length, 3);
  const ops = spawns.map((s) => captureOp(s, clock));
  const r1 = await sync(p, 'cel-rita', [ops[0]]);
  assert.equal(r1.body.seen, 1);
  // backup automático no meio do caminho (e o painel anota a hora)
  const bk = await call('GET', '/api/admin/backup', null, { 'X-Admin-Key': ADMIN, 'X-Backup-Origem': 'github' });
  assert.equal(bk.status, 200);
  const r2 = await sync(p, 'cel-rita', ops.slice(1));
  assert.deepEqual(r2.body.results.map((r) => r.status), ['applied', 'applied'], JSON.stringify(r2.body.results));
  assert.equal(r2.body.seen, 3);
  // desastre: o banco volta para o momento do backup (as 2 últimas capturas somem do servidor)
  await db.run('DELETE FROM captures WHERE player_id=$1', [p.id]);
  await db.run('DELETE FROM operations WHERE player_id=$1', [p.id]);
  await importAll(db, bk.body);
  const lost = await sync(p, 'cel-rita', []);
  assert.equal(lost.body.seen, 1, 'o servidor diz que só tem 1 operação deste aparelho');
  assert.equal(lost.body.state.captures.length, 1);
  // o aparelho tinha confirmado 3: reenvia o histórico inteiro, e o servidor ignora o que já tem
  const replay = await sync(p, 'cel-rita', ops);
  assert.deepEqual(replay.body.results.map((r) => r.status), ['duplicate', 'applied', 'applied']);
  assert.equal(replay.body.seen, 3);
  assert.equal(replay.body.state.captures.length, 3);
  const again = await sync(p, 'cel-rita', ops);
  assert.deepEqual(again.body.results.map((r) => r.status), ['duplicate', 'duplicate', 'duplicate']);
  assert.equal(again.body.state.captures.length, 3);
  // outro aparelho da mesma conta tem a contagem dele
  assert.equal((await sync(p, 'cel-rita-2', [])).body.seen, 0);
  const adm = await call('GET', '/api/admin/overview', null, { 'X-Admin-Key': ADMIN });
  assert.ok(adm.body.health.backupAutoAt > 0);
  assert.ok(adm.body.health.dbBytes > 0);
});
