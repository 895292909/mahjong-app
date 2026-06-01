const { getDb } = require('./init');
const { decryptPhone, maskPhone } = require('../utils/crypto');

// ===== 麻将馆 =====
async function getAllHalls() {
  const result = await getDb().query(`
    SELECT h.*,
      (SELECT COUNT(*)::int FROM tables t WHERE t.hall_id = h.id AND t.status = 'waiting') AS available_tables
    FROM mahjong_halls h
    WHERE h.status = 'open'
    ORDER BY h.id
  `);
  return result.rows;
}

async function getHallById(id) {
  const result = await getDb().query('SELECT * FROM mahjong_halls WHERE id = $1', [id]);
  return result.rows[0];
}

async function getHallByName(name) {
  const result = await getDb().query('SELECT * FROM mahjong_halls WHERE name = $1', [name]);
  return result.rows[0];
}

async function createHall({ name, address, phone, openTime, closeTime }) {
  const result = await getDb().query(
    'INSERT INTO mahjong_halls (name, address, phone, open_time, close_time) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name, address || null, phone || null, openTime || null, closeTime || null]
  );
  return getHallById(result.rows[0].id);
}

async function getHallWithTables(id) {
  const hall = await getHallById(id);
  if (!hall) return null;
  hall.tables = await getTablesByHall(id);
  return hall;
}

// ===== 玩家 =====
async function createPlayer({ nickname, phone, wechatId, privacySetting }) {
  const result = await getDb().query(
    'INSERT INTO players (nickname, phone, wechat_id, privacy_setting) VALUES ($1, $2, $3, $4) RETURNING id',
    [nickname, phone || null, wechatId || null, privacySetting || 'game_only']
  );
  return getPlayerById(result.rows[0].id);
}

async function getPlayerByOpenid(openid) {
  const result = await getDb().query('SELECT * FROM players WHERE openid = $1', [openid]);
  return result.rows[0];
}

async function createPlayerWithWechat({ openid, nickname, avatarUrl }) {
  const result = await getDb().query(
    'INSERT INTO players (openid, nickname, avatar_url, privacy_setting) VALUES ($1, $2, $3, $4) RETURNING id',
    [openid, nickname, avatarUrl || null, 'game_only']
  );
  return getPlayerById(result.rows[0].id);
}

async function updatePlayerWechatAvatar(id, { openid, nickname, avatarUrl }) {
  const sets = [];
  const params = [];
  let idx = 1;
  if (openid !== undefined) { sets.push(`openid = $${idx++}`); params.push(openid); }
  if (nickname !== undefined) { sets.push(`nickname = $${idx++}`); params.push(nickname); }
  if (avatarUrl !== undefined) { sets.push(`avatar_url = $${idx++}`); params.push(avatarUrl); }
  if (sets.length === 0) return;
  params.push(id);
  await getDb().query(`UPDATE players SET ${sets.join(', ')} WHERE id = $${idx}`, params);
}

async function getAllPlayers() {
  const result = await getDb().query('SELECT id, nickname, privacy_setting, status, created_at FROM players ORDER BY id');
  return result.rows;
}

async function getPlayerById(id) {
  const result = await getDb().query('SELECT * FROM players WHERE id = $1', [id]);
  return result.rows[0];
}

async function updatePlayerStatus(id, status, socketId) {
  await getDb().query(
    'UPDATE players SET status = $1, socket_id = $2 WHERE id = $3',
    [status, socketId || null, id]
  );
}

async function updatePlayerContact(id, { phone, wechatId, privacySetting }) {
  const sets = [];
  const params = [];
  let idx = 1;
  if (phone !== undefined) { sets.push(`phone = $${idx++}`); params.push(phone); }
  if (wechatId !== undefined) { sets.push(`wechat_id = $${idx++}`); params.push(wechatId); }
  if (privacySetting !== undefined) { sets.push(`privacy_setting = $${idx++}`); params.push(privacySetting); }
  if (sets.length === 0) return;
  params.push(id);
  await getDb().query(`UPDATE players SET ${sets.join(', ')} WHERE id = $${idx}`, params);
}

async function updateNickname(id, nickname) {
  await getDb().query('UPDATE players SET nickname = $1 WHERE id = $2', [nickname, id]);
}

// ===== 牌桌 =====
async function getTablesByHall(hallId) {
  const result = await getDb().query('SELECT * FROM tables WHERE hall_id = $1 ORDER BY id', [hallId]);
  const tables = result.rows;
  for (const table of tables) {
    table.players = await getTablePlayers(table.id);
    if (table.owner_id) {
      const ownerResult = await getDb().query('SELECT nickname FROM players WHERE id = $1', [table.owner_id]);
      table.ownerNickname = ownerResult.rows[0] ? ownerResult.rows[0].nickname : null;
    } else {
      table.ownerNickname = null;
    }
  }
  return tables;
}

async function countTablesByHall(hallId) {
  const result = await getDb().query('SELECT COUNT(*)::int AS cnt FROM tables WHERE hall_id = $1', [hallId]);
  return result.rows[0].cnt;
}

async function addTable(hallId) {
  const count = await countTablesByHall(hallId);
  const tableNumber = count + 1;
  await getDb().query(
    'INSERT INTO tables (hall_id, table_number, status, current_players) VALUES ($1, $2, $3, $4)',
    [hallId, `${tableNumber}号桌`, 'waiting', 0]
  );
  return countTablesByHall(hallId);
}

async function removeTable(hallId) {
  const tableResult = await getDb().query(
    'SELECT id FROM tables WHERE hall_id = $1 AND current_players = 0 ORDER BY id DESC LIMIT 1',
    [hallId]
  );
  const table = tableResult.rows[0];
  if (!table) throw new Error('没有可删除的空桌（有人的牌桌不能删除）');
  await getDb().query('DELETE FROM tables WHERE id = $1', [table.id]);
  return countTablesByHall(hallId);
}

async function getTableById(id) {
  const result = await getDb().query('SELECT * FROM tables WHERE id = $1', [id]);
  const table = result.rows[0];
  if (table) {
    table.players = await getTablePlayers(table.id);
    if (table.owner_id) {
      const ownerResult = await getDb().query('SELECT nickname FROM players WHERE id = $1', [table.owner_id]);
      table.ownerNickname = ownerResult.rows[0] ? ownerResult.rows[0].nickname : null;
    } else {
      table.ownerNickname = null;
    }
  }
  return table;
}

async function getTablePlayers(tableId) {
  const result = await getDb().query(`
    SELECT p.id, p.nickname, p.privacy_setting, tp.seat_number, tp.is_owner, tp.joined_at
    FROM table_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.table_id = $1
    ORDER BY tp.seat_number
  `, [tableId]);
  return result.rows;
}

async function updateTableSettings(id, { baseScore, startTime }) {
  const sets = [];
  const params = [];
  let idx = 1;
  if (baseScore !== undefined) { sets.push(`base_score = $${idx++}`); params.push(baseScore); }
  if (startTime !== undefined) { sets.push(`start_time = $${idx++}`); params.push(startTime); }
  if (sets.length === 0) return getTableById(id);
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id);
  await getDb().query(`UPDATE tables SET ${sets.join(', ')} WHERE id = $${idx}`, params);
  return getTableById(id);
}

async function updateTableStatus(id, status) {
  await getDb().query(
    'UPDATE tables SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [status, id]
  );
}

async function getAvailableSeat(tableId) {
  const result = await getDb().query(
    'SELECT seat_number FROM table_players WHERE table_id = $1 ORDER BY seat_number',
    [tableId]
  );
  const occupied = result.rows.map(r => r.seat_number);
  for (let seat = 1; seat <= 4; seat++) {
    if (!occupied.includes(seat)) return seat;
  }
  return null;
}

// ===== 加入/离开牌桌（事务） =====
async function joinTable(tableId, playerId, preferredSeat) {
  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableRes = await client.query('SELECT * FROM tables WHERE id = $1', [tableId]);
    const table = tableRes.rows[0];
    if (!table) throw new Error('牌桌不存在');
    if (table.current_players >= table.max_players) throw new Error('该桌已满员');

    const existingRes = await client.query('SELECT id FROM table_players WHERE player_id = $1', [playerId]);
    if (existingRes.rows[0]) throw new Error('你已在牌桌中，请先离座');

    let seat = preferredSeat;
    if (seat) {
      const takenRes = await client.query(
        'SELECT id FROM table_players WHERE table_id = $1 AND seat_number = $2',
        [tableId, seat]
      );
      if (takenRes.rows[0]) throw new Error(`座位 ${seat} 已被占用`);
    } else {
      const occRes = await client.query(
        'SELECT seat_number FROM table_players WHERE table_id = $1 ORDER BY seat_number',
        [tableId]
      );
      const occupied = occRes.rows.map(r => r.seat_number);
      for (let s = 1; s <= 4; s++) {
        if (!occupied.includes(s)) { seat = s; break; }
      }
      if (!seat) throw new Error('没有可用座位');
    }

    const isFirst = table.current_players === 0;

    await client.query(
      'INSERT INTO table_players (table_id, player_id, seat_number, is_owner) VALUES ($1, $2, $3, $4)',
      [tableId, playerId, seat, isFirst ? true : false]
    );

    const newCount = table.current_players + 1;
    const newStatus = newCount >= table.max_players ? 'playing' : 'waiting';

    await client.query(
      'UPDATE tables SET current_players = $1, status = $2, owner_id = COALESCE(owner_id, $3), updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [newCount, newStatus, isFirst ? playerId : null, tableId]
    );

    await client.query(
      'UPDATE players SET current_table_id = $1, status = $2 WHERE id = $3',
      [tableId, 'playing', playerId]
    );

    await client.query('COMMIT');
    client.release();
  } catch (e) {
    await client.query('ROLLBACK');
    client.release();
    throw e;
  }
  return getTableById(tableId);
}

async function leaveTable(tableId, playerId) {
  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerRes = await client.query(
      'SELECT * FROM table_players WHERE table_id = $1 AND player_id = $2',
      [tableId, playerId]
    );
    const player = playerRes.rows[0];
    if (!player) throw new Error('你未在该牌桌中');

    const tableRes = await client.query('SELECT * FROM tables WHERE id = $1', [tableId]);
    const table = tableRes.rows[0];

    await client.query(
      'DELETE FROM table_players WHERE table_id = $1 AND player_id = $2',
      [tableId, playerId]
    );

    const newCount = table.current_players - 1;

    if (newCount === 0) {
      await client.query(
        "UPDATE tables SET current_players = 0, status = 'waiting', owner_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [tableId]
      );
    } else {
      let newStatus = table.status;
      if (table.status === 'playing' && newCount < table.max_players) {
        const countsRes = await client.query(
          'SELECT COUNT(*)::int AS cnt FROM table_players WHERE table_id = $1',
          [tableId]
        );
        newStatus = countsRes.rows[0].cnt >= table.max_players ? 'playing' : 'waiting';
      }

      await client.query(
        'UPDATE tables SET current_players = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [newCount, newStatus, tableId]
      );

      if (player.is_owner) {
        const nextOwnerRes = await client.query(
          'SELECT player_id FROM table_players WHERE table_id = $1 ORDER BY joined_at LIMIT 1',
          [tableId]
        );
        const nextOwner = nextOwnerRes.rows[0];
        if (nextOwner) {
          await client.query(
            'UPDATE table_players SET is_owner = FALSE WHERE table_id = $1 AND player_id = $2',
            [tableId, playerId]
          );
          await client.query(
            'UPDATE table_players SET is_owner = TRUE WHERE table_id = $1 AND player_id = $2',
            [tableId, nextOwner.player_id]
          );
          await client.query(
            'UPDATE tables SET owner_id = $1 WHERE id = $2',
            [nextOwner.player_id, tableId]
          );
        }
      }
    }

    await client.query(
      "UPDATE players SET current_table_id = NULL, status = 'offline' WHERE id = $1",
      [playerId]
    );

    await client.query('COMMIT');
    client.release();
  } catch (e) {
    await client.query('ROLLBACK');
    client.release();
    throw e;
  }
  return getTableById(tableId);
}

// ===== 老板 =====
async function getOwnerByHallId(hallId) {
  const result = await getDb().query(
    'SELECT * FROM hall_owners WHERE hall_id = $1 AND is_active = TRUE',
    [hallId]
  );
  return result.rows[0];
}

async function checkOwnerExists(hallId) {
  const result = await getDb().query(
    'SELECT COUNT(*)::int AS cnt FROM hall_owners WHERE hall_id = $1 AND is_active = TRUE',
    [hallId]
  );
  return result.rows[0].cnt > 0;
}

async function createOwner({ hallId, name, phone, wechatId, passwordHash }) {
  await getDb().query(
    'INSERT INTO hall_owners (hall_id, name, phone, wechat_id, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [hallId, name, phone || '', wechatId || null, passwordHash]
  );
  return getOwnerByHallId(hallId);
}

async function verifyOwner(hallId, password) {
  const { verifyPassword } = require('../utils/crypto');
  const owner = await getOwnerByHallId(hallId);
  if (!owner) return null;
  if (!verifyPassword(password, owner.password_hash)) return null;
  return owner;
}

async function getOwnerHalls(ownerId) {
  const result = await getDb().query(`
    SELECT h.* FROM mahjong_halls h
    JOIN hall_owners o ON o.hall_id = h.id
    WHERE o.id = $1 AND o.is_active = TRUE
  `, [ownerId]);
  return result.rows;
}

async function getTableContacts(tableId, hallId) {
  const db = getDb();
  const tableRes = await db.query('SELECT * FROM tables WHERE id = $1 AND hall_id = $2', [tableId, hallId]);
  const table = tableRes.rows[0];
  if (!table) throw new Error('牌桌不存在');
  if (table.status !== 'playing') throw new Error('牌桌未成局，无法查看联系方式');

  const playersRes = await db.query(`
    SELECT p.id, p.nickname, p.phone, p.wechat_id, p.privacy_setting, tp.seat_number, tp.is_owner
    FROM table_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.table_id = $1
    ORDER BY tp.seat_number
  `, [tableId]);

  const ownerRes = await db.query('SELECT nickname FROM players WHERE id = $1', [table.owner_id]);

  return {
    tableId: table.id,
    tableNumber: table.table_number,
    status: table.status,
    ownerNickname: ownerRes.rows[0] ? ownerRes.rows[0].nickname : null,
    players: playersRes.rows.map(p => {
      const contact = {
        id: p.id,
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
        privacySetting: p.privacy_setting,
      };

      if (p.privacy_setting === 'always' || p.privacy_setting === 'game_only') {
        try { contact.phone = decryptPhone(p.phone); } catch { contact.phone = null; }
        contact.phoneEncrypted = p.phone;
        contact.wechatId = p.wechat_id;
        contact.canViewFullPhone = true;
      } else {
        contact.phone = p.phone ? maskPhone('13800000000') : '';
        contact.phoneEncrypted = null;
        contact.wechatId = null;
        contact.canViewFullPhone = false;
      }
      return contact;
    }),
  };
}

async function logContactView({ ownerId, playerId, tableId, viewType }) {
  await getDb().query(
    'INSERT INTO contact_view_logs (table_id, owner_id, player_id, view_type) VALUES ($1, $2, $3, $4)',
    [tableId, ownerId, playerId, viewType]
  );
}

// ===== 统计 =====
async function getHallStats(hallId) {
  const result = await getDb().query(`
    SELECT
      (SELECT COUNT(*)::int FROM tables WHERE hall_id = $1) AS total_tables,
      (SELECT COUNT(*)::int FROM tables WHERE hall_id = $1 AND status = 'waiting') AS waiting_tables,
      (SELECT COUNT(*)::int FROM tables WHERE hall_id = $1 AND status = 'playing') AS playing_tables,
      (SELECT COUNT(*)::int FROM tables WHERE hall_id = $1 AND status = 'finished') AS finished_tables
  `, [hallId]);
  return result.rows[0];
}

// ===== Socket 辅助 =====
async function getOnlineCountByHall(hallId) {
  const result = await getDb().query(`
    SELECT COUNT(*)::int AS cnt FROM players p
    WHERE p.status IN ('online','playing')
    AND p.current_table_id IN (SELECT id FROM tables WHERE hall_id = $1)
  `, [hallId]);
  return result.rows[0].cnt;
}

async function getHallIdByTableId(tableId) {
  const result = await getDb().query('SELECT hall_id FROM tables WHERE id = $1', [tableId]);
  return result.rows[0] ? result.rows[0].hall_id : null;
}

// ===== 调试 =====
async function getDbDump() {
  const db = getDb();
  const tablesRes = await db.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const tables = tablesRes.rows;
  const result = {};
  for (const t of tables) {
    const name = t.name;
    const rowsRes = await db.query('SELECT * FROM "' + name + '"');
    result[name] = rowsRes.rows;
  }
  return result;
}

module.exports = {
  getAllHalls, getHallById, getHallByName, createHall, getHallWithTables,
  createPlayer, getPlayerById, getPlayerByOpenid, createPlayerWithWechat, updatePlayerWechatAvatar, getAllPlayers, updatePlayerStatus, updatePlayerContact, updateNickname,
  getTablesByHall, getTableById, getTablePlayers,
  updateTableSettings, updateTableStatus, getAvailableSeat,
  joinTable, leaveTable,
  getOwnerByHallId, checkOwnerExists, createOwner, verifyOwner, getOwnerHalls, getTableContacts, logContactView,
  getHallStats,
  getOnlineCountByHall, getHallIdByTableId,
  countTablesByHall, addTable, removeTable,
  getDbDump,
};
