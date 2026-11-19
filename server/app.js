import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, makeTokens, friendCode } from './auth.js';
import { makeSync } from './sync.js';
import { hash32, maskFromSpecies, xpBreakdown, levelFor, distanceM, MIN_BREJO_GAP_M, validLook } from '../client/js/shared/game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'client');
export const VERSION = '1.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(path.join(CLIENT_DIR, 'assets', 'species.json'), 'utf8'));
}

export async function createApp({ db, adminKey = process.env.ADMIN_KEY || 'brejo-admin', tokenSecret = process.env.TOKEN_SECRET, now = () => Date.now(), quiet = false } = {}) {
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

  // Lugares especiais do campus (server/lugares.json): cada um é um brejo fixo com uma
  // perereca exclusiva. A cada início do servidor o arquivo é aplicado de novo (cria o que
  // falta e atualiza nome, posição e perereca), então basta editar o arquivo e publicar.
  const placesFile = path.join(ROOT, 'server', 'lugares.json');
  if (fs.existsSync(placesFile)) {
    const places = JSON.parse(fs.readFileSync(placesFile, 'utf8'));
    await db.tx(async (q) => {
      for (const p of places) {
        if (!catalog.species.some((s) => s.id === p.species)) throw new Error(`lugares.json: perereca desconhecida ${p.species}`);
        const ex = await q.one('SELECT id FROM brejos WHERE id=$1', [p.id]);
        if (ex) {
          await q.run('UPDATE brejos SET name=$1, lat=$2, lng=$3, radius=$4, species=$5, active=1 WHERE id=$6', [p.name, p.lat, p.lng, p.radius, p.species, p.id]);
        } else {
          await q.run('INSERT INTO brejos (id, name, lat, lng, radius, active, created_at, species) VALUES ($1,$2,$3,$4,$5,1,$6,$7)',
            [p.id, p.name, p.lat, p.lng, p.radius, 0, p.species]);
        }
      }
    });
    log(`${places.length} lugares especiais do campus`);
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
    const rows = await db.query('SELECT id, name, lat, lng, radius, species FROM brejos WHERE active=1 ORDER BY created_at, id');
    for (const r of rows) if (!r.species) delete r.species;
    const version = String(hash32(JSON.stringify(rows)));
    return { brejos: rows, version };
  }

  // atrás do proxy do Render todo mundo chega com o mesmo IP: usa o X-Forwarded-For
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

  function limit(ip, key, max) {
    const k = `${key}:${ip}`;
    const t = now();
    const arr = (rate.get(k) || []).filter((x) => t - x < 60000);
    arr.push(t);
    rate.set(k, arr);
    if (arr.length > max) throw new HttpError(429, 'Muitas tentativas. Espere um minuto.');
  }

  function auth(req) {
    const h = req.headers.authorization || '';
    const pid = tokens.verify(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!pid) throw new HttpError(401, 'Sessão inválida. Entre novamente.');
    return pid;
  }

  function requireAdmin(req) {
    if (req.headers['x-admin-key'] !== adminKey) throw new HttpError(403, 'Chave de administrador incorreta');
  }

  async function playerPublic(id) {
    const p = await db.one('SELECT * FROM players WHERE id=$1', [id]);
    return p && { id: p.id, username: p.username, displayName: p.display_name, avatar: p.avatar, look: p.look, friendCode: p.friend_code, createdAt: p.created_at };
  }

  const routes = {
    'GET /api/health': async () => ({ ok: true, serverTime: now(), version: VERSION }),

    // configuração pública do app (chave gratuita do mapa CARTO, se houver)
    'GET /api/config': async () => ({ cartoKey: process.env.CARTO_KEY || null }),

    'POST /api/auth/register': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const username = String(body.username || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim().replace(/\s+/g, ' ');
      const password = String(body.password || '');
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new HttpError(400, 'Usuário deve ter 3 a 20 letras, números, ponto ou _');
      if (displayName.length < 2 || displayName.length > 24) throw new HttpError(400, 'Nome deve ter de 2 a 24 caracteres');
      if (password.length < 6) throw new HttpError(400, 'A senha precisa de pelo menos 6 caracteres');
      if (await db.one('SELECT id FROM players WHERE username=$1', [username])) throw new HttpError(409, 'Esse usuário já existe');
      const id = crypto.randomUUID();
      const passHash = await hashPassword(password);
      await db.tx(async (q) => {
        let code;
        do { code = friendCode(); } while (await q.one('SELECT id FROM players WHERE friend_code=$1', [code]));
        await q.run(
          `INSERT INTO players (id, username, display_name, pass_hash, avatar, avatar_ts, friend_code, created_at)
           VALUES ($1,$2,$3,$4,'frog_leaf',0,$5,$6)`, [id, username, displayName, passHash, code, now()],
        );
      });
      log(`novo jogador: ${username}`);
      return { token: tokens.issue(id), player: await playerPublic(id), serverTime: now() };
    },

    'POST /api/auth/login': async (req, body) => {
      limit(clientIp(req), 'auth', 30);
      const username = String(body.username || '').trim().toLowerCase();
      const p = await db.one('SELECT * FROM players WHERE username=$1', [username]);
      if (!p || !(await verifyPassword(String(body.password || ''), p.pass_hash))) throw new HttpError(401, 'Usuário ou senha incorretos');
      return { token: tokens.issue(p.id), player: await playerPublic(p.id), serverTime: now() };
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
      return {
        results, state, serverTime: now(),
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
      const idx = rows.findIndex((r) => r.id === playerId);
      return { top: rows.slice(0, 20), me: idx >= 0 ? { rank: idx + 1, ...rows[idx] } : null, players: rows.length };
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
      const players = await db.query('SELECT id, username, display_name, created_at FROM players ORDER BY created_at DESC');
      const ranking = await sync.ranking();
      const xpBy = new Map(ranking.map((r) => [r.id, r]));
      const t = now();
      return {
        serverTime: t,
        db: db.kind,
        outageUntil,
        online: (cleanPresence(), presence.size),
        counts: {
          players: players.length,
          captures: Number((await db.one('SELECT COUNT(*) AS n FROM captures')).n),
          operations: Number((await db.one('SELECT COUNT(*) AS n FROM operations')).n),
          resends: sync.stats.duplicates,
          rejected: Number((await db.one("SELECT COUNT(*) AS n FROM operations WHERE status='rejected'")).n),
          conflicts: Number((await db.one('SELECT COUNT(*) AS n FROM conflicts')).n),
          activeToday: Number((await db.one('SELECT COUNT(DISTINCT player_id) AS n FROM operations WHERE received_at > $1', [t - 86400000])).n),
        },
        players: players.map((p) => ({ ...p, xp: xpBy.get(p.id)?.xp ?? 0, level: xpBy.get(p.id)?.level ?? 1, species: xpBy.get(p.id)?.species ?? 0, captures: xpBy.get(p.id)?.captures ?? 0 })),
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
      const species = body.species ? String(body.species) : null;
      if (species && !catalog.species.some((s) => s.id === species && s.tier === 'campus')) throw new HttpError(400, 'Perereca exclusiva inválida');
      const id = 'b' + crypto.randomBytes(4).toString('hex');
      await db.tx((q) => q.run('INSERT INTO brejos (id, name, lat, lng, radius, active, created_at, species) VALUES ($1,$2,$3,$4,$5,1,$6,$7)',
        [id, name, lat, lng, radius, now(), species]));
      log(`brejo criado: ${name} (${radius} m)`);
      return { id, ...(await brejos()) };
    },

    'POST /api/admin/brejos/remove': async (req, body) => {
      requireAdmin(req);
      await db.tx((q) => q.run('UPDATE brejos SET active=0 WHERE id=$1', [String(body.id || '')]));
      return brejos();
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
      send(res, status, { error: status === 500 ? 'Erro interno no servidor' : e.message }, cors);
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
