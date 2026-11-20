// Código de 6 números por e-mail: confirmar o cadastro e "esqueci a senha".
// O Brevo é trocado por um carteiro de mentira que guarda os e-mails numa lista.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { makeBrevoMailer, codeEmail } from '../server/mailer.js';

const CLIENT_ID = 'teste.apps.googleusercontent.com';
let clock = Date.UTC(2026, 10, 20, 15, 0, 0);
const now = () => clock;
let db, server, base, plain, plainBase;

const outbox = [];
let mailFails = false;
const mailer = async (msg) => {
  if (mailFails) throw new Error('Brevo respondeu 401: Key not found');
  outbox.push(msg);
};
const codeFor = (to) => {
  const m = [...outbox].reverse().find((x) => x.to === to);
  return m && m.text.match(/^(\d{6})$/m)[1];
};
const mailsTo = (to) => outbox.filter((x) => x.to === to).length;

const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...google.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
function idToken(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, email_verified: true, iat: Math.floor(clock / 1000), exp: Math.floor(clock / 1000) + 3600, ...claims });
  return `${head}.${body}.${crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), google.privateKey).toString('base64url')}`;
}

async function cleanup() {
  await db.run("DELETE FROM players WHERE email LIKE '%@codigo.test' OR email = 'lia.codigo@gmail.com'");
  await db.run("DELETE FROM email_codes WHERE email LIKE '%@codigo.test' OR email = 'lia.codigo@gmail.com'");
}

before(async () => {
  db = await openDb({ url: process.env.TEST_DATABASE_URL || '', file: ':memory:' });
  if (process.env.TEST_DATABASE_URL) await cleanup();
  const app = await createApp({ db, adminKey: 'adm', tokenSecret: 's', now, quiet: true, mailer, googleClientId: CLIENT_ID, googleKeys: async () => ({ keys: [jwk], maxAgeMs: 3600000 }) });
  server = app.server();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  // o mesmo jogo sem o Brevo configurado
  const app2 = await createApp({ db, adminKey: 'adm', tokenSecret: 's', now, quiet: true, mailer: null });
  plain = app2.server();
  await new Promise((r) => plain.listen(0, r));
  plainBase = `http://127.0.0.1:${plain.address().port}`;
});
after(async () => {
  server.close(); plain.close();
  if (process.env.TEST_DATABASE_URL) await cleanup();
  await db.close();
});

// cada teste chega de um "aparelho" diferente (o limite por aparelho tem teste próprio)
let ipN = 1;
let ip = '10.0.0.1';
// quem cria conta na tela marca "Li e concordo com os termos"; os testes fazem o mesmo, salvo quando dizem o contrário
const withTerms = (p, body) => (body && (p === '/api/auth/register' || p === '/api/auth/google') && body.acceptTerms === undefined ? { ...body, acceptTerms: true } : body);
async function call(method, path, body, { at = base, headers = {} } = {}) {
  body = withTerms(path, body);
  const res = await fetch(at + path, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const tick = () => { clock += 61_000; ipN++; ip = `10.0.${ipN >> 8}.${ipN & 255}`; };

test('cadastro com código: a conta só nasce depois do código certo', async () => {
  tick();
  assert.equal((await call('GET', '/api/config')).body.emailConfirm, true);
  const r = await call('POST', '/api/auth/register', { displayName: 'Bia', email: 'Bia@Codigo.test', password: 'senha123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.needsCode, true);
  assert.equal(r.body.email, 'bia@codigo.test');
  assert.equal(r.body.player, undefined);
  assert.equal(r.body.token, undefined);
  assert.ok(r.body.ticket.length >= 20);
  // ainda não existe conta
  assert.equal((await call('POST', '/api/auth/login', { email: 'bia@codigo.test', password: 'senha123' })).status, 401);
  // o e-mail traz o código no assunto e no texto; o banco não guarda o código
  const code = codeFor('bia@codigo.test');
  assert.match(code, /^\d{6}$/);
  const mail = outbox.at(-1);
  assert.ok(mail.subject.includes(code));
  assert.ok(mail.html.includes(code));
  const row = await db.one('SELECT * FROM email_codes WHERE id=$1', [r.body.ticket]);
  assert.ok(row && !row.code_hash.includes(code) && !row.data.includes('senha123'));

  const wrongCode = code === '000000' ? '111111' : '000000';
  const wrong = await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code: wrongCode });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.attemptsLeft, 4);
  const ok = await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code: ` ${code.slice(0, 3)} ${code.slice(3)} ` });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.created, true);
  assert.equal(ok.body.player.displayName, 'Bia');
  assert.equal(ok.body.player.email, 'bia@codigo.test');
  assert.ok(ok.body.token);
  assert.equal((await db.one('SELECT email_verified FROM players WHERE email=$1', ['bia@codigo.test'])).email_verified, 1);
  // o código vale uma vez só, e a senha do cadastro funciona
  assert.equal((await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code })).status, 410);
  const login = await call('POST', '/api/auth/login', { email: 'bia@codigo.test', password: 'senha123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.player.id, ok.body.player.id);
  // e-mail que já tem conta não recebe código de cadastro
  tick();
  const before = mailsTo('bia@codigo.test');
  assert.equal((await call('POST', '/api/auth/register', { displayName: 'Outra', email: 'bia@codigo.test', password: 'senha123' })).status, 409);
  assert.equal(mailsTo('bia@codigo.test'), before);
});

test('código vencido (15 minutos) não vale', async () => {
  tick();
  const r = await call('POST', '/api/auth/register', { displayName: 'Caio', email: 'caio@codigo.test', password: 'senha123' });
  const code = codeFor('caio@codigo.test');
  clock += 15 * 60_000 + 1000;
  const late = await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code });
  assert.equal(late.status, 410);
  assert.equal(late.body.expired, true);
  assert.equal(await db.one("SELECT id FROM players WHERE email='caio@codigo.test'"), null);
});

test('5 tentativas erradas e o código deixa de valer, mesmo o certo', async () => {
  tick();
  const r = await call('POST', '/api/auth/register', { displayName: 'Duda', email: 'duda@codigo.test', password: 'senha123' });
  const code = codeFor('duda@codigo.test');
  const bad = code === '123456' ? '654321' : '123456';
  const lefts = [];
  for (let i = 0; i < 5; i++) lefts.push((await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code: bad })).body.attemptsLeft);
  assert.deepEqual(lefts, [4, 3, 2, 1, 0]);
  const after = await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code });
  assert.equal(after.status, 410);
  assert.equal(await db.one("SELECT id FROM players WHERE email='duda@codigo.test'"), null);
});

test('reenviar: só depois de 1 minuto; o código novo vale e o velho não', async () => {
  tick();
  const r = await call('POST', '/api/auth/register', { displayName: 'Enzo', email: 'enzo@codigo.test', password: 'senha123' });
  const old = codeFor('enzo@codigo.test');
  const early = await call('POST', '/api/auth/code/resend', { ticket: r.body.ticket });
  assert.equal(early.status, 429);
  assert.ok(early.body.resendIn > 0 && early.body.resendIn <= 60);
  // cadastrar de novo o mesmo e-mail logo em seguida também espera
  const again = await call('POST', '/api/auth/register', { displayName: 'Enzo', email: 'enzo@codigo.test', password: 'outrasenha' });
  assert.equal(again.status, 429);
  assert.equal(mailsTo('enzo@codigo.test'), 1);
  tick();
  const re = await call('POST', '/api/auth/code/resend', { ticket: r.body.ticket });
  assert.equal(re.status, 200, JSON.stringify(re.body));
  assert.equal(re.body.ticket, r.body.ticket);
  assert.equal(mailsTo('enzo@codigo.test'), 2);
  const fresh = codeFor('enzo@codigo.test');
  if (fresh !== old) assert.equal((await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code: old })).status, 400);
  const ok = await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code: fresh });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.player.displayName, 'Enzo');
});

test('um cadastro novo do mesmo e-mail invalida o pedido anterior', async () => {
  tick();
  const a = await call('POST', '/api/auth/register', { displayName: 'Fabi', email: 'fabi@codigo.test', password: 'senha123' });
  const codeA = codeFor('fabi@codigo.test');
  tick();
  const b = await call('POST', '/api/auth/register', { displayName: 'Fabi', email: 'fabi@codigo.test', password: 'senha456' });
  assert.equal(b.status, 200);
  assert.notEqual(a.body.ticket, b.body.ticket);
  assert.equal((await call('POST', '/api/auth/register/confirm', { ticket: a.body.ticket, code: codeA })).status, 410);
  // o código de um pedido não serve em outro
  const codeB = codeFor('fabi@codigo.test');
  const ok = await call('POST', '/api/auth/register/confirm', { ticket: b.body.ticket, code: codeB });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/api/auth/login', { email: 'fabi@codigo.test', password: 'senha456' })).status, 200);
});

test('limite de e-mails por endereço: no máximo 5 por hora', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    tick();
    statuses.push((await call('POST', '/api/auth/register', { displayName: 'Gabi', email: 'gabi@codigo.test', password: 'senha123' })).status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  assert.equal(mailsTo('gabi@codigo.test'), 5);
  clock += 3600_000;
  assert.equal((await call('POST', '/api/auth/register', { displayName: 'Gabi', email: 'gabi@codigo.test', password: 'senha123' })).status, 200);
});

test('limite por aparelho: no máximo 10 e-mails a cada 10 minutos', async () => {
  tick();
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await call('POST', '/api/auth/register', { displayName: 'Kim', email: `kim${i}@codigo.test`, password: 'senha123' })).status);
  }
  assert.deepEqual(statuses, [...Array(10).fill(200), 429]);
  assert.equal(mailsTo('kim10@codigo.test'), 0);
});

test('esqueci a senha: código no e-mail, senha nova e já entra', async () => {
  tick();
  const unknown = await call('POST', '/api/auth/forgot', { email: 'ninguem@codigo.test' });
  assert.equal(unknown.status, 404);
  const f = await call('POST', '/api/auth/forgot', { email: ' BIA@codigo.test ' });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  assert.equal(f.body.email, 'bia@codigo.test');
  const code = codeFor('bia@codigo.test');
  assert.match(outbox.at(-1).text, /senha nova/);
  // senha curta é recusada antes de gastar uma tentativa do código
  const short = await call('POST', '/api/auth/reset', { ticket: f.body.ticket, code, password: '123' });
  assert.equal(short.status, 400);
  // o código de senha não serve para cadastro
  assert.equal((await call('POST', '/api/auth/register/confirm', { ticket: f.body.ticket, code })).status, 410);
  const r = await call('POST', '/api/auth/reset', { ticket: f.body.ticket, code, password: 'novasenha9' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.passwordChanged, true);
  assert.equal(r.body.player.email, 'bia@codigo.test');
  assert.ok(r.body.token);
  tick();
  assert.equal((await call('POST', '/api/auth/login', { email: 'bia@codigo.test', password: 'senha123' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'bia@codigo.test', password: 'novasenha9' })).status, 200);
  assert.equal((await call('POST', '/api/auth/reset', { ticket: f.body.ticket, code, password: 'outra1234' })).status, 410);
});

test('se o e-mail não sai, o cadastro avisa e nada fica pendurado', async () => {
  tick();
  mailFails = true;
  try {
    const r = await call('POST', '/api/auth/register', { displayName: 'Hugo', email: 'hugo@codigo.test', password: 'senha123' });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /Não consegui mandar o e-mail/);
    assert.equal(await db.one("SELECT id FROM email_codes WHERE email='hugo@codigo.test'"), null);
    assert.equal(await db.one("SELECT id FROM players WHERE email='hugo@codigo.test'"), null);
    const adm = await call('GET', '/api/admin/overview', null, { headers: { 'X-Admin-Key': 'adm' } });
    assert.equal(adm.body.mail.enabled, true);
    assert.ok(adm.body.mail.failed >= 1);
    assert.match(adm.body.mail.lastError, /401/);
  } finally { mailFails = false; }
  // o e-mail voltou: dá para tentar de novo na hora (não ficou esperando o minuto)
  const ok = await call('POST', '/api/auth/register', { displayName: 'Hugo', email: 'hugo@codigo.test', password: 'senha123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.needsCode, true);
});

test('Google com o mesmo Gmail de uma conta confirmada por código: liga e mantém a senha', async () => {
  tick();
  const r = await call('POST', '/api/auth/register', { displayName: 'Lia', email: 'lia.codigo@gmail.com', password: 'senha123' });
  const c = await call('POST', '/api/auth/register/confirm', { ticket: r.body.ticket, code: codeFor('lia.codigo@gmail.com') });
  assert.equal(c.status, 200);
  const g = await call('POST', '/api/auth/google', { credential: idToken({ sub: '7001', email: 'lia.codigo@gmail.com', given_name: 'Lia' }) });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.linked, true);
  assert.equal(g.body.passwordReset, false);
  assert.equal(g.body.player.id, c.body.player.id);
  assert.equal((await call('POST', '/api/auth/login', { email: 'lia.codigo@gmail.com', password: 'senha123' })).status, 200);
});

test('sem o Brevo configurado: cadastro direto, sem código, e sem "esqueci a senha" por e-mail', async () => {
  tick();
  assert.equal((await call('GET', '/api/config', null, { at: plainBase })).body.emailConfirm, false);
  const r = await call('POST', '/api/auth/register', { displayName: 'Iara', email: 'iara@codigo.test', password: 'senha123' }, { at: plainBase });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.equal(r.body.needsCode, undefined);
  assert.equal((await db.one("SELECT email_verified FROM players WHERE email='iara@codigo.test'")).email_verified, 0);
  const f = await call('POST', '/api/auth/forgot', { email: 'iara@codigo.test' }, { at: plainBase });
  assert.equal(f.status, 404);
  assert.match(f.body.error, /organizador/);
});

test('painel: e-mail de teste mostra o motivo quando o Brevo recusa', async () => {
  tick();
  const adm = { headers: { 'X-Admin-Key': 'adm' } };
  assert.equal((await call('POST', '/api/admin/test-email', { to: 'org@codigo.test' })).status, 403);
  const ok = await call('POST', '/api/admin/test-email', { to: 'org@codigo.test' }, adm);
  assert.equal(ok.status, 200);
  assert.match(outbox.at(-1).subject, /Teste do Pererecário/);
  mailFails = true;
  try {
    const bad = await call('POST', '/api/admin/test-email', { to: 'org@codigo.test' }, adm);
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /Key not found/);
  } finally { mailFails = false; }
  assert.equal((await call('POST', '/api/admin/test-email', { to: 'org@codigo.test' }, { at: plainBase, ...adm })).status, 404);
});

test('carteiro do Brevo: endereço, chave e formato certos; erro do Brevo vira falha', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return calls.length === 1 ? { ok: true, status: 201, text: async () => '{}' } : { ok: false, status: 400, text: async () => '{"code":"invalid_parameter"}' };
  };
  const send = makeBrevoMailer({ apiKey: 'xkeysib-teste', from: 'pererecario@exemplo.com', fetchImpl: fakeFetch });
  const msg = codeEmail({ code: '482913', purpose: 'signup', displayName: 'Ana <b>' });
  await send({ to: 'ana@codigo.test', ...msg });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].opts.headers['api-key'], 'xkeysib-teste');
  const body = JSON.parse(calls[0].opts.body);
  assert.deepEqual(body.sender, { email: 'pererecario@exemplo.com', name: 'Pererecário' });
  assert.deepEqual(body.to, [{ email: 'ana@codigo.test' }]);
  assert.ok(body.subject.startsWith('482913'));
  assert.ok(body.htmlContent.includes('Ana &lt;b&gt;'));
  await assert.rejects(send({ to: 'ana@codigo.test', ...msg }), /400/);
});

test('apelido em uso: avisa antes de mandar o código; se alguém pegar o nome no meio, o código não cria a conta', async () => {
  tick();
  const first = await call('POST', '/api/auth/register', { displayName: 'Rã do Código', email: 'ra1@codigo.test', password: 'senha123' });
  assert.equal(first.body.needsCode, true);
  // um segundo cadastro com o mesmo apelido, antes do primeiro confirmar: o nome ainda está livre
  tick();
  const second = await call('POST', '/api/auth/register', { displayName: 'Rã do Código', email: 'ra2@codigo.test', password: 'senha123' });
  assert.equal(second.body.needsCode, true);
  // o primeiro confirma e fica com o nome
  tick();
  const ok = await call('POST', '/api/auth/register/confirm', { ticket: first.body.ticket, code: codeFor('ra1@codigo.test') });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  // o segundo confirma depois: recusado com o aviso, e nenhuma conta nasce
  tick();
  const late = await call('POST', '/api/auth/register/confirm', { ticket: second.body.ticket, code: codeFor('ra2@codigo.test') });
  assert.equal(late.status, 409);
  assert.equal(late.body.error, 'Esse apelido já está em uso. Escolha outro.');
  assert.equal(await db.one("SELECT id FROM players WHERE email='ra2@codigo.test'"), null);
  // e quem tenta o nome agora é avisado antes de receber qualquer e-mail
  tick();
  const before = mailsTo('ra3@codigo.test');
  const third = await call('POST', '/api/auth/register', { displayName: 'Rã do Código', email: 'ra3@codigo.test', password: 'senha123' });
  assert.equal(third.status, 409);
  assert.equal(mailsTo('ra3@codigo.test'), before, 'não pode mandar e-mail para um apelido ocupado');
});
