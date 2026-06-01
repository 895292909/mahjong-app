const { getDb } = require('./init');
const { decryptPhone, maskPhone } = require('../utils/crypto');

// ===== 麻将馆 =====
function getAllHalls() {
  return getDb().prepare(`
    SELECT h.*,
      (SELECT COUNT(*) FROM tables t WHERE t.hall_id = h.id AND t.status = 'waiting') AS available_tables
    FROM mahjong_halls h
    WHERE h.status = 'open'
    ORDER BY h.id
  `).all();
}

function getHallById(id) {
  return getDb().prepare('SELECT * FROM mahjong_halls WHERE id = ?').get(id);
}

function getHallByName(name) {
  return getDb().prepare('SELECT * FROM mahjong_halls WHERE name = ?').get(name);
}

function createHall({ name, address, phone, openTime, closeTime }) {
  const info = getDb().prepare(
    'INSERT INTO mahjong_halls (name, address, phone, open_time, close_time) VALUES (?, ?, ?, ?, ?)'
  ).run(name, address || null, phone || null, openTime || null, closeTime || null);
  return getHallById(info.lastInsertRowid);
}

function getHallWithTables(id) {
  const hall = getHallById(id);
  if (!hall) return null;
  hall.tables = getTablesByHall(id);
  return hall;
}

// ===== 玩家 =====
function createPlayer({ nickname, phone, wechatId, privacySetting }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT INTO players (nickname, phone, wechat_id, privacy_setting) VALUES (?, ?, ?, ?)'
  ).run(nickname, phone || null, wechatId || null, privacySetting || 'game_only');
  return getPlayerById(info.lastInsertRowid);
}

function getPlayerByOpenid(openid) {
  return getDb().prepare('SELECT * FROM players WHERE openid = ?').get(openid);
}

function createPlayerWithWechat({ openid, nickname, avatarUrl }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT INTO players (openid, nickname, avatar_url, privacy_setting) VALUES (?, ?, ?, ?)'
  ).run(openid, nickname, avatarUrl || null, 'game_only');
  return getPlayerById(info.lastInsertRowid);
}

function updatePlayerWechatAvatar(id, { openid, nickname, avatarUrl }) {
  const sets = [];
  const params = [];
  if (openid !== undefined) { sets.push('openid = ?'); params.push(openid); }
  if (nickname !== undefined) { sets.push('nickname = ?'); params.push(nickname); }
  if (avatarUrl !== undefined) { sets.push('avatar_url = ?'); params.push(avatarUrl); }
  if (sets.length === 0) return;
  params.push(id);
  getDb().prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

function getAllPlayers() {
  return getDb().prepare('SELECT id, nickname, privacy_setting, status, created_at FROM players ORDER BY id').all();
}

function getPlayerById(id) {
  return getDb().prepare('SELECT * FROM players WHERE id = ?').get(id);
}

function updatePlayerStatus(id, status, socketId) {
  getDb().prepare(
    'UPDATE players SET status = ?, socket_id = ? WHERE id = ?'
  ).run(status, socketId || null, id);
}

function updatePlayerContact(id, { phone, wechatId, privacySetting }) {
  const sets = [];
  const params = [];
  if (phone !== undefined) { sets.push('phone = ?'); params.push(phone); }
  if (wechatId !== undefined) { sets.push('wechat_id = ?'); params.push(wechatId); }
  if (privacySetting !== undefined) { sets.push('privacy_setting = ?'); params.push(privacySetting); }
  if (sets.length === 0) return;
  params.push(id);
  getDb().prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ===== 牌桌 =====
function getTablesByHall(hallId) {
  const tables = getDb().prepare(`
    SELECT t.*
    FROM tables t
    WHERE t.hall_id = ?
    ORDER BY t.id
  `).all(hallId);

  for (const table of tables) {
    table.players = getTablePlayers(table.id);
    if (table.owner_id) {
      const owner = getDb().prepare('SELECT nickname FROM players WHERE id = ?').get(table.owner_id);
      table.ownerNickname = owner ? owner.nickname : null;
    } else {
      table.ownerNickname = null;
    }
  }
  return tables;
}

function countTablesByHall(hallId) {
  return getDb().prepare('SELECT COUNT(*) AS cnt FROM tables WHERE hall_id = ?').get(hallId).cnt;
}

function addTable(hallId) {
  const count = countTablesByHall(hallId);
  const tableNumber = count + 1;
  getDb().prepare(
    'INSERT INTO tables (hall_id, table_number, status, current_players) VALUES (?, ?, ?, ?)'
  ).run(hallId, `${tableNumber}号桌`, 'waiting', 0);
  return countTablesByHall(hallId);
}

function removeTable(hallId) {
  // Find and delete the highest-numbered table that has no players
  const table = getDb().prepare(`
    SELECT id FROM tables WHERE hall_id = ? AND current_players = 0
    ORDER BY id DESC LIMIT 1
  `).get(hallId);
  if (!table) throw new Error('没有可删除的空桌（有人的牌桌不能删除）');
  getDb().prepare('DELETE FROM tables WHERE id = ?').run(table.id);
  return countTablesByHall(hallId);
}

function getTableById(id) {
  const table = getDb().prepare('SELECT * FROM tables WHERE id = ?').get(id);
  if (table) {
    table.players = getTablePlayers(table.id);
    if (table.owner_id) {
      const owner = getDb().prepare('SELECT nickname FROM players WHERE id = ?').get(table.owner_id);
      table.ownerNickname = owner ? owner.nickname : null;
    } else {
      table.ownerNickname = null;
    }
  }
  return table;
}

function getTablePlayers(tableId) {
  return getDb().prepare(`
    SELECT p.id, p.nickname, p.privacy_setting, tp.seat_number, tp.is_owner, tp.joined_at
    FROM table_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.table_id = ?
    ORDER BY tp.seat_number
  `).all(tableId);
}

function updateTableSettings(id, { baseScore, startTime }) {
  const updates = [];
  const params = [];
  if (baseScore !== undefined) { updates.push('base_score = ?'); params.push(baseScore); }
  if (startTime !== undefined) { updates.push('start_time = ?'); params.push(startTime); }
  if (updates.length === 0) return getTableById(id);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  getDb().prepare(`UPDATE tables SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getTableById(id);
}

function updateTableStatus(id, status) {
  getDb().prepare("UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
}

function getAvailableSeat(tableId) {
  const occupied = getDb().prepare(
    'SELECT seat_number FROM table_players WHERE table_id = ? ORDER BY seat_number'
  ).all(tableId).map(r => r.seat_number);
  for (let seat = 1; seat <= 4; seat++) {
    if (!occupied.includes(seat)) return seat;
  }
  return null;
}

// ===== 加入/离开牌桌（事务） =====
function joinTable(tableId, playerId, preferredSeat) {
  const db = getDb();
  const join = db.transaction(() => {
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
    if (!table) throw new Error('牌桌不存在');
    if (table.current_players >= table.max_players) throw new Error('该桌已满员');

    const existing = db.prepare(
      'SELECT id FROM table_players WHERE player_id = ?'
    ).get(playerId);
    if (existing) throw new Error('你已在牌桌中，请先离座');

    let seat = preferredSeat;
    if (seat) {
      const taken = db.prepare(
        'SELECT id FROM table_players WHERE table_id = ? AND seat_number = ?'
      ).get(tableId, seat);
      if (taken) throw new Error(`座位 ${seat} 已被占用`);
    } else {
      seat = getAvailableSeat(tableId);
      if (!seat) throw new Error('没有可用座位');
    }

    const isFirst = table.current_players === 0;

    db.prepare(
      'INSERT INTO table_players (table_id, player_id, seat_number, is_owner) VALUES (?, ?, ?, ?)'
    ).run(tableId, playerId, seat, isFirst ? 1 : 0);

    const newCount = table.current_players + 1;
    const newStatus = newCount >= table.max_players ? 'playing' : 'waiting';

    db.prepare(
      'UPDATE tables SET current_players = ?, status = ?, owner_id = COALESCE(owner_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(newCount, newStatus, isFirst ? playerId : null, tableId);

    db.prepare(
      'UPDATE players SET current_table_id = ?, status = ? WHERE id = ?'
    ).run(tableId, 'playing', playerId);
  });

  join();
  return getTableById(tableId);
}

function leaveTable(tableId, playerId) {
  const db = getDb();
  const leave = db.transaction(() => {
    const player = db.prepare(
      'SELECT * FROM table_players WHERE table_id = ? AND player_id = ?'
    ).get(tableId, playerId);
    if (!player) throw new Error('你未在该牌桌中');

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);

    db.prepare(
      'DELETE FROM table_players WHERE table_id = ? AND player_id = ?'
    ).run(tableId, playerId);

    const newCount = table.current_players - 1;

    if (newCount === 0) {
      db.prepare(
        "UPDATE tables SET current_players = 0, status = 'waiting', owner_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(tableId);
    } else {
      let newStatus = table.status;
      if (table.status === 'playing' && newCount < table.max_players) {
        const counts = db.prepare(
          "SELECT COUNT(*) AS cnt FROM table_players WHERE table_id = ?"
        ).get(tableId);
        newStatus = counts.cnt >= table.max_players ? 'playing' : 'waiting';
      }

      db.prepare(
        'UPDATE tables SET current_players = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(newCount, newStatus, tableId);

      // Transfer ownership if leaving player was owner
      if (player.is_owner) {
        const nextOwner = db.prepare(
          'SELECT player_id FROM table_players WHERE table_id = ? ORDER BY joined_at LIMIT 1'
        ).get(tableId);
        if (nextOwner) {
          db.prepare(
            'UPDATE table_players SET is_owner = 0 WHERE table_id = ? AND player_id = ?'
          ).run(tableId, playerId);
          db.prepare(
            'UPDATE table_players SET is_owner = 1 WHERE table_id = ? AND player_id = ?'
          ).run(tableId, nextOwner.player_id);
          db.prepare(
            'UPDATE tables SET owner_id = ? WHERE id = ?'
          ).run(nextOwner.player_id, tableId);
        }
      }
    }

    db.prepare(
      "UPDATE players SET current_table_id = NULL, status = 'offline' WHERE id = ?"
    ).run(playerId);
  });

  leave();
  return getTableById(tableId);
}

// ===== 老板 =====
function getOwnerByHallId(hallId) {
  return getDb().prepare(
    'SELECT * FROM hall_owners WHERE hall_id = ? AND is_active = 1'
  ).get(hallId);
}

function checkOwnerExists(hallId) {
  const row = getDb().prepare(
    'SELECT COUNT(*) AS cnt FROM hall_owners WHERE hall_id = ? AND is_active = 1'
  ).get(hallId);
  return row.cnt > 0;
}

function createOwner({ hallId, name, phone, wechatId, passwordHash }) {
  const info = getDb().prepare(
    'INSERT INTO hall_owners (hall_id, name, phone, wechat_id, password_hash) VALUES (?, ?, ?, ?, ?)'
  ).run(hallId, name, phone || '', wechatId || null, passwordHash);
  return getOwnerByHallId(hallId);
}

function verifyOwner(hallId, password) {
  const { verifyPassword } = require('../utils/crypto');
  const owner = getOwnerByHallId(hallId);
  if (!owner) return null;
  if (!verifyPassword(password, owner.password_hash)) return null;
  return owner;
}

function getOwnerHalls(ownerId) {
  return getDb().prepare(`
    SELECT h.* FROM mahjong_halls h
    JOIN hall_owners o ON o.hall_id = h.id
    WHERE o.id = ? AND o.is_active = 1
  `).all(ownerId);
}

function getTableContacts(tableId, hallId) {
  const db = getDb();
  const table = db.prepare('SELECT * FROM tables WHERE id = ? AND hall_id = ?').get(tableId, hallId);
  if (!table) throw new Error('牌桌不存在');
  if (table.status !== 'playing') throw new Error('牌桌未成局，无法查看联系方式');

  const players = db.prepare(`
    SELECT p.id, p.nickname, p.phone, p.wechat_id, p.privacy_setting, tp.seat_number, tp.is_owner
    FROM table_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.table_id = ?
    ORDER BY tp.seat_number
  `).all(tableId);

  const owner = db.prepare('SELECT nickname FROM players WHERE id = ?').get(table.owner_id);

  return {
    tableId: table.id,
    tableNumber: table.table_number,
    status: table.status,
    ownerNickname: owner ? owner.nickname : null,
    players: players.map(p => {
      const contact = {
        id: p.id,
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
        privacySetting: p.privacy_setting,
      };

      if (p.privacy_setting === 'always') {
        try { contact.phone = decryptPhone(p.phone); } catch { contact.phone = null; }
        contact.phoneEncrypted = p.phone;
        contact.wechatId = p.wechat_id;
        contact.canViewFullPhone = true;
      } else if (p.privacy_setting === 'game_only') {
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

function logContactView({ ownerId, playerId, tableId, viewType }) {
  getDb().prepare(
    'INSERT INTO contact_view_logs (table_id, owner_id, player_id, view_type) VALUES (?, ?, ?, ?)'
  ).run(tableId, ownerId, playerId, viewType);
}

// ===== 统计 =====
function getHallStats(hallId) {
  return getDb().prepare(`
    SELECT
      (SELECT COUNT(*) FROM tables WHERE hall_id = ?) AS total_tables,
      (SELECT COUNT(*) FROM tables WHERE hall_id = ? AND status = 'waiting') AS waiting_tables,
      (SELECT COUNT(*) FROM tables WHERE hall_id = ? AND status = 'playing') AS playing_tables,
      (SELECT COUNT(*) FROM tables WHERE hall_id = ? AND status = 'finished') AS finished_tables
  `).get(hallId, hallId, hallId, hallId);
}

// ===== Socket 辅助 =====
function getOnlineCountByHall(hallId) {
  return getDb().prepare(`
    SELECT COUNT(*) AS cnt FROM players p
    WHERE p.status IN ('online','playing')
    AND p.current_table_id IN (SELECT id FROM tables WHERE hall_id = ?)
  `).get(hallId).cnt;
}

function getHallIdByTableId(tableId) {
  const row = getDb().prepare('SELECT hall_id FROM tables WHERE id = ?').get(tableId);
  return row ? row.hall_id : null;
}

module.exports = {
  getAllHalls, getHallById, getHallByName, createHall, getHallWithTables,
  createPlayer, getPlayerById, getPlayerByOpenid, createPlayerWithWechat, updatePlayerWechatAvatar, getAllPlayers, updatePlayerStatus, updatePlayerContact,
  getTablesByHall, getTableById, getTablePlayers,
  updateTableSettings, updateTableStatus, getAvailableSeat,
  joinTable, leaveTable,
  getOwnerByHallId, checkOwnerExists, createOwner, verifyOwner, getOwnerHalls, getTableContacts, logContactView,
  getHallStats,
  getOnlineCountByHall, getHallIdByTableId,
  countTablesByHall, addTable, removeTable,
};
