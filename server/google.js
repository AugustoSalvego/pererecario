// "Continuar com Google": confere o token (ID token, um JWT) que o botão do Google entrega ao
// navegador. Sem biblioteca: a assinatura é verificada com as chaves públicas do Google (JWKS),
// guardadas pelo tempo que o próprio Google indica (Cache-Control). Checagens, como manda a
// documentação do Google: assinatura RS256 válida, iss = accounts.google.com, aud = o nosso
// Client ID e exp ainda não passou. A conta é identificada pelo "sub" (id fixo da conta Google),
// nunca pelo e-mail, que pode mudar.
import crypto from 'node:crypto';

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SKEW_MS = 60 * 1000;   // tolera relógio do servidor um pouco adiantado

export class GoogleError extends Error {}

async function fetchGoogleKeys() {
  const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new GoogleError(`Não foi possível falar com o Google (${r.status})`);
  const maxAge = Number((/max-age=(\d+)/.exec(r.headers.get('cache-control') || '') || [])[1]) || 3600;
  const { keys } = await r.json();
  return { keys, maxAgeMs: maxAge * 1000 };
}

const json64 = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export function makeGoogleVerifier({ clientId, fetchKeys = fetchGoogleKeys, now = () => Date.now() }) {
  let cache = { until: 0, keys: new Map() };
  async function refresh() {
    const { keys, maxAgeMs } = await fetchKeys();
    cache = { until: now() + (maxAgeMs ?? 3600000), keys: new Map((keys || []).map((k) => [k.kid, k])) };
  }
  async function keyFor(kid) {
    if (now() > cache.until) await refresh();
    if (!cache.keys.has(kid)) await refresh();   // o Google troca as chaves de tempos em tempos
    return cache.keys.get(kid) || null;
  }

  return async function verify(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new GoogleError('Login do Google inválido');
    let header, payload;
    try { header = json64(parts[0]); payload = json64(parts[1]); } catch { throw new GoogleError('Login do Google inválido'); }
    if (header.alg !== 'RS256' || !header.kid) throw new GoogleError('Login do Google inválido');
    const jwk = await keyFor(header.kid);
    if (!jwk) throw new GoogleError('Login do Google inválido (chave desconhecida)');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new GoogleError('Login do Google inválido (assinatura)');
    if (!ISSUERS.has(payload.iss)) throw new GoogleError('Login do Google inválido (emissor)');
    if (payload.aud !== clientId) throw new GoogleError('Login do Google feito para outro aplicativo');
    if (!payload.exp || payload.exp * 1000 < now() - SKEW_MS) throw new GoogleError('Login do Google expirou: tente de novo');
    if (!payload.sub) throw new GoogleError('Login do Google inválido');
    return {
      sub: String(payload.sub),
      email: payload.email && payload.email_verified ? String(payload.email).toLowerCase() : null,
      name: String(payload.name || payload.given_name || '').trim(),
      givenName: String(payload.given_name || '').trim(),
      hd: payload.hd ? String(payload.hd) : null,   // conta Google Workspace (o Google é "dono" do e-mail)
    };
  };
}
