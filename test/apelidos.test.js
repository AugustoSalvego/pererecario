// Apelido único: ninguém cria conta com um apelido que já existe.
// Maiúscula/minúscula e acento fazem diferença; espaços nas pontas, caracteres invisíveis e as
// duas formas de escrever um acento (NFC/NFD) não fazem (ver server/names.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { backfillNameKeys } from '../server/names.js';
import { exportAll, importAll } from '../server/backup.js';

let server, base, db, clock = Date.UTC(2026, 10, 20, 15, 0, 0);
const now = () => clock;
const cp = (...n) => String.fromCodePoint(...n);
const TAKEN = 'Esse apelido já está em uso. Escolha outro.';

async function cleanup() {
  await db.run("DELETE FROM players WHERE email LIKE '%@apelidos.test'");
}
before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '', file: ':memory:' });
  if (process.env.TEST_DATABASE_URL) await cleanup();
  const app = await createApp({ db, adminKey: 'adm', tokenSecret: 's', now, quiet: true });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); if (process.env.TEST_DATABASE_URL) await cleanup(); await db.close(); });

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
let n = 0;
const register = (displayName) => {
  clock += 61_000;   // fora da janela do limite de tentativas
  return call('POST', '/api/auth/register', { displayName, email: `conta${++n}@apelidos.test`, password: 'senha-boa-1', acceptTerms: true });
};
const nameCheck = (name) => call('GET', `/api/auth/name?n=${encodeURIComponent(name)}`);

test('apelido repetido é recusado; maiúscula, minúscula e acento contam como nomes diferentes', async () => {
  const a = await register('Duzão Apelido');
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.player.displayName, 'Duzão Apelido');

  // exatamente o mesmo nome: recusado, com o aviso
  const dup = await register('Duzão Apelido');
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, TAKEN);

  // parece igual, mas por dentro estava diferente: também recusado
  for (const look of [
    '  Duzão   Apelido ',                               // espaços a mais
    `Duza${cp(0x303)}o Apelido`,                          // "ã" escrito como "a" + "~" (NFD)
    `Duz${cp(0x200b)}ão Apelido`,                         // espaço invisível no meio
    `${cp(0x202e)}Duzão Apelido${cp(0xfeff)}`,            // marcas invisíveis nas pontas
  ]) {
    const r = await register(look);
    assert.equal(r.status, 409, `deveria recusar ${JSON.stringify(look)}`);
  }

  // maiúscula/minúscula e acento: nomes diferentes, podem ser criados
  for (const other of ['duzão Apelido', 'Duzao Apelido', 'DUZÃO APELIDO']) {
    const r = await register(other);
    assert.equal(r.status, 200, `${other}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.player.displayName, other);
  }
  // e cada um desses agora também está ocupado
  assert.equal((await register('Duzao Apelido')).status, 409);
});

test('o nome é guardado limpo (sem invisíveis, espaços extras ou acento decomposto)', async () => {
  const r = await register(`  Rã${cp(0x200d)}   Limpa${cp(0x301)} `);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.player.displayName, 'Rã Limpá');
  const row = await db.one('SELECT display_name, name_key FROM players WHERE id=$1', [r.body.player.id]);
  assert.equal(row.display_name, 'Rã Limpá');
  assert.equal(row.name_key, 'Rã Limpá');
});

test('aviso enquanto digita: GET /api/auth/name diz se o apelido está livre', async () => {
  assert.equal((await register('Perereca Livre Não')).status, 200);
  const taken = await nameCheck('Perereca Livre Não');
  assert.equal(taken.status, 200);
  assert.deepEqual(taken.body, { name: 'Perereca Livre Não', available: false, reason: TAKEN });
  assert.equal((await nameCheck(`Perereca Livre Na${cp(0x303)}o `)).body.available, false);
  assert.equal((await nameCheck('perereca livre não')).body.available, true);
  assert.equal((await nameCheck('Perereca Livre Nao')).body.available, true);
  const short = await nameCheck(' x ');
  assert.equal(short.body.available, false);
  assert.match(short.body.reason, /2 a 24/);
});

test('cadastro antigo (usuário + senha) também respeita o apelido único', async () => {
  assert.equal((await register('Velho Sapo')).status, 200);
  clock += 61_000;
  const r = await call('POST', '/api/auth/register', { username: `velho${Date.now() % 100000}`, password: 'senha-boa-1', displayName: 'Velho Sapo' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, TAKEN);
});

test('contas de antes da regra: nomes repetidos continuam, a mais antiga fica com o nome e ninguém novo pega', async () => {
  const a = await register('Antigo Um');
  const b = await register('Antigo Dois');
  const c = await register('Antigo Três');
  // simula o banco de antes: sem name_key e com dois jogadores com o mesmo apelido
  await db.run('UPDATE players SET display_name=$1, name_key=NULL, created_at=$2 WHERE id=$3', ['Nome Repetido', 1000, b.body.player.id]);
  await db.run('UPDATE players SET display_name=$1, name_key=NULL, created_at=$2 WHERE id=$3', ['Nome Repetido', 2000, c.body.player.id]);
  await db.run('UPDATE players SET name_key=NULL WHERE id=$1', [a.body.player.id]);

  const r1 = await backfillNameKeys(db);
  assert.ok(r1.keyed >= 2 && r1.duplicates >= 1, JSON.stringify(r1));
  const key = async (id) => (await db.one('SELECT name_key FROM players WHERE id=$1', [id])).name_key;
  assert.equal(await key(a.body.player.id), 'Antigo Um');
  assert.equal(await key(b.body.player.id), 'Nome Repetido');   // a mais antiga
  assert.equal(await key(c.body.player.id), null);              // a repetida fica como estava
  assert.equal((await db.one('SELECT display_name FROM players WHERE id=$1', [c.body.player.id])).display_name, 'Nome Repetido');

  // rodar de novo (todo início do servidor) não muda nada
  const r2 = await backfillNameKeys(db);
  assert.equal(r2.keyed, 0);
  assert.equal(await key(c.body.player.id), null);

  // ninguém novo consegue pegar os nomes antigos
  assert.equal((await register('Nome Repetido')).status, 409);
  assert.equal((await register('Antigo Um')).status, 409);
});

test('restaurar backup não pula conta por causa do apelido', async () => {
  const a = await register('Volta do Backup');
  const data = await exportAll(db, { now: clock });
  // a conta some e outra pessoa pega o mesmo apelido
  await db.run('DELETE FROM players WHERE id=$1', [a.body.player.id]);
  assert.equal((await register('Volta do Backup')).status, 200);
  // a restauração traz a conta antiga de volta (sem a chave do nome, que agora é da outra)
  await importAll(db, data);
  const back = await db.one('SELECT display_name, name_key FROM players WHERE id=$1', [a.body.player.id]);
  assert.ok(back, 'a conta do backup tinha de voltar');
  assert.equal(back.display_name, 'Volta do Backup');
  assert.equal(back.name_key, null);
});
