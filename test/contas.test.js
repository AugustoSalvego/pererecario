// Contas: apelido + e-mail + senha, e "Continuar com Google".
// O Google é simulado com uma chave RSA de teste: os tokens são assinados aqui e o servidor
// confere a assinatura, o emissor, o aplicativo (aud) e a validade como faria com os do Google.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const CLIENT_ID = 'teste.apps.googleusercontent.com';
let server, base, db, clock = Date.UTC(2026, 10, 19, 15, 0, 0);
const now = () => clock;

// chave "do Google" de teste e uma chave de impostor
const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const impostor = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...google.publicKey.export({ format: 'jwk' }), kid: 'chave-1', alg: 'RS256', use: 'sig' };
let keyFetches = 0;
const googleKeys = async () => { keyFetches++; return { keys: [jwk], maxAgeMs: 3600000 }; };

function idToken(claims = {}, { key = google.privateKey, kid = 'chave-1' } = {}) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1001', email: 'maria@gmail.com', email_verified: true,
    name: 'Maria Silva', given_name: 'Maria', iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 3600, ...claims,
  });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '', file: ':memory:' });
  // banco de Postgres compartilhado com os outros arquivos de teste: começa e termina sem estas contas
  if (process.env.TEST_DATABASE_URL) await cleanup();
  const app = await createApp({ db, adminKey: 'adm', tokenSecret: 's', now, quiet: true, googleClientId: CLIENT_ID, googleKeys });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
async function cleanup() {
  await db.run("DELETE FROM players WHERE email LIKE '%@gmail.com' OR email LIKE '%@teste.com' OR email LIKE '%@empresa.com.br'");
}
after(async () => { server.close(); if (process.env.TEST_DATABASE_URL) await cleanup(); await db.close(); });

// quem cria conta na tela marca "Li e concordo com os termos"; os testes fazem o mesmo, salvo quando dizem o contrário
const withTerms = (p, body) => (body && (p === '/api/auth/register' || p === '/api/auth/google') && body.acceptTerms === undefined ? { ...body, acceptTerms: true } : body);
async function call(method, path, body, headers = {}) {
  body = withTerms(path, body);
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

test('configuração pública traz o Client ID do Google', async () => {
  const r = await call('GET', '/api/config');
  assert.equal(r.body.googleClientId, CLIENT_ID);
});

test('criar conta com apelido, e-mail e senha; entrar com e-mail e senha', async () => {
  clock += 61_000;
  const bad = await call('POST', '/api/auth/register', { displayName: 'Ana', email: 'ana@teste', password: 'senha123' });
  assert.equal(bad.status, 400);
  const short = await call('POST', '/api/auth/register', { displayName: 'Ana', email: 'ana@teste.com', password: '1234567' });
  assert.equal(short.status, 400);
  const r = await call('POST', '/api/auth/register', { displayName: 'Ana Clara', email: 'Ana@Teste.com', password: 'senha123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.player.email, 'ana@teste.com');
  assert.equal(r.body.player.displayName, 'Ana Clara');
  assert.equal(r.body.player.hasPassword, true);
  assert.equal(r.body.player.google, false);
  const dup = await call('POST', '/api/auth/register', { displayName: 'Outra', email: 'ana@teste.com', password: 'senha123' });
  assert.equal(dup.status, 409);
  const ok = await call('POST', '/api/auth/login', { email: 'ANA@teste.com ', password: 'senha123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.player.id, r.body.player.id);
  const wrong = await call('POST', '/api/auth/login', { email: 'ana@teste.com', password: 'errada123' });
  assert.equal(wrong.status, 401);
});

test('Google: apelido já em uso é recusado e a conta só nasce com um apelido livre', async () => {
  clock += 61_000;
  const owner = await call('POST', '/api/auth/register', { displayName: 'Sapo Único', email: 'sapo.unico@teste.com', password: 'senha123' });
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  const cred = () => idToken({ sub: '2900', email: 'sapo.copia@gmail.com', given_name: 'Sapo' });
  const dup = await call('POST', '/api/auth/google', { credential: cred(), displayName: 'Sapo Único' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'Esse apelido já está em uso. Escolha outro.');
  assert.equal((await call('POST', '/api/auth/google', { credential: cred() })).body.needsNickname, true, 'a conta não pode ter nascido');
  const ok = await call('POST', '/api/auth/google', { credential: cred(), displayName: 'Sapo único' });   // "ú" minúsculo: outro nome
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.player.displayName, 'Sapo único');
});

test('Google: conta nova pede o apelido, cria a conta e depois entra na mesma', async () => {
  clock += 61_000;
  const first = await call('POST', '/api/auth/google', { credential: idToken({ sub: '2001', email: 'joao@gmail.com', given_name: 'João' }) });
  assert.equal(first.status, 200);
  assert.equal(first.body.needsNickname, true);
  assert.equal(first.body.suggestion, 'João');
  assert.equal(first.body.token, undefined, 'não pode criar a conta antes do apelido');
  const created = await call('POST', '/api/auth/google', { credential: idToken({ sub: '2001', email: 'joao@gmail.com' }), displayName: 'Joãozinho' });
  assert.equal(created.status, 200);
  assert.equal(created.body.created, true);
  assert.equal(created.body.player.displayName, 'Joãozinho');
  assert.equal(created.body.player.email, 'joao@gmail.com');
  assert.equal(created.body.player.google, true);
  assert.equal(created.body.player.hasPassword, false);
  const again = await call('POST', '/api/auth/google', { credential: idToken({ sub: '2001', email: 'joao@gmail.com' }) });
  assert.equal(again.body.player.id, created.body.player.id);
  assert.equal(again.body.created, undefined);
  // e-mail e senha não entram numa conta só-Google (sem senha), mas a mensagem diz o que fazer
  const pw = await call('POST', '/api/auth/login', { email: 'joao@gmail.com', password: 'qualquer1' });
  assert.equal(pw.status, 401);
  assert.match(pw.body.error, /Google/);
  // criar conta com senha num e-mail que já entra com Google: orienta a usar o Google
  const reg = await call('POST', '/api/auth/register', { displayName: 'Xavier', email: 'joao@gmail.com', password: 'senha123' });
  assert.equal(reg.status, 409);
  assert.match(reg.body.error, /Google/);
});

test('Google: tokens falsos, de outro app, de outro emissor ou vencidos são recusados', async () => {
  clock += 61_000;
  const cases = [
    idToken({ sub: '3001' }, { key: impostor.privateKey }),          // assinatura de outra chave
    idToken({ sub: '3001', aud: 'outro-app.apps.googleusercontent.com' }),
    idToken({ sub: '3001', iss: 'https://falso.example.com' }),
    idToken({ sub: '3001', exp: Math.floor(clock / 1000) - 3600 }),  // vencido há uma hora
    idToken({ sub: '3001' }, { kid: 'chave-que-nao-existe' }),
    'nao.e.um.token',
    '',
  ];
  for (const credential of cases) {
    const r = await call('POST', '/api/auth/google', { credential, displayName: 'Hacker' });
    assert.equal(r.status, 401, `deveria recusar: ${JSON.stringify(r.body)}`);
  }
  // e o token alterado depois de assinado (trocar o sub para entrar na conta de outro)
  const good = idToken({ sub: '3002' });
  const [h, , sig] = good.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ iss: 'accounts.google.com', aud: CLIENT_ID, sub: '2001', exp: Math.floor(clock / 1000) + 3600 })).toString('base64url')}.${sig}`;
  const r = await call('POST', '/api/auth/google', { credential: forged });
  assert.equal(r.status, 401);
});

test('Google com o mesmo Gmail de uma conta com senha: liga as contas e desativa a senha não confirmada', async () => {
  clock += 61_000;
  const reg = await call('POST', '/api/auth/register', { displayName: 'Bia', email: 'bia@gmail.com', password: 'senha123' });
  assert.equal(reg.status, 200);
  const g = await call('POST', '/api/auth/google', { credential: idToken({ sub: '4001', email: 'bia@gmail.com' }) });
  assert.equal(g.status, 200);
  assert.equal(g.body.player.id, reg.body.player.id, 'tem de cair na mesma conta');
  assert.equal(g.body.linked, true);
  assert.equal(g.body.passwordReset, true);
  // a senha criada sem confirmar o e-mail não vale mais (quem a criou podia não ser a dona do Gmail)
  const old = await call('POST', '/api/auth/login', { email: 'bia@gmail.com', password: 'senha123' });
  assert.equal(old.status, 401);
  // a dona cria uma senha nova pelo Perfil e passa a entrar dos dois jeitos
  const set = await call('POST', '/api/auth/password', { password: 'novaSenha9' }, bearer(g.body.token));
  assert.equal(set.status, 200);
  assert.equal(set.body.player.hasPassword, true);
  const ok = await call('POST', '/api/auth/login', { email: 'bia@gmail.com', password: 'novaSenha9' });
  assert.equal(ok.body.player.id, reg.body.player.id);
  // depois de confirmado pelo Google, ligar de novo não mexe na senha
  const g2 = await call('POST', '/api/auth/google', { credential: idToken({ sub: '4001', email: 'bia@gmail.com' }) });
  assert.equal(g2.body.passwordReset, undefined);
  const still = await call('POST', '/api/auth/login', { email: 'bia@gmail.com', password: 'novaSenha9' });
  assert.equal(still.status, 200);
});

test('e-mail que não é Gmail: o Google não liga sozinho a uma conta existente', async () => {
  clock += 61_000;
  await call('POST', '/api/auth/register', { displayName: 'Caio', email: 'caio@empresa.com.br', password: 'senha123' });
  const g = await call('POST', '/api/auth/google', { credential: idToken({ sub: '5001', email: 'caio@empresa.com.br' }) });
  assert.equal(g.status, 409);
  const still = await call('POST', '/api/auth/login', { email: 'caio@empresa.com.br', password: 'senha123' });
  assert.equal(still.status, 200, 'a senha continua valendo');
});

test('ligar o Google pelo Perfil, e a mesma conta Google não liga em dois jogadores', async () => {
  clock += 61_000;
  const a = await call('POST', '/api/auth/register', { displayName: 'Davi', email: 'davi@teste.com', password: 'senha123' });
  const b = await call('POST', '/api/auth/register', { displayName: 'Eva', email: 'eva@teste.com', password: 'senha123' });
  const link = await call('POST', '/api/auth/google/link', { credential: idToken({ sub: '6001', email: 'davi.g@gmail.com' }) }, bearer(a.body.token));
  assert.equal(link.status, 200);
  assert.equal(link.body.player.google, true);
  const viaGoogle = await call('POST', '/api/auth/google', { credential: idToken({ sub: '6001', email: 'davi.g@gmail.com' }) });
  assert.equal(viaGoogle.body.player.id, a.body.player.id);
  const steal = await call('POST', '/api/auth/google/link', { credential: idToken({ sub: '6001', email: 'davi.g@gmail.com' }) }, bearer(b.body.token));
  assert.equal(steal.status, 409);
  const noAuth = await call('POST', '/api/auth/google/link', { credential: idToken({ sub: '6002' }) });
  assert.equal(noAuth.status, 401);
});

test('trocar a senha pede a atual; senha curta é recusada', async () => {
  clock += 61_000;
  const r = await call('POST', '/api/auth/register', { displayName: 'Fábio', email: 'fabio@teste.com', password: 'senha123' });
  const t = r.body.token;
  assert.equal((await call('POST', '/api/auth/password', { current: 'errada99', password: 'outraSenha1' }, bearer(t))).status, 401);
  assert.equal((await call('POST', '/api/auth/password', { current: 'senha123', password: 'curta' }, bearer(t))).status, 400);
  assert.equal((await call('POST', '/api/auth/password', { current: 'senha123', password: 'outraSenha1' }, bearer(t))).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { email: 'fabio@teste.com', password: 'outraSenha1' })).status, 200);
});

test('muitas tentativas de senha na mesma conta são barradas', async () => {
  clock += 61_000;
  await call('POST', '/api/auth/register', { displayName: 'Gil', email: 'gil@teste.com', password: 'senha123' });
  let last;
  for (let i = 0; i < 11; i++) last = await call('POST', '/api/auth/login', { email: 'gil@teste.com', password: `errada${i}xx` });
  assert.equal(last.status, 429);
});

test('chaves do Google são guardadas, não baixadas a cada login', async () => {
  const before = keyFetches;
  for (let i = 0; i < 3; i++) await call('POST', '/api/auth/google', { credential: idToken({ sub: '2001', email: 'joao@gmail.com' }) });
  assert.equal(keyFetches, before);
});

test('termos: sem marcar "li e concordo" não cria conta; o aceite fica registrado com a versão', async () => {
  clock += 61_000;
  const no = await call('POST', '/api/auth/register', { displayName: 'Tina', email: 'tina.termos@gmail.com', password: 'senha123', acceptTerms: false });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /Termos de Uso/);
  assert.equal(await db.one("SELECT id FROM players WHERE email='tina.termos@gmail.com'"), null);
  const ok = await call('POST', '/api/auth/register', { displayName: 'Tina', email: 'tina.termos@gmail.com', password: 'senha123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.player.termsAccepted, true);
  const row = await db.one("SELECT terms_version, terms_at FROM players WHERE email='tina.termos@gmail.com'");
  assert.ok(row.terms_version && Number(row.terms_at) > 0);
  // Google: conta nova também precisa do aceite
  const cred = idToken({ sub: '9911', email: 'ugo.termos@gmail.com', name: 'Ugo' });
  assert.equal((await call('POST', '/api/auth/google', { credential: cred, displayName: 'Ugo', acceptTerms: false })).status, 400);
  const g = await call('POST', '/api/auth/google', { credential: cred, displayName: 'Ugo' });
  assert.equal(g.status, 200);
  assert.equal(g.body.player.termsAccepted, true);
  // conta antiga (sem aceite) aceita depois, já logada
  const old = await call('POST', '/api/auth/register', { username: 'antigo_termos', password: 'senha123', displayName: 'Antigo' });
  assert.equal(old.body.player.termsAccepted, false);
  assert.equal((await call('POST', '/api/auth/terms', { accept: false }, bearer(old.body.token))).status, 400);
  const acc = await call('POST', '/api/auth/terms', { accept: true }, bearer(old.body.token));
  assert.equal(acc.status, 200);
  assert.equal(acc.body.player.termsAccepted, true);
  const snap = await call('POST', '/api/sync', { deviceId: 'cel-t', ops: [] }, bearer(old.body.token));
  assert.equal(snap.body.state.player.termsAccepted, true);
  await db.run("DELETE FROM players WHERE email IN ('tina.termos@gmail.com','ugo.termos@gmail.com') OR username='antigo_termos'");
});
