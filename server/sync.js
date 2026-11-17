// Aplicação das operações enviadas pelos aparelhos.
//
// Garantias:
//  * Idempotência: cada operação tem um opId (UUID gerado no aparelho). O resultado
//    fica gravado na tabela "operations"; um reenvio devolve o mesmo resultado sem
//    alterar nada ("duplicate").
//  * Atomicidade: cada operação roda numa transação própria junto com o registro
//    no log de operações. Ou tudo é gravado, ou nada.
//  * Conflitos: a mesma perereca (spawnId) capturada em dois aparelhos -> vence a
//    captura mais antiga (caughtAt); empate -> menor deviceId. A regra não depende da
//    ordem de chegada, então todos os aparelhos convergem para o mesmo estado.
import crypto from 'node:crypto';
import {
  spawnsFor, parseSpawnId, giftFor, windowStart, windowEnd, GRACE_MS, dayOf,
  distanceM, CAPTURE_RANGE_M, xpBreakdown, levelFor, validLook, findBrejo,
} from '../client/js/shared/game.js';

const GPS_TOLERANCE_M = 45;
const MAX_FUTURE_MS = 5 * 60 * 1000;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = 80) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

export function makeSync({ db, catalog, now = () => Date.now(), log = () => {} }) {
  const speciesIds = new Set(catalog.species.map((s) => s.id));
  const stats = { duplicates: 0 };

  async function validateCapture(q, playerId, p) {
    const parsed = parseSpawnId(p.spawnId);
    if (!parsed) return { error: 'Encontro inválido' };
    const caughtAt = num(p.caughtAt);
    if (caughtAt === null) return { error: 'Horário da captura ausente' };
    if (caughtAt > now() + MAX_FUTURE_MS) return { error: 'Captura com horário no futuro' };

    if (parsed.kind === 'wild') {
      // brejo cadastrado à mão, ou lagoinha automática (recalculada a partir do próprio id)
      let b = await q.one('SELECT * FROM brejos WHERE id=$1', [parsed.brejoId]);
      if (!b) {
        const manual = await q.query('SELECT id, name, lat, lng, radius FROM brejos WHERE active=1 ORDER BY created_at, id');
        b = findBrejo(parsed.brejoId, manual);
      }
      if (!b) return { error: 'Brejo não existe' };
      const spawn = spawnsFor(b, parsed.win, catalog)[parsed.index];
      if (!spawn) return { error: 'Perereca não existe neste brejo' };
      if (spawn.speciesId !== p.speciesId) return { error: 'Espécie não confere com o encontro' };
      if (caughtAt < windowStart(parsed.win) || caughtAt > windowEnd(parsed.win) + GRACE_MS) {
        return { error: 'Perereca já tinha ido embora nesse horário' };
      }
      if (num(p.lat) !== null && num(p.lng) !== null) {
        const d = distanceM({ lat: p.lat, lng: p.lng }, spawn);
        if (d > CAPTURE_RANGE_M + GPS_TOLERANCE_M) return { error: `Jogador longe demais (${Math.round(d)} m)` };
      }
      return { spawn, brejoId: b.id, friendId: null };
    }

    // presente de amigo (QR code)
    if (parsed.playerId !== playerId) return { error: 'Presente pertence a outro jogador' };
    if (parsed.friendId === playerId) return { error: 'Não dá para presentear a si mesmo' };
    const friend = await q.one('SELECT id FROM players WHERE id=$1', [parsed.friendId]);
    if (!friend) return { error: 'Amigo não encontrado' };
    if (Math.abs(dayOf(caughtAt) - parsed.day) > 1) return { error: 'Presente vencido' };
    const gift = giftFor(playerId, parsed.friendId, parsed.day, Number(p.mask) >>> 0, catalog);
    if (gift.speciesId !== p.speciesId) return { error: 'Espécie do presente não confere' };
    return { spawn: gift, brejoId: null, friendId: parsed.friendId };
  }

  async function insertCapture(q, playerId, deviceId, p, v, fav = { favorite: 0, ts: 0 }) {
    await q.run(
      `INSERT INTO captures (id, player_id, spawn_id, species_id, size_cm, kind, brejo_id, friend_id,
        expedition_id, caught_at, device_id, received_at, favorite, favorite_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.captureId, playerId, p.spawnId, v.spawn.speciesId, v.spawn.sizeCm, v.spawn.kind, v.brejoId,
        v.friendId, str(p.expeditionId, 64), p.caughtAt, deviceId, now(), fav.favorite, fav.ts],
    );
  }

  async function logConflict(q, playerId, spawnId, kept, discarded) {
    await q.run(
      `INSERT INTO conflicts (id, player_id, spawn_id, kept_capture_id, kept_device, kept_at,
        discarded_capture_id, discarded_device, discarded_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [crypto.randomUUID(), playerId, spawnId, kept.id, kept.deviceId, kept.caughtAt,
        discarded.id, discarded.deviceId, discarded.caughtAt, now()],
    );
  }

  async function touchExpedition(q, playerId, id, at) {
    const e = await q.one('SELECT * FROM expeditions WHERE id=$1', [id]);
    if (e && e.player_id !== playerId) return { error: 'Expedição de outro jogador' };
    if (!e) {
      await q.run(
        `INSERT INTO expeditions (id, player_id, started_at, ended_at, status, updated_at)
         VALUES ($1,$2,$3,NULL,'active',$3)`, [id, playerId, at],
      );
    } else if (e.updated_at < at) {
      await q.run('UPDATE expeditions SET updated_at=$1 WHERE id=$2', [at, id]);
    }
    return {};
  }

  async function addDistance(q, expeditionId, deviceId, meters) {
    // G-Counter: cada aparelho só aumenta a própria parcela; o total é a soma.
    await q.run(
      `INSERT INTO expedition_distance (expedition_id, device_id, meters) VALUES ($1,$2,$3)
       ON CONFLICT (expedition_id, device_id) DO UPDATE SET
         meters = CASE WHEN excluded.meters > expedition_distance.meters THEN excluded.meters ELSE expedition_distance.meters END`,
      [expeditionId, deviceId, meters],
    );
  }

  const handlers = {
    async capture(q, playerId, deviceId, p) {
      if (!str(p.captureId, 64) || !str(p.spawnId, 160) || !speciesIds.has(p.speciesId)) {
        return { status: 'rejected', error: 'Captura malformada' };
      }
      const v = await validateCapture(q, playerId, p);
      if (v.error) return { status: 'rejected', error: v.error };

      const existing = await q.one('SELECT * FROM captures WHERE player_id=$1 AND spawn_id=$2', [playerId, p.spawnId]);
      if (!existing) {
        const sameId = await q.one('SELECT id FROM captures WHERE id=$1', [p.captureId]);
        if (sameId) return { status: 'rejected', error: 'Identificador de captura repetido' };
        if (p.expeditionId) await touchExpedition(q, playerId, p.expeditionId, p.caughtAt);
        await insertCapture(q, playerId, deviceId, p, v);
        return { status: 'applied' };
      }
      if (existing.id === p.captureId) return { status: 'applied', note: 'Captura já registrada' };

      const mine = { id: p.captureId, deviceId, caughtAt: p.caughtAt };
      const theirs = { id: existing.id, deviceId: existing.device_id, caughtAt: existing.caught_at };
      const iWin = mine.caughtAt < theirs.caughtAt || (mine.caughtAt === theirs.caughtAt && mine.deviceId < theirs.deviceId);
      if (iWin) {
        if (p.expeditionId) await touchExpedition(q, playerId, p.expeditionId, p.caughtAt);
        await q.run('DELETE FROM captures WHERE id=$1', [existing.id]);
        await insertCapture(q, playerId, deviceId, p, v, { favorite: existing.favorite, ts: existing.favorite_ts });
        await logConflict(q, playerId, p.spawnId, mine, theirs);
        log(`conflito ${p.spawnId}: nova captura (${deviceId}) é mais antiga e substitui a de ${theirs.deviceId}`);
        return { status: 'applied', conflict: { kept: mine, discarded: theirs, policy: 'primeira-captura-vence' } };
      }
      await logConflict(q, playerId, p.spawnId, theirs, mine);
      log(`conflito ${p.spawnId}: mantida captura de ${theirs.deviceId}, descartada a de ${deviceId}`);
      return { status: 'conflict', conflict: { kept: theirs, discarded: mine, policy: 'primeira-captura-vence' } };
    },

    async favorite(q, playerId, deviceId, p) {
      const ts = num(p.ts);
      if (!str(p.spawnId, 160) || ts === null) return { status: 'rejected', error: 'Favorito malformado' };
      // Last-Writer-Wins: só aplica se for mais recente do que o valor guardado.
      const r = await q.run(
        'UPDATE captures SET favorite=$1, favorite_ts=$2 WHERE player_id=$3 AND spawn_id=$4 AND favorite_ts < $2',
        [p.favorite ? 1 : 0, ts, playerId, p.spawnId],
      );
      return r.changes ? { status: 'applied' } : { status: 'applied', note: 'Ignorada: já havia um valor mais recente' };
    },

    async 'expedition.start'(q, playerId, deviceId, p) {
      const at = num(p.startedAt);
      if (!str(p.id, 64) || at === null) return { status: 'rejected', error: 'Expedição malformada' };
      const e = await q.one('SELECT * FROM expeditions WHERE id=$1', [p.id]);
      if (e && e.player_id !== playerId) return { status: 'rejected', error: 'Expedição de outro jogador' };
      if (!e) {
        await q.run(
          `INSERT INTO expeditions (id, player_id, started_at, ended_at, status, updated_at)
           VALUES ($1,$2,$3,NULL,'active',$3)`, [p.id, playerId, at],
        );
      } else if (at < e.started_at) {
        await q.run('UPDATE expeditions SET started_at=$1 WHERE id=$2', [at, p.id]);
      }
      return { status: 'applied' };
    },

    async 'expedition.progress'(q, playerId, deviceId, p) {
      const at = num(p.at), meters = num(p.meters);
      if (!str(p.id, 64) || at === null || meters === null || meters < 0) return { status: 'rejected', error: 'Progresso malformado' };
      const t = await touchExpedition(q, playerId, p.id, at);
      if (t.error) return { status: 'rejected', error: t.error };
      await addDistance(q, p.id, deviceId, Math.min(meters, 100000));
      return { status: 'applied' };
    },

    async 'expedition.end'(q, playerId, deviceId, p) {
      const at = num(p.endedAt), meters = num(p.meters) ?? 0;
      if (!str(p.id, 64) || at === null) return { status: 'rejected', error: 'Fim de expedição malformado' };
      const t = await touchExpedition(q, playerId, p.id, at);
      if (t.error) return { status: 'rejected', error: t.error };
      await addDistance(q, p.id, deviceId, Math.min(Math.max(meters, 0), 100000));
      // "Finalizada" vence "ativa" e o fim considerado é o mais tardio reportado.
      await q.run(
        `UPDATE expeditions SET status='finished',
           ended_at = CASE WHEN ended_at IS NULL OR ended_at < $1 THEN $1 ELSE ended_at END
         WHERE id=$2`, [at, p.id],
      );
      return { status: 'applied' };
    },

    async 'friend.add'(q, playerId, deviceId, p) {
      if (!str(p.friendId, 64)) return { status: 'rejected', error: 'Amigo malformado' };
      if (p.friendId === playerId) return { status: 'rejected', error: 'Você não pode adicionar a si mesmo' };
      const f = await q.one('SELECT id FROM players WHERE id=$1', [p.friendId]);
      if (!f) return { status: 'rejected', error: 'Jogador não encontrado' };
      const at = num(p.at) ?? now();
      for (const [a, b] of [[playerId, p.friendId], [p.friendId, playerId]]) {
        await q.run(
          `INSERT INTO friendships (player_id, friend_id, created_at) VALUES ($1,$2,$3)
           ON CONFLICT (player_id, friend_id) DO NOTHING`, [a, b, at],
        );
      }
      return { status: 'applied' };
    },

    async 'profile.look'(q, playerId, deviceId, p) {
      const ts = num(p.ts);
      if (!validLook(p.look) || ts === null) return { status: 'rejected', error: 'Boneco inválido' };
      // Last-Writer-Wins, como o avatar
      await q.run('UPDATE players SET look=$1, look_ts=$2 WHERE id=$3 AND look_ts < $2', [p.look, ts, playerId]);
      return { status: 'applied' };
    },

    async 'profile.avatar'(q, playerId, deviceId, p) {
      const ts = num(p.ts);
      if (!speciesIds.has(p.speciesId) || ts === null) return { status: 'rejected', error: 'Avatar inválido' };
      await q.run('UPDATE players SET avatar=$1, avatar_ts=$2 WHERE id=$3 AND avatar_ts < $2', [p.speciesId, ts, playerId]);
      return { status: 'applied' };
    },
  };

  async function applyOp(playerId, deviceId, op) {
    const opId = str(op?.opId, 64);
    if (!opId) return { opId: op?.opId ?? null, status: 'rejected', error: 'Operação sem identificador' };
    try {
      return await db.tx(async (q) => {
        const prev = await q.one('SELECT * FROM operations WHERE op_id=$1', [opId]);
        if (prev) {
          if (prev.player_id !== playerId) return { opId, status: 'rejected', error: 'Operação de outro jogador' };
          stats.duplicates++;
          log(`op ${opId.slice(0, 8)} (${prev.type}) reenviada: já aplicada, ignorando`);
          return { opId, status: 'duplicate', original: JSON.parse(prev.result) };
        }
        const handler = handlers[op.type];
        const payload = op.payload && typeof op.payload === 'object' ? op.payload : {};
        const result = handler
          ? await handler(q, playerId, deviceId, payload)
          : { status: 'rejected', error: `Tipo de operação desconhecido: ${op.type}` };
        await q.run(
          `INSERT INTO operations (op_id, player_id, device_id, type, payload, status, result, client_ts, received_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [opId, playerId, deviceId, String(op.type).slice(0, 40), JSON.stringify(payload).slice(0, 4000),
            result.status, JSON.stringify(result), num(op.ts) ?? 0, now()],
        );
        return { opId, ...result };
      });
    } catch (e) {
      log(`erro ao aplicar ${opId}: ${e.message}`);
      return { opId, status: 'error', error: 'Falha temporária no servidor' };
    }
  }

  async function snapshot(playerId) {
    const p = await db.one('SELECT * FROM players WHERE id=$1', [playerId]);
    if (!p) return null;
    const caps = await db.query('SELECT * FROM captures WHERE player_id=$1 ORDER BY caught_at, id', [playerId]);
    const exps = await db.query('SELECT * FROM expeditions WHERE player_id=$1 ORDER BY started_at', [playerId]);
    const dist = await db.query(
      `SELECT d.* FROM expedition_distance d JOIN expeditions e ON e.id = d.expedition_id WHERE e.player_id=$1`, [playerId],
    );
    const friends = await db.query(
      `SELECT f.friend_id, f.created_at, p.display_name, p.avatar FROM friendships f
       JOIN players p ON p.id = f.friend_id WHERE f.player_id=$1 ORDER BY f.created_at`, [playerId],
    );
    const byExp = new Map();
    for (const d of dist) {
      if (!byExp.has(d.expedition_id)) byExp.set(d.expedition_id, {});
      byExp.get(d.expedition_id)[d.device_id] = d.meters;
    }
    return {
      player: {
        id: p.id, username: p.username, displayName: p.display_name, avatar: p.avatar,
        avatarTs: p.avatar_ts, look: p.look, lookTs: p.look_ts, friendCode: p.friend_code, createdAt: p.created_at,
      },
      captures: caps.map((c) => ({
        id: c.id, spawnId: c.spawn_id, speciesId: c.species_id, sizeCm: c.size_cm, kind: c.kind,
        brejoId: c.brejo_id, friendId: c.friend_id, expeditionId: c.expedition_id, caughtAt: c.caught_at,
        deviceId: c.device_id, favorite: !!c.favorite, favoriteTs: c.favorite_ts,
      })),
      expeditions: exps.map((e) => ({
        id: e.id, startedAt: e.started_at, endedAt: e.ended_at, status: e.status, updatedAt: e.updated_at,
        distance: byExp.get(e.id) || {},
      })),
      friends: friends.map((f) => ({ id: f.friend_id, displayName: f.display_name, avatar: f.avatar, since: f.created_at })),
    };
  }

  let rankCache = { at: 0, rows: [] };
  async function ranking() {
    if (now() - rankCache.at < 15000) return rankCache.rows;
    const players = await db.query('SELECT id, display_name, avatar FROM players');
    const caps = await db.query('SELECT id, player_id, species_id, caught_at FROM captures');
    const byPlayer = new Map(players.map((p) => [p.id, []]));
    for (const c of caps) byPlayer.get(c.player_id)?.push({ id: c.id, speciesId: c.species_id, caughtAt: c.caught_at });
    const rows = players.map((p) => {
      const b = xpBreakdown(byPlayer.get(p.id) || [], catalog);
      return {
        id: p.id, displayName: p.display_name, avatar: p.avatar, xp: b.total,
        level: levelFor(b.total).level, species: b.species.size, captures: (byPlayer.get(p.id) || []).length,
      };
    }).sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName));
    rankCache = { at: now(), rows };
    return rows;
  }

  return { applyOp, snapshot, ranking, handlers, stats };
}
