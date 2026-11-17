import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(password, Buffer.from(saltB64, 'base64url'), 32);
  const expected = Buffer.from(keyB64, 'base64url');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

// Token assinado com HMAC (sem estado no servidor). O aparelho guarda o token
// e continua "logado" mesmo offline; o servidor só confere a assinatura.
export function makeTokens(secret) {
  const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return {
    issue(playerId) {
      const body = Buffer.from(JSON.stringify({ pid: playerId, iat: Date.now() })).toString('base64url');
      return `${body}.${sign(body)}`;
    },
    verify(token) {
      if (typeof token !== 'string' || !token.includes('.')) return null;
      const [body, sig] = token.split('.');
      const good = sign(body);
      if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
      try { return JSON.parse(Buffer.from(body, 'base64url').toString()).pid || null; } catch { return null; }
    },
  };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function friendCode() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}
