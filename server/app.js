import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, makeTokens, friendCode } from './auth.js';
import { makeSync } from './sync.js';
import { exportAll } from './backup.js';
import { makeGoogleVerifier, GoogleError } from './google.js';
import { mailerFromEnv, codeEmail } from './mailer.js';
import { TERMS_VERSION } from './terms.js';
import { hash32, maskFromSpecies, xpBreakdown, levelFor, distanceM, MIN_BREJO_GAP_M, validLook, carById } from '../client/js/shared/game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'client');
export const VERSION = '1.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message, extra = null) { super(message); this.status = status; this.extra = extra; }
}

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(path.join(CLIENT_DIR, 'assets', 'species.json'), 'utf8'));
}

// Contas: apelido + e-mail + senha, ou "Continuar com Google". O usuário antigo (username) continua
// valendo por dentro, para contas que já existiam.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NO_PASSWORD = '!sem-senha';                    // conta só com Google: nenhuma senha confere
const hasPassword = (p) => String(p?.pass_hash || '').startsWith('scrypt$');
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const TERMS_NEEDED = 'Para criar a conta, marque que você leu e concorda com os Termos de Uso e a Política de Privacidade.';

// Código de 6 números por e-mail: vale 15 minutos, 5 tentativas, reenvio depois de 1 minuto
const CODE_TTL = 15 * 60_000;
const RESEND_AFTER = 60_000;
const MAX_ATTEMPTS = 5;
const MAILS_PER_EMAIL_HOUR = 5;

export async function createApp({
  db, adminKey = process.env.ADMIN_KEY || 'brejo-admin', tokenSecret = process.env.TOKEN_SECRET, now = () => Date.now(), quiet = false,
  googleClientId = process.env.GOOGLE_CLIENT_ID || null, googleKeys = undefined,
  // Carteiro (Brevo). Sem ele, o cadastro é como antes: sem código (docs/HOSPEDAGEM.md, passo 7)
  mailer = mailerFromEnv(), mailDailyMax = Number(process.env.MAIL_DAILY_MAX) || 280,
} = {}) {
  // "Continuar com Google" só aparece se o servidor tiver o Client ID (docs/HOSPEDAGEM.md)
  const google = googleClientId ? makeGoogleVerifier({ clientId: googleClientId, now, ...(googleKeys ? { fetchKeys: googleKeys } : {}) }) : null;
  const catalog = loadCatalog();
  const log = (...a) => { if (!quiet) console.log(new Date().toISOString().slice(11, 19), ...a); };

  if (!tokenSecret) {
    const row = await db.one('SELECT value FROM settings WHERE key=$1', ['token_secret']);
    tokenSecret = row?.value;
    if (!tokenSecret) {
      tokenSecret = crypto.randomBytes(32).toString('hex');
      await db.tx((q) => q.run('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', ['token_secret', tokenSecret]));
      tokenSecret = (await db.one('SELECT value FROM settings WHERE key=$1', ['token_secret'])).value;
    }
  }
  const tokens = makeTokens(tokenSecret);
  const sync = makeSync({ db, catalog, now, log });

  // brejos iniciais (só se a tabela estiver vazia)
  const count = await db.one('SELECT COUNT(*) AS n FROM brejos');
  if (Number(count.n) === 0) {
    const seedFile = path.join(ROOT, 'server', 'brejos.seed.json');
    if (fs.existsSync(seedFile)) {
      const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      await db.tx(async (q) => {
        for (const b of seed) {
          await q.run('INSERT INTO brejos (id, name, lat, lng, radius, active, created_at) VALUES ($1,$2,$3,$4,$5,1,$6)',
            [b.id, b.name, b.lat, b.lng, b.radius, now()]);
        }
      });
      log(`${seed.length} brejos iniciais cadastrados`);
    }
  }

  let outageUntil = 0;

  // Presença: quem está com o jogo aberto agora e onde. É um estado "leve": fica só na memória
  // do servidor e expira sozinho (PRESENCE_TTL). Não vai para o banco nem para a fila offline,
  // porque uma posição velha não tem valor. Cada jogador só recebe quem está perto dele.
  const PRESENCE_TTL = 45_000;
  const PRESENCE_RADIUS_M = 300;
  const presence = new Map(); // playerId -> { id, name, look, lat, lng, mode, ts }
  const round5 = (v) => Math.round(v * 20000) / 20000; // ~5 m: ninguém precisa da posição exata dos outros
  function cleanPresence() {
    const t = now();
    for (const [k, v] of presence) if (t - v.ts > PRESENCE_TTL) presence.delete(k);
  }
  const rate = new Map();

  async function brejos() {
    const rows = await db.query('SELECT id, name, lat, lng, radius FROM brejos WHERE active=1 ORDER BY created_at, id');
    const version = String(hash32(JSON.stringify(rows)));
    return { brejos: rows, version };
  }

  // atrás do proxy do Render todo mundo chega com o mesmo IP: usa o X-Forwarded-For
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  function limit(ip, key, max, windowMs = 60000, message = 'Muitas tentativas. Espere um minuto.') {
    const k = `${key}:${ip}`;
    const t = now();
    const arr = (rate.get(k) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    rate.set(k, arr);
    if (arr.length > max) throw new HttpError(429, message);
  }

  function auth(req) {
    const h = req.headers.authorization || '';
    const pid = tokens.verify(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!pid) throw new HttpError(401, 'Sessão inválida. Entre novamente.');
    return pid;
  }

  // Painel /admin: só com a chave (ADMIN_KEY). Hospedado sem uma chave forte, o painel fica desligado
  // (server/index.js). Chave errada 20 vezes em 10 minutos bloqueia aquele aparelho por um tempo.
  const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
  function requireAdmin(req) {
    if (!adminKey) throw new HttpError(403, 'Painel desligado: falta definir ADMIN_KEY no servidor, com 12 ou mais caracteres (docs/HOSPEDAGEM.md)');
    const k = `admin-erro:${clientIp(req)}`;
    const t = now();
    const fails = (rate.get(k) || []).filter((x) => t - x < 10 * 60_000);
    if (fails.length >= 20) throw new HttpError(429, 'Muitas tentativas com a chave errada. Espere 10 minutos.');
    if (!crypto.timingSafeEqual(digest(req.headers['x-admin-key'] || ''), digest(adminKey))) {
      fails.push(t);
      rate.set(k, fails);
      throw new HttpError(403, 'Chave de administrador incorreta');
    }
  }

  async function playerPublic(id) {
    const p = await db.one('SELECT * FROM players WHERE id=$1', [id]);
    return p && {
      id: p.id, username: p.username, displayName: p.display_name, avatar: p.avatar, look: p.look, friendCode: p.friend_code,
      createdAt: p.created_at, email: p.email || null, google: !!p.google_sub, hasPassword: hasPassword(p),
      termsAccepted: p.terms_version === TERMS_VERSION,
      staff: !!Number(p.staff),   // conta da organização: vê o painel de demonstração
    };
  }

  // usuário interno a partir do e-mail ou do apelido (único; ninguém precisa decorar)
  async function uniqueUsername(q, base) {
    let b = String(base || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_.]/g, '').slice(0, 14);
    if (b.length < 3) b = 'jogador';
    for (let i = 0; i < 50; i++) {
      const u = i === 0 ? b : `${b}${crypto.randomInt(10, 99999)}`;
      if (!(await q.one('SELECT id FROM players WHERE username=$1', [u]))) return u;
    }
    return `j${crypto.randomUUID().slice(0, 12)}`;
  }

  async function createPlayer({ username = null, displayName, passHash, email = null, googleSub = null, emailVerified = 0, terms = false }) {
    const id = crypto.randomUUID();
    await db.tx(async (q) => {
      let code;
      do { code = friendCode(); } while (await q.one('SELECT id FROM players WHERE friend_code=$1', [code]));
      const uname = username || (await uniqueUsername(q, email ? email.split('@')[0] : displayName));
      await q.run(
        `INSERT INTO players (id, username, display_name, pass_hash, avatar, avatar_ts, friend_code, created_at, email, google_sub, email_verified, terms_version, terms_at)
         VALUES ($1,$2,$3,$4,'frog_leaf',0,$5,$6,$7,$8,$9,$10,$11)`,
        [id, uname, displayName, passHash, code, now(), email, googleSub, emailVerified, terms ? TERMS_VERSION : null, terms ? now() : null],
      );
    });
    return id;
  }

  const session = async (id, extra = {}) => ({ token: tokens.issue(id), player: await playerPublic(id), serverTime: now(), ...extra });

  async function verifyGoogle(credential) {
    if (!google) throw new HttpError(404, 'O login com Google ainda não foi configurado no servidor');
    try { return await google(credential); } catch (e) {
      throw new HttpError(401, e instanceof GoogleError ? e.message : 'Não foi possível confirmar o login com o Google. Tente de novo.');
    }
  }

  // ----- código por e-mail -----
  const mailStats = { sent: 0, failed: 0, today: 0, day: '', lastError: null, lastErrorAt: 0 };
  // guarda só uma assinatura do código, presa ao pedido (ticket): quem lê o banco não vê o código
  const codeHash = (ticket, code) => crypto.createHmac('sha256', tokenSecret).update(`codigo:${ticket}:${code}`).digest('base64url');
  const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));

  // contra quem tenta encher a caixa de alguém (ou gastar os 300 e-mails do dia)
  function limitMail(req, email) {
    limit(clientIp(req), 'email-ip', 10, 10 * 60_000, 'Muitos e-mails pedidos deste aparelho. Espere alguns minutos.');
    limit(email, 'email-conta', MAILS_PER_EMAIL_HOUR, 3600_000, 'Já mandei vários códigos para esse e-mail. Espere um pouco (até 1 hora) e tente de novo.');
  }

  async function mailCode({ email, purpose, displayName }) {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (mailStats.day !== day) { mailStats.day = day; mailStats.today = 0; }
    if (mailStats.today >= mailDailyMax) {
      throw new HttpError(503, `O jogo já mandou e-mails demais hoje. Tente amanhã${google ? ' ou use "Continuar com Google"' : ''}.`);
    }
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await mailer({ to: email, ...codeEmail({ code, purpose, displayName, minutes: CODE_TTL / 60_000 }) });
    } catch (e) {
      mailStats.failed++;
      mailStats.lastError = String(e.message || e).slice(0, 300);
      mailStats.lastErrorAt = now();
      console.warn('E-mail com código NÃO enviado:', mailStats.lastError);
      throw new HttpError(502, `Não consegui mandar o e-mail agora. Tente de novo daqui a pouco${google ? ' ou use "Continuar com Google"' : ''}.`);
    }
    mailStats.sent++;
    mailStats.today++;
    return code;
  }

  // novo pedido de código: manda o e-mail e só então guarda o pedido (o anterior do mesmo e-mail deixa de valer)
  async function startCode(req, { email, purpose, displayName, data }) {
    const last = await db.one('SELECT sent_at FROM email_codes WHERE email=$1 AND purpose=$2 ORDER BY sent_at DESC LIMIT 1', [email, purpose]);
    const wait = last ? Number(last.sent_at) + RESEND_AFTER - now() : 0;
    if (wait > 0) throw new HttpError(429, `Acabei de mandar um código para esse e-mail. Espere ${secs(wait)} segundos para pedir outro.`, { resendIn: secs(wait) });
    limitMail(req, email);
    const ticket = crypto.randomBytes(18).toString('base64url');
    const code = await mailCode({ email, purpose, displayName });
    const t = now();
    await db.tx(async (q) => {
      await q.run('DELETE FROM email_codes WHERE expires_at < $1 OR (email=$2 AND purpose=$3)', [t - 3600_000, email, purpose]);
      await q.run(`INSERT INTO email_codes (id, email, purpose, code_hash, data, attempts, sent_at, expires_at, created_at)
        VALUES ($1,$2,$3,$4,$5,0,$6,$7,$6)`, [ticket, email, purpose, codeHash(ticket, code), JSON.stringify(data || {}), t, t + CODE_TTL]);
    });
    return { ticket, email, resendIn: RESEND_AFTER / 1000, expiresIn: CODE_TTL / 1000 };
  }

  const gone = () => new HttpError(410, 'Esse código não vale mais. Peça um código novo.', { expired: true });

  // confere o código; certo, o pedido é apagado (vale uma vez só)
  async function useCode({ ticket, code, purpose }) {
    const id = String(ticket || '').slice(0, 64);
    const row = id ? await db.one('SELECT * FROM email_codes WHERE id=$1 AND purpose=$2', [id, purpose]) : null;
    if (!row) throw gone();
    const drop = () => db.tx((q) => q.run('DELETE FROM email_codes WHERE id=$1', [id]));
    if (Number(row.expires_at) < now()) {
      await drop();
      throw new HttpError(410, `O código venceu (ele vale ${CODE_TTL / 60_000} minutos). Peça um código novo.`, { expired: true });
    }
    // conta a tentativa antes de conferir (duas tentativas ao mesmo tempo não passam do limite)
    const counted = await db.tx((q) => q.run('UPDATE email_codes SET attempts = attempts + 1 WHERE id=$1 AND attempts < $2', [id, MAX_ATTEMPTS]));
    if (!counted.changes) { await drop(); throw new HttpError(429, 'Muitas tentativas erradas. Peça um código novo.', { expired: true }); }
    const typed = String(code || '').replace(/\D/g, '');
    if (typed.length !== 6 || !sameHash(codeHash(id, typed), row.code_hash)) {
      const left = MAX_ATTEMPTS - Number(row.attempts) - 1;
      if (left <= 0) { await drop(); throw new HttpError(400, 'Código errado de novo. Peça um código novo.', { expired: true, attemptsLeft: 0 }); }
      throw new HttpError(400, `Código errado. Confira o e-mail: você tem mais ${left} tentativa${left > 1 ? 's' : ''}.`, { attemptsLeft: left });
    }
    const used = await drop();
    if (!used.changes) throw gone();   // o mesmo código foi usado ao mesmo tempo em outro toque
    return { row, data: JSON.parse(row.data || '{}') };
  }

  async function dbSize() {
    try {
      const r = db.kind === 'postgres'
        ? await db.one('SELECT pg_database_size(current_database()) AS n')
        : await db.one('SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()');
      return Number(r?.n) || null;
    } catch { return null; }
  }

  const routes = {
    'GET /api/health': async () => ({ ok: true, serverTime: now(), version: VERSION }),

    // configuração pública do app (chave gratuita do mapa CARTO, se houver)
    'GET /api/config': async () => ({
      cartoKey: process.env.CARTO_KEY || null, googleClientId: googleClientId || null, emailConfirm: !!mailer,
      // contato mostrado na Política de Privacidade e nos Termos (por padrão, o e-mail que manda os códigos)
      contactEmail: process.env.CONTACT_EMAIL || process.env.EMAIL_FROM || null,
    }),

    // Criar conta: apelido + e-mail + senha (8 ou mais). Sem e-mail, vale o formato antigo com usuário.
    'POST /api/auth/register': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const displayName = cleanName(body.displayName);
      const password = String(body.password || '');
      const email = String(body.email || '').trim().toLowerCase();
      if (!email && body.username) {
        const username = String(body.username || '').trim().toLowerCase();
        if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new HttpError(400, 'Usuário deve ter 3 a 20 letras, números, ponto ou _');
        const name = displayName || username;
        if (name.length < 2 || name.length > 24) throw new HttpError(400, 'O apelido deve ter de 2 a 24 caracteres');
        if (password.length < 8) throw new HttpError(400, 'A senha precisa de pelo menos 8 caracteres');
        if (await db.one('SELECT id FROM players WHERE username=$1', [username])) throw new HttpError(409, 'Esse usuário já existe');
        const id = await createPlayer({ username, displayName: name, passHash: await hashPassword(password) });
        log(`novo jogador: ${username}`);
        return session(id);
      }
      if (displayName.length < 2 || displayName.length > 24) throw new HttpError(400, 'O apelido deve ter de 2 a 24 caracteres');
      if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Esse e-mail não parece certo');
      if (password.length < 8) throw new HttpError(400, 'A senha precisa de pelo menos 8 caracteres');
      if (body.acceptTerms !== true) throw new HttpError(400, TERMS_NEEDED);
      const same = await db.one('SELECT * FROM players WHERE email=$1', [email]);
      if (same) {
        throw new HttpError(409, same.google_sub && !hasPassword(same)
          ? 'Esse e-mail já entra com o Google: use "Continuar com Google"'
          : 'Já existe uma conta com esse e-mail. Entre com ela.');
      }
      // Com o carteiro ligado, a conta só nasce depois do código que vai para o e-mail
      // (ninguém cria conta com o e-mail de outra pessoa).
      if (mailer) {
        const out = await startCode(req, { email, purpose: 'signup', displayName, data: { displayName, passHash: await hashPassword(password), terms: true } });
        log(`cadastro esperando o código do e-mail: ${displayName}`);
        return { needsCode: true, ...out };
      }
      const id = await createPlayer({ displayName, passHash: await hashPassword(password), email, terms: true });
      log(`novo jogador (e-mail): ${displayName}`);
      return session(id);
    },

    // Aceite dos termos por quem já tinha conta (ou quando a versão dos termos muda)
    'POST /api/auth/terms': async (req, body) => {
      const playerId = auth(req);
      if (body.accept !== true) throw new HttpError(400, TERMS_NEEDED);
      await db.tx((q) => q.run('UPDATE players SET terms_version=$1, terms_at=$2 WHERE id=$3', [TERMS_VERSION, now(), playerId]));
      return { player: await playerPublic(playerId) };
    },

    // Terminar o cadastro com o código de 6 números
    'POST /api/auth/register/confirm': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const { row, data } = await useCode({ ticket: body.ticket, code: body.code, purpose: 'signup' });
      if (await db.one('SELECT id FROM players WHERE email=$1', [row.email])) throw new HttpError(409, 'Já existe uma conta com esse e-mail. Entre com ela.');
      const id = await createPlayer({ displayName: data.displayName, passHash: data.passHash, email: row.email, emailVerified: 1, terms: !!data.terms });
      log(`novo jogador (e-mail confirmado): ${data.displayName}`);
      return session(id, { created: true });
    },

    // Mandar o código de novo (mesmo pedido; depois de 1 minuto)
    'POST /api/auth/code/resend': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      if (!mailer) throw new HttpError(404, 'O envio de e-mails não está ligado neste servidor');
      const ticket = String(body.ticket || '').slice(0, 64);
      const row = ticket ? await db.one('SELECT * FROM email_codes WHERE id=$1', [ticket]) : null;
      if (!row || Number(row.expires_at) < now()) throw new HttpError(410, 'Esse pedido venceu. Comece de novo.', { expired: true });
      const wait = Number(row.sent_at) + RESEND_AFTER - now();
      if (wait > 0) throw new HttpError(429, `Espere ${secs(wait)} segundos para pedir outro código.`, { resendIn: secs(wait) });
      limitMail(req, row.email);
      const data = JSON.parse(row.data || '{}');
      const code = await mailCode({ email: row.email, purpose: row.purpose, displayName: data.displayName });
      const t = now();
      await db.tx((q) => q.run('UPDATE email_codes SET code_hash=$1, attempts=0, sent_at=$2, expires_at=$3 WHERE id=$4',
        [codeHash(ticket, code), t, t + CODE_TTL, ticket]));
      return { ticket, email: row.email, resendIn: RESEND_AFTER / 1000, expiresIn: CODE_TTL / 1000 };
    },

    // Esqueci a senha: manda um código para o e-mail da conta
    'POST /api/auth/forgot': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      if (!mailer) throw new HttpError(404, 'A recuperação por e-mail ainda não está ligada. Peça ao organizador do jogo para trocar sua senha.');
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Esse e-mail não parece certo');
      const p = await db.one('SELECT id, display_name FROM players WHERE email=$1', [email]);
      if (!p) throw new HttpError(404, 'Não achei nenhuma conta com esse e-mail. Confira ou crie uma conta.');
      const out = await startCode(req, { email, purpose: 'reset', displayName: p.display_name, data: { displayName: p.display_name } });
      log(`código de senha nova enviado: ${p.display_name}`);
      return out;
    },

    // Senha nova com o código (e já entra)
    'POST /api/auth/reset': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const password = String(body.password || '');
      if (password.length < 8) throw new HttpError(400, 'A senha nova precisa de pelo menos 8 caracteres');
      const { row } = await useCode({ ticket: body.ticket, code: body.code, purpose: 'reset' });
      const p = await db.one('SELECT id, display_name FROM players WHERE email=$1', [row.email]);
      if (!p) throw new HttpError(404, 'Essa conta não existe mais');
      const passHash = await hashPassword(password);
      // o código provou que o e-mail é da pessoa
      await db.tx((q) => q.run('UPDATE players SET pass_hash=$1, email_verified=1 WHERE id=$2', [passHash, p.id]));
      log(`senha nova pelo código do e-mail: ${p.display_name}`);
      return session(p.id, { passwordChanged: true });
    },

    // Entrar: e-mail (ou o usuário antigo) + senha. Além do limite por aparelho, 10 tentativas por minuto por conta.
    'POST /api/auth/login': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const ident = String(body.email ?? body.username ?? '').trim().toLowerCase();
      limit(ident, 'login-conta', 10);
      const p = ident.includes('@')
        ? await db.one('SELECT * FROM players WHERE email=$1', [ident])
        : await db.one('SELECT * FROM players WHERE username=$1', [ident]);
      if (p && p.google_sub && !hasPassword(p)) throw new HttpError(401, 'Essa conta entra com o Google: use "Continuar com Google" (ou crie uma senha no Perfil)');
      if (!p || !(await verifyPassword(String(body.password || ''), p.pass_hash))) throw new HttpError(401, 'E-mail ou senha incorretos');
      return session(p.id);
    },

    // "Continuar com Google": entra, liga a uma conta com o mesmo Gmail ou cria uma conta nova.
    // Conta nova: a primeira resposta pede o apelido (needsNickname) e o celular manda de novo com ele.
    'POST /api/auth/google': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const g = await verifyGoogle(body.credential);
      let p = await db.one('SELECT * FROM players WHERE google_sub=$1', [g.sub]);
      if (p) return session(p.id);
      if (g.email) {
        const same = await db.one('SELECT * FROM players WHERE email=$1', [g.email]);
        if (same) {
          // O Google só é "dono" de endereços @gmail.com e de contas Google Workspace (com hd).
          // Fora disso, não liga sozinho: a pessoa entra com a senha e liga o Google pelo Perfil.
          if (!g.email.endsWith('@gmail.com') && !g.hd) {
            throw new HttpError(409, 'Já existe uma conta com esse e-mail. Entre com e-mail e senha e ligue o Google pelo Perfil.');
          }
          if (same.google_sub) throw new HttpError(409, 'Esse e-mail já está ligado a outra conta Google');
          // O Google confirmou que o e-mail é desta pessoa. Se o e-mail da conta nunca tinha sido
          // confirmado, a senha antiga é desativada: quem a criou podia não ser o dono do e-mail.
          const resetPass = !same.email_verified && hasPassword(same);
          await db.tx((q) => q.run('UPDATE players SET google_sub=$1, email_verified=1, pass_hash=$2 WHERE id=$3',
            [g.sub, resetPass ? NO_PASSWORD : same.pass_hash, same.id]));
          log(`conta ligada ao Google: ${same.username}`);
          return session(same.id, { linked: true, passwordReset: resetPass });
        }
      }
      const displayName = cleanName(body.displayName);
      if (!displayName) return { needsNickname: true, suggestion: (g.givenName || g.name || '').slice(0, 24) };
      if (displayName.length < 2 || displayName.length > 24) throw new HttpError(400, 'O apelido deve ter de 2 a 24 caracteres');
      if (body.acceptTerms !== true) throw new HttpError(400, TERMS_NEEDED);
      const id = await createPlayer({ displayName, passHash: NO_PASSWORD, email: g.email, googleSub: g.sub, emailVerified: g.email ? 1 : 0, terms: true });
      log(`novo jogador (Google): ${displayName}`);
      return session(id, { created: true });
    },

    // Ligar a conta atual a uma conta Google (pelo Perfil)
    'POST /api/auth/google/link': async (req, body) => {
      const playerId = auth(req);
      const g = await verifyGoogle(body.credential);
      const me = await db.one('SELECT * FROM players WHERE id=$1', [playerId]);
      if (!me) throw new HttpError(401, 'Sessão inválida. Entre novamente.');
      const owner = await db.one('SELECT id FROM players WHERE google_sub=$1', [g.sub]);
      if (owner && owner.id !== playerId) throw new HttpError(409, 'Essa conta Google já está ligada a outro jogador');
      if (me.google_sub && me.google_sub !== g.sub) throw new HttpError(409, 'Sua conta já está ligada a outra conta Google');
      let email = me.email, verified = me.email_verified;
      if (g.email && (!me.email || me.email === g.email)) {
        const taken = await db.one('SELECT id FROM players WHERE email=$1 AND id<>$2', [g.email, playerId]);
        if (!taken) { email = g.email; verified = 1; }
      }
      await db.tx((q) => q.run('UPDATE players SET google_sub=$1, email=$2, email_verified=$3 WHERE id=$4', [g.sub, email, verified, playerId]));
      return { player: await playerPublic(playerId) };
    },

    // Criar ou trocar a senha (logado). Trocar pede a senha atual.
    'POST /api/auth/password': async (req, body) => {
      const playerId = auth(req);
      limit(playerId, 'troca-senha', 10);
      const me = await db.one('SELECT * FROM players WHERE id=$1', [playerId]);
      if (!me) throw new HttpError(401, 'Sessão inválida. Entre novamente.');
      const password = String(body.password || '');
      if (password.length < 8) throw new HttpError(400, 'A senha precisa de pelo menos 8 caracteres');
      if (hasPassword(me) && !(await verifyPassword(String(body.current || ''), me.pass_hash))) throw new HttpError(401, 'A senha atual não confere');
      await db.tx(async (q) => q.run('UPDATE players SET pass_hash=$1 WHERE id=$2', [await hashPassword(password), playerId]));
      return { player: await playerPublic(playerId) };
    },

    'GET /api/brejos': async () => brejos(),

    'POST /api/sync': async (req, body) => {
      const playerId = auth(req);
      const deviceId = String(body.deviceId || '').slice(0, 64) || 'desconhecido';
      const ops = Array.isArray(body.ops) ? body.ops.slice(0, 100) : [];
      const results = [];
      for (const op of ops) results.push(await sync.applyOp(playerId, deviceId, op));
      if (ops.length) {
        const s = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
        log(`sync ${deviceId.slice(0, 8)}: ${ops.length} ops ->`, JSON.stringify(s));
      }
      const state = await sync.snapshot(playerId);
      if (!state) throw new HttpError(401, 'Jogador não existe mais. Entre novamente.');
      const b = await brejos();
      // quantas operações deste aparelho o servidor guarda: se o banco perder algo (restaurado de um
      // backup, por exemplo), o aparelho percebe e reenvia o que faltar
      const seen = Number((await db.one('SELECT COUNT(*) AS n FROM operations WHERE player_id=$1 AND device_id=$2', [playerId, deviceId])).n);
      return {
        results, state, serverTime: now(), seen,
        brejosVersion: b.version,
        brejos: body.brejosVersion === b.version ? undefined : b.brejos,
      };
    },

    'POST /api/presence': async (req, body) => {
      const playerId = auth(req);
      const lat = Number(body?.lat), lng = Number(body?.lng);
      cleanPresence();
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new HttpError(400, 'Posição inválida');
      }
      if (body.hidden) presence.delete(playerId);
      else {
        const p = await db.one('SELECT display_name, look FROM players WHERE id=$1', [playerId]);
        if (!p) throw new HttpError(401, 'Sessão inválida');
        presence.set(playerId, {
          id: playerId, name: p.display_name, look: validLook(body.look) ? body.look : p.look, lat: round5(lat), lng: round5(lng),
          mode: body.mode === 'controle' ? 'controle' : 'gps', ts: now(),
          vehicle: body.mode === 'controle' && carById(body.vehicle) ? body.vehicle : null,
        });
      }
      const me = { lat, lng };
      const players = [...presence.values()]
        .filter((o) => o.id !== playerId)
        .map((o) => ({ ...o, d: distanceM(me, o) }))
        .filter((o) => o.d <= PRESENCE_RADIUS_M)
        .sort((a, b) => a.d - b.d)
        .slice(0, 30)
        .map(({ d, ts, ...o }) => ({ ...o, age: now() - ts }));
      return { players, serverTime: now() };
    },

    'GET /api/ranking': async (req) => {
      const playerId = auth(req);
      const rows = await sync.ranking();
      const boards = await sync.boards(playerId);
      // top/me: o ranking de XP (formato antigo); boards: XP, capturas e Brejais ganhos
      return { top: boards.xp.top.slice(0, 20), me: boards.xp.me, players: rows.filter((r) => !r.staff).length, boards };
    },

    // Perfil de um parceiro de brejo (só de quem já é amigo): nível, XP, Brejais ganhos, espécies, capturas
    'GET /api/friends/profile': async (req, body, url) => {
      const playerId = auth(req);
      const id = String(url.searchParams.get('id') || '');
      const f = await db.one(
        `SELECT p.id, p.display_name, p.avatar, p.look, f.created_at FROM friendships f JOIN players p ON p.id = f.friend_id
         WHERE f.player_id=$1 AND f.friend_id=$2`, [playerId, id],
      );
      if (!f) throw new HttpError(404, 'Esse jogador não é seu parceiro de brejo');
      const r = (await sync.ranking()).find((x) => x.id === id) || {};
      return {
        id: f.id, displayName: f.display_name, avatar: f.avatar, look: f.look || null, since: Number(f.created_at),
        level: r.level || 1, xp: r.xp || 0, gold: r.gold || 0, species: r.collected || 0, captures: r.captures || 0,
      };
    },

    'GET /api/players/code': async (req, body, url) => {
      auth(req);
      const code = String(url.searchParams.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const p = await db.one('SELECT * FROM players WHERE friend_code=$1', [code]);
      if (!p) throw new HttpError(404, 'Nenhum jogador com esse código');
      const caps = await db.query('SELECT DISTINCT species_id FROM captures WHERE player_id=$1', [p.id]);
      return { id: p.id, displayName: p.display_name, avatar: p.avatar, mask: maskFromSpecies(catalog, caps.map((c) => c.species_id)) };
    },

    // ----- administração / demonstração -----
    'GET /api/admin/overview': async (req) => {
      requireAdmin(req);
      const players = await db.query('SELECT id, username, display_name, email, google_sub, staff, created_at FROM players ORDER BY created_at DESC');
      const ranking = await sync.ranking();
      const xpBy = new Map(ranking.map((r) => [r.id, r]));
      const t = now();
      return {
        serverTime: t,
        db: db.kind,
        outageUntil,
        online: (cleanPresence(), presence.size),
        health: {
          backupAutoAt: Number((await db.one("SELECT value FROM settings WHERE key='backup_auto_at'"))?.value) || null,
          backupManualAt: Number((await db.one("SELECT value FROM settings WHERE key='backup_manual_at'"))?.value) || null,
          dbBytes: await dbSize(),
        },
        mail: { enabled: !!mailer, sent: mailStats.sent, failed: mailStats.failed, today: mailStats.today, dailyMax: mailDailyMax, lastError: mailStats.lastError, lastErrorAt: mailStats.lastErrorAt },
        counts: {
          players: players.length,
          external: players.filter((p) => !Number(p.staff)).length,
          staff: players.filter((p) => Number(p.staff)).length,
          captures: Number((await db.one('SELECT COUNT(*) AS n FROM captures')).n),
          operations: Number((await db.one('SELECT COUNT(*) AS n FROM operations')).n),
          resends: sync.stats.duplicates,
          rejected: Number((await db.one("SELECT COUNT(*) AS n FROM operations WHERE status='rejected'")).n),
          conflicts: Number((await db.one('SELECT COUNT(*) AS n FROM conflicts')).n),
          activeToday: Number((await db.one('SELECT COUNT(DISTINCT player_id) AS n FROM operations WHERE received_at > $1', [t - 86400000])).n),
          activeExternal: Number((await db.one('SELECT COUNT(DISTINCT o.player_id) AS n FROM operations o JOIN players p ON p.id = o.player_id WHERE o.received_at > $1 AND p.staff = 0', [t - 86400000])).n),
        },
        players: players.map(({ google_sub, staff, ...p }) => ({ ...p, google: !!google_sub, staff: !!Number(staff), xp: xpBy.get(p.id)?.xp ?? 0, level: xpBy.get(p.id)?.level ?? 1, species: xpBy.get(p.id)?.species ?? 0, captures: xpBy.get(p.id)?.captures ?? 0 })),
        captures: await db.query(
          `SELECT c.id, c.spawn_id, c.species_id, c.kind, c.mode, c.caught_at, c.received_at, c.device_id, p.username
           FROM captures c JOIN players p ON p.id = c.player_id ORDER BY c.received_at DESC LIMIT 40`),
        operations: await db.query(
          `SELECT o.op_id, o.type, o.status, o.device_id, o.client_ts, o.received_at, p.username
           FROM operations o JOIN players p ON p.id = o.player_id ORDER BY o.received_at DESC LIMIT 60`),
        partidas: await db.query(
          `SELECT e.id, e.started_at, e.updated_at, p.username,
             (SELECT COUNT(*) FROM captures c WHERE c.expedition_id = e.id) AS captures,
             (SELECT COALESCE(SUM(d.meters), 0) FROM expedition_distance d WHERE d.expedition_id = e.id) AS meters,
             (SELECT COUNT(*) FROM (SELECT device_id FROM captures WHERE expedition_id = e.id
                UNION SELECT device_id FROM expedition_distance WHERE expedition_id = e.id) x) AS devices
           FROM expeditions e JOIN players p ON p.id = e.player_id ORDER BY e.updated_at DESC LIMIT 30`),
        conflicts: await db.query(
          `SELECT c.*, p.username FROM conflicts c JOIN players p ON p.id = c.player_id ORDER BY c.resolved_at DESC LIMIT 30`),
        brejos: (await brejos()).brejos,
      };
    },

    'POST /api/admin/brejos': async (req, body) => {
      requireAdmin(req);
      const name = String(body.name || '').trim().slice(0, 40);
      const lat = Number(body.lat), lng = Number(body.lng), radius = Number(body.radius);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !(radius >= 10 && radius <= 200)) {
        throw new HttpError(400, 'Informe nome, posição e raio entre 10 e 200 m');
      }
      for (const b of (await brejos()).brejos) {
        const d = distanceM({ lat, lng }, b);
        const need = radius + b.radius + MIN_BREJO_GAP_M;
        if (d < need) throw new HttpError(409, `Muito perto do brejo "${b.name}" (${Math.round(d)} m). Afaste pelo menos ${Math.ceil(need - d)} m ou diminua o raio.`);
      }
      const id = 'b' + crypto.randomBytes(4).toString('hex');
      await db.tx((q) => q.run('INSERT INTO brejos (id, name, lat, lng, radius, active, created_at) VALUES ($1,$2,$3,$4,$5,1,$6)',
        [id, name, lat, lng, radius, now()]));
      log(`brejo criado: ${name} (${radius} m)`);
      return { id, ...(await brejos()) };
    },

    'POST /api/admin/brejos/remove': async (req, body) => {
      requireAdmin(req);
      await db.tx((q) => q.run('UPDATE brejos SET active=0 WHERE id=$1', [String(body.id || '')]));
      return brejos();
    },

    // Backup completo (todas as tabelas, em JSON). O GitHub Actions baixa isto todo dia.
    'GET /api/admin/backup': async (req) => {
      requireAdmin(req);
      const data = await exportAll(db, { now: now(), version: VERSION });
      // anota quando foi o último backup (o painel avisa se o automático parar)
      const key = req.headers['x-backup-origem'] === 'github' ? 'backup_auto_at' : 'backup_manual_at';
      await db.tx((q) => q.run('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, String(now())]));
      log(`backup exportado (${key === 'backup_auto_at' ? 'automático' : 'manual'}): ${Object.entries(data.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      return data;
    },

    // Jogador esqueceu a senha e o "Esqueci a senha" por e-mail não resolveu (ou não está ligado):
    // o organizador define uma nova, e o progresso continua todo lá.
    'POST /api/admin/reset-password': async (req, body) => {
      requireAdmin(req);
      const username = String(body.user ?? body.username ?? '').trim().toLowerCase();
      const password = String(body.password || '');
      if (password.length < 8) throw new HttpError(400, 'A senha nova precisa de pelo menos 8 caracteres');
      const p = await db.one('SELECT id, display_name FROM players WHERE username=$1 OR email=$1', [username]);
      if (!p) throw new HttpError(404, 'Nenhum jogador com esse e-mail ou usuário');
      const passHash = await hashPassword(password);
      await db.tx((q) => q.run('UPDATE players SET pass_hash=$1 WHERE id=$2', [passHash, p.id]));
      log(`senha redefinida pelo administrador: ${username}`);
      return { ok: true, displayName: p.display_name };
    },

    // Conta da organização (demonstração): continua uma conta normal, com senha só sua, mas não aparece
    // no ranking dos outros jogadores e não conta como jogador externo no painel
    'POST /api/admin/staff': async (req, body) => {
      requireAdmin(req);
      const user = String(body.user || '').trim().toLowerCase();
      const p = user ? await db.one('SELECT id, display_name FROM players WHERE username=$1 OR email=$1', [user]) : null;
      if (!p) throw new HttpError(404, 'Nenhum jogador com esse e-mail. Crie a conta no jogo primeiro.');
      const staff = body.staff === false ? 0 : 1;
      await db.tx((q) => q.run('UPDATE players SET staff=$1 WHERE id=$2', [staff, p.id]));
      sync.refreshRanking();
      log(`${p.display_name} ${staff ? 'virou' : 'deixou de ser'} conta da organização`);
      return { ok: true, displayName: p.display_name, staff: !!staff };
    },

    // LGPD: apagar uma conta e tudo ligado a ela, a pedido do jogador (Política de Privacidade).
    // Para não apagar por engano, o e-mail tem de ser digitado duas vezes.
    'POST /api/admin/delete-player': async (req, body) => {
      requireAdmin(req);
      const user = String(body.user || '').trim().toLowerCase();
      const p = user ? await db.one('SELECT id, display_name, email FROM players WHERE username=$1 OR email=$1', [user]) : null;
      if (!p) throw new HttpError(404, 'Nenhum jogador com esse e-mail');
      if (String(body.confirm || '').trim().toLowerCase() !== user) throw new HttpError(400, 'Para confirmar, escreva o mesmo e-mail nos dois campos');
      await db.tx(async (q) => {
        await q.run('DELETE FROM expedition_distance WHERE expedition_id IN (SELECT id FROM expeditions WHERE player_id=$1)', [p.id]);
        for (const t of ['captures', 'expeditions', 'operations', 'conflicts', 'jobs', 'purchases', 'sales']) {
          await q.run(`DELETE FROM ${t} WHERE player_id=$1`, [p.id]);
        }
        await q.run('DELETE FROM friendships WHERE player_id=$1 OR friend_id=$1', [p.id]);
        await q.run('DELETE FROM trades WHERE from_id=$1 OR to_id=$1', [p.id]);
        if (p.email) await q.run('DELETE FROM email_codes WHERE email=$1', [p.email]);
        await q.run('DELETE FROM players WHERE id=$1', [p.id]);
      });
      presence.delete(p.id);
      sync.refreshRanking();
      log(`conta apagada a pedido do jogador: ${p.display_name}`);
      return { ok: true, displayName: p.display_name };
    },

    // Testar o Brevo: manda um e-mail de teste e, se falhar, mostra o motivo exato
    'POST /api/admin/test-email': async (req, body) => {
      requireAdmin(req);
      if (!mailer) throw new HttpError(404, 'O e-mail está desligado: faltam BREVO_API_KEY e EMAIL_FROM no Render (docs/HOSPEDAGEM.md, passo 7)');
      const to = String(body.to || '').trim().toLowerCase();
      if (!EMAIL_RE.test(to)) throw new HttpError(400, 'Esse e-mail não parece certo');
      try {
        await mailer({ to, ...codeEmail({ purpose: 'test' }) });
      } catch (e) {
        mailStats.failed++;
        mailStats.lastError = String(e.message || e).slice(0, 300);
        mailStats.lastErrorAt = now();
        throw new HttpError(400, `O e-mail não saiu. ${mailStats.lastError}`);
      }
      mailStats.sent++;
      mailStats.today++;
      log(`e-mail de teste enviado para ${to}`);
      return { ok: true, from: process.env.EMAIL_FROM || null };
    },

    'POST /api/admin/outage': async (req, body) => {
      requireAdmin(req);
      const seconds = Math.max(0, Math.min(600, Number(body.seconds) || 0));
      outageUntil = seconds ? now() + seconds * 1000 : 0;
      log(seconds ? `SIMULAÇÃO: servidor indisponível por ${seconds}s` : 'SIMULAÇÃO: servidor de volta');
      return { outageUntil };
    },
  };

  function send(res, status, data, headers = {}) {
    const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': typeof data === 'object' && !Buffer.isBuffer(data) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 512 * 1024) { reject(new HttpError(413, 'Requisição grande demais')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON inválido')); }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    if (rel === '/admin') rel = '/admin.html';
    const file = path.normalize(path.join(CLIENT_DIR, rel));
    if (!file.startsWith(CLIENT_DIR + path.sep)) return send(res, 403, 'Proibido');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        // rotas desconhecidas sem extensão caem no app
        if (!path.extname(rel)) return serveStatic(req, res, '/index.html');
        return send(res, 404, 'Não encontrado');
      }
      const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
      if (rel === '/sw.js') headers['Service-Worker-Allowed'] = '/';
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    try {
      if (url.pathname === '/healthz') return send(res, 200, 'ok');
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (outageUntil > now() && !url.pathname.startsWith('/api/admin/')) {
        return send(res, 503, { error: 'Servidor indisponível (simulação de queda)' }, { ...cors, 'Retry-After': String(Math.ceil((outageUntil - now()) / 1000)) });
      }
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) throw new HttpError(404, 'Rota não encontrada');
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await route(req, body, url);
      send(res, 200, out, cors);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      send(res, status, { error: status === 500 ? 'Erro interno no servidor' : e.message, ...(status === 500 ? {} : e.extra || {}) }, cors);
    }
  }

  return {
    handler,
    server: () => http.createServer(handler),
    catalog,
    sync,
    xp: (caps) => levelFor(xpBreakdown(caps, catalog).total),
  };
}
