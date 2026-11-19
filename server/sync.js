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
  distanceM, CAPTURE_RANGE_M, xpBreakdown, levelFor, validLook, findBrejo, visibleInMode,
  jobById, jobPay, JOB_RANGE_M, DELIVERY_RANGE_M, carById, balanceOf, frogPrice, BALANCO,
} from '../client/js/shared/game.js';

const GPS_TOLERANCE_M = 45;
const MAX_FUTURE_MS = 5 * 60 * 1000;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = 80) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

export function makeSync({ db, catalog, now = () => Date.now(), log = () => {} }) {
  const speciesIds = new Set(catalog.species.map((s) => s.id));
  const stats = { duplicates: 0 };

  const modeOf = (p) => (p.mode === 'controle' ? 'controle' : 'gps');

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
        b = findBrejo(parsed.brejoId, manual, playerId);   // as lagoinhas de cada jogador são só dele
      }
      if (!b) return { error: 'Brejo não existe' };
      const spawn = spawnsFor(b, parsed.win, catalog, playerId)[parsed.index];
      if (!spawn) return { error: 'Perereca não existe neste brejo' };
      if (!visibleInMode(spawn, modeOf(p))) return { error: 'Essa perereca só aparece no modo GPS' };
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
        expedition_id, caught_at, device_id, received_at, favorite, favorite_ts, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [p.captureId, playerId, p.spawnId, v.spawn.speciesId, v.spawn.sizeCm, v.spawn.kind, v.brejoId,
        v.friendId, str(p.expeditionId, 64), p.caughtAt, deviceId, now(), fav.favorite, fav.ts,
        v.spawn.kind === 'gift' ? 'presente' : modeOf(p)],
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

    // Trabalho feito: o servidor recalcula o NPC a partir do id (jogador + janela + ponto da grade),
    // confere horário e lugar, e paga. O mesmo trabalho nunca paga duas vezes.
    async 'job.done'(q, playerId, deviceId, p) {
      const doneAt = num(p.doneAt);
      if (!str(p.doneId, 64) || !str(p.jobId, 80) || doneAt === null) return { status: 'rejected', error: 'Trabalho malformado' };
      const job = jobById(p.jobId, playerId);
      if (!job) return { status: 'rejected', error: 'Esse trabalho não existe' };
      if (doneAt > now() + MAX_FUTURE_MS) return { status: 'rejected', error: 'Trabalho com horário no futuro' };
      const limit = windowEnd(job.win) + GRACE_MS + (job.type === 'entrega' ? BALANCO.entregaMin * 60000 : 0);
      if (doneAt < windowStart(job.win) || doneAt > limit) return { status: 'rejected', error: 'O NPC já tinha ido embora nesse horário' };
      if (num(p.lat) === null || num(p.lng) === null) return { status: 'rejected', error: 'Posição ausente' };
      const at = { lat: p.lat, lng: p.lng };
      const target = job.type === 'entrega' ? job.dest : job;
      const range = (job.type === 'entrega' ? DELIVERY_RANGE_M : JOB_RANGE_M) + GPS_TOLERANCE_M;
      const d = distanceM(at, target);
      if (d > range) return { status: 'rejected', error: `Longe demais do ${job.type === 'entrega' ? 'ponto de entrega' : 'NPC'} (${Math.round(d)} m)` };
      const mode = p.mode === 'controle' ? 'controle' : 'gps';
      const existing = await q.one('SELECT * FROM jobs WHERE player_id=$1 AND job_id=$2', [playerId, p.jobId]);
      if (existing) {
        return { status: 'conflict', conflict: { kept: { id: existing.id, deviceId: existing.device_id, doneAt: Number(existing.done_at) }, policy: 'o mesmo trabalho só paga uma vez' } };
      }
      const pay = jobPay(job.type, mode);
      await q.run(
        `INSERT INTO jobs (id, player_id, job_id, type, pay, mode, done_at, device_id, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.doneId, playerId, p.jobId, job.type, pay, mode, doneAt, deviceId, now()],
      );
      return { status: 'applied', pay };
    },

    // Compra na loja. Regra de conflito do dinheiro: a compra só vale se, quando chegar ao servidor,
    // o saldo cobrir o preço. Dois celulares gastando o mesmo dinheiro offline: a primeira compra que
    // chega é aplicada e a outra é recusada (o dinheiro não sai). Item repetido não é cobrado de novo.
    async 'shop.buy'(q, playerId, deviceId, p) {
      const car = carById(p.item);
      const at = num(p.boughtAt);
      if (!str(p.buyId, 64) || !car || at === null) return { status: 'rejected', error: 'Compra malformada' };
      const owned = await q.one('SELECT * FROM purchases WHERE player_id=$1 AND item=$2', [playerId, car.id]);
      if (owned) return { status: 'conflict', conflict: { kept: { id: owned.id, deviceId: owned.device_id }, policy: 'item já comprado em outro aparelho: não foi cobrado de novo' } };
      const jobs = await q.query('SELECT pay FROM jobs WHERE player_id=$1', [playerId]);
      const buys = await q.query('SELECT price FROM purchases WHERE player_id=$1', [playerId]);
      const sold = await q.query('SELECT price FROM sales WHERE player_id=$1', [playerId]);
      const balance = balanceOf(jobs, buys, sold);
      if (balance < car.price) return { status: 'rejected', error: `Saldo insuficiente no servidor (B$ ${balance} de B$ ${car.price})` };
      await q.run(
        'INSERT INTO purchases (id, player_id, item, price, bought_at, device_id, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [p.buyId, playerId, car.id, car.price, at, deviceId, now()],
      );
      return { status: 'applied' };
    },

    // Venda de perereca do Meu Brejo. A mesma perereca só é vendida uma vez (vender nos dois
    // celulares paga uma vez só). Se a captura não existe no servidor (por exemplo, perdeu o
    // conflito "primeira captura vence"), a venda é recusada e não entra dinheiro. Favorita não vende.
    // O preço é calculado aqui (raridade + tamanho), não o que o celular mandou.
    async 'frog.sell'(q, playerId, deviceId, p) {
      const at = num(p.soldAt);
      if (!str(p.sellId, 64) || !str(p.captureId, 64) || at === null) return { status: 'rejected', error: 'Venda malformada' };
      const cap = await q.one('SELECT * FROM captures WHERE id=$1 AND player_id=$2', [p.captureId, playerId]);
      if (!cap) return { status: 'rejected', error: 'Essa perereca não está no seu brejo no servidor' };
      const sold = await q.one('SELECT * FROM sales WHERE player_id=$1 AND capture_id=$2', [playerId, p.captureId]);
      if (sold) return { status: 'conflict', conflict: { kept: { id: sold.id, deviceId: sold.device_id }, policy: 'a mesma perereca só é vendida uma vez: não pagou de novo' } };
      if (cap.favorite) return { status: 'rejected', error: 'Perereca favorita não pode ser vendida' };
      const price = frogPrice(catalog, cap.species_id, cap.size_cm);
      await q.run(
        'INSERT INTO sales (id, player_id, capture_id, species_id, price, sold_at, device_id, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [p.sellId, playerId, p.captureId, cap.species_id, price, at, deviceId, now()],
      );
      return { status: 'applied', price };
    },

    // Carro em uso: última escrita vence (como o visual). Só vale carro que o jogador tem.
    async 'vehicle.select'(q, playerId, deviceId, p) {
      const ts = num(p.ts);
      const v = p.vehicle == null ? null : String(p.vehicle);
      if (ts === null || (v !== null && !carById(v))) return { status: 'rejected', error: 'Carro inválido' };
      if (v && !(await q.one('SELECT id FROM purchases WHERE player_id=$1 AND item=$2', [playerId, v]))) {
        return { status: 'rejected', error: 'Você ainda não tem esse carro' };
      }
      await q.run('UPDATE players SET vehicle=$1, vehicle_ts=$2 WHERE id=$3 AND vehicle_ts < $2', [v, ts, playerId]);
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
    const jobs = await db.query('SELECT * FROM jobs WHERE player_id=$1 ORDER BY done_at, id', [playerId]);
    const buys = await db.query('SELECT * FROM purchases WHERE player_id=$1 ORDER BY bought_at, id', [playerId]);
    const sales = await db.query('SELECT * FROM sales WHERE player_id=$1 ORDER BY sold_at, id', [playerId]);
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
        vehicle: p.vehicle || null, vehicleTs: Number(p.vehicle_ts) || 0,
      },
      jobs: jobs.map((j) => ({ id: j.id, jobId: j.job_id, type: j.type, pay: j.pay, mode: j.mode, doneAt: Number(j.done_at), deviceId: j.device_id })),
      purchases: buys.map((b) => ({ id: b.id, item: b.item, price: b.price, boughtAt: Number(b.bought_at), deviceId: b.device_id })),
      sales: sales.map((v) => ({ id: v.id, captureId: v.capture_id, speciesId: v.species_id, price: v.price, soldAt: Number(v.sold_at), deviceId: v.device_id })),
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
  // Rankings: mais XP, mais capturas e mais Brejais ganhos (trabalhos + vendas; comprar carro não
  // tira ninguém do lugar). A lista principal (rows) continua ordenada por XP.
  async function ranking() {
    if (now() - rankCache.at < 15000) return rankCache.rows;
    const players = await db.query('SELECT id, display_name, avatar, look FROM players');
    const caps = await db.query('SELECT id, player_id, species_id, caught_at FROM captures');
    const pays = await db.query('SELECT player_id, pay FROM jobs');
    const sold = await db.query('SELECT player_id, price FROM sales');
    const byPlayer = new Map(players.map((p) => [p.id, []]));
    for (const c of caps) byPlayer.get(c.player_id)?.push({ id: c.id, speciesId: c.species_id, caughtAt: c.caught_at });
    const gold = new Map();
    for (const j of pays) gold.set(j.player_id, (gold.get(j.player_id) || 0) + (Number(j.pay) || 0));
    for (const v of sold) gold.set(v.player_id, (gold.get(v.player_id) || 0) + (Number(v.price) || 0));
    const rows = players.map((p) => {
      const b = xpBreakdown(byPlayer.get(p.id) || [], catalog);
      return {
        id: p.id, displayName: p.display_name, avatar: p.avatar, look: p.look || null, xp: b.total,
        level: levelFor(b.total).level, species: b.species.size, captures: (byPlayer.get(p.id) || []).length,
        gold: gold.get(p.id) || 0,
      };
    }).sort((a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName));
    rankCache = { at: now(), rows };
    return rows;
  }

  // os três quadros, cada um com o top e a posição do jogador
  async function boards(playerId, size = 50) {
    const rows = await ranking();
    const by = (key) => {
      const sorted = [...rows].sort((a, b) => b[key] - a[key] || b.xp - a.xp || a.displayName.localeCompare(b.displayName));
      const idx = sorted.findIndex((r) => r.id === playerId);
      return { top: sorted.slice(0, size), me: idx >= 0 ? { rank: idx + 1, ...sorted[idx] } : null };
    };
    return { xp: by('xp'), captures: by('captures'), gold: by('gold') };
  }

  return { applyOp, snapshot, ranking, boards, handlers, stats };
}
