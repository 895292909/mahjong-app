const Database = require('better-sqlite3');
const { dbPath } = require('../config/database');
const { hashPassword, encryptPhone } = require('../utils/crypto');

let db;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

async function initDatabase() {
  const db = getDb();

  db.exec(`
    -- 表1：麻将馆
    CREATE TABLE IF NOT EXISTS mahjong_halls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      address VARCHAR(255),
      phone VARCHAR(20),
      open_time VARCHAR(20),
      close_time VARCHAR(20),
      status VARCHAR(20) DEFAULT 'open' CHECK(status IN ('open','closed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 表2：玩家
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid VARCHAR(100) UNIQUE,
      nickname VARCHAR(50) NOT NULL,
      phone VARCHAR(255),
      wechat_id VARCHAR(50),
      avatar_url VARCHAR(255),
      privacy_setting VARCHAR(20) DEFAULT 'game_only' CHECK(privacy_setting IN ('game_only','always','never')),
      current_table_id INTEGER,
      status VARCHAR(20) DEFAULT 'offline' CHECK(status IN ('online','offline','playing')),
      socket_id VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 表3：牌桌
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hall_id INTEGER NOT NULL REFERENCES mahjong_halls(id) ON DELETE CASCADE,
      table_number VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'waiting' CHECK(status IN ('waiting','playing','finished')),
      base_score INTEGER DEFAULT 1,
      start_time DATETIME,
      max_players INTEGER DEFAULT 4,
      current_players INTEGER DEFAULT 0,
      owner_id INTEGER REFERENCES players(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(hall_id, table_number)
    );

    -- 表4：牌桌-玩家关联
    CREATE TABLE IF NOT EXISTS table_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      seat_number INTEGER NOT NULL CHECK(seat_number BETWEEN 1 AND 4),
      is_owner BOOLEAN DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(table_id, player_id),
      UNIQUE(table_id, seat_number)
    );

    -- 表5：麻将馆老板
    CREATE TABLE IF NOT EXISTS hall_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hall_id INTEGER NOT NULL REFERENCES mahjong_halls(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      wechat_id VARCHAR(50),
      password_hash VARCHAR(255),
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 表6：联系方式查看审计日志
    CREATE TABLE IF NOT EXISTS contact_view_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES hall_owners(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      view_type VARCHAR(20) NOT NULL CHECK(view_type IN ('phone','wechat')),
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hallCount = db.prepare('SELECT COUNT(*) as cnt FROM mahjong_halls').get().cnt;
  if (hallCount > 0) {
    console.log('✓ 数据库已初始化，跳过种子数据');
    return db;
  }

  // ===== 种子数据 =====
  const insertHall = db.prepare(
    'INSERT INTO mahjong_halls (name, address, phone, open_time, close_time) VALUES (?, ?, ?, ?, ?)'
  );
  const halls = [
    ['聚友麻将馆', '北京市海淀区学院路100号', '010-62001111', '09:00', '02:00'],
    ['欢乐麻将馆', '北京市朝阳区幸福路88号', '010-65002222', '10:00', '03:00'],
    ['天天麻将馆', '北京市西城区平安大街50号', '010-63003333', '08:00', '23:00'],
  ];
  for (const h of halls) {
    insertHall.run(...h);
  }

  const insertTable = db.prepare(
    'INSERT INTO tables (hall_id, table_number, status, current_players) VALUES (?, ?, ?, ?)'
  );
  for (let hallId = 1; hallId <= 3; hallId++) {
    for (let i = 1; i <= 6; i++) {
      insertTable.run(hallId, `${i}号桌`, 'waiting', 0);
    }
  }

  const insertOwner = db.prepare(
    'INSERT INTO hall_owners (hall_id, name, phone, wechat_id, password_hash) VALUES (?, ?, ?, ?, ?)'
  );
  const owners = [
    [1, '张老板', '13800001001', 'zhang_owner', hashPassword('123456')],
    [2, '李老板', '13800001002', 'li_owner', hashPassword('123456')],
    [3, '王老板', '13800001003', 'wang_owner', hashPassword('123456')],
  ];
  for (const o of owners) {
    insertOwner.run(...o);
  }

  const insertPlayer = db.prepare(
    'INSERT INTO players (nickname, phone, wechat_id, privacy_setting) VALUES (?, ?, ?, ?)'
  );
  const demoPlayers = [
    ['麻将小白', encryptPhone('13900000001'), 'wx_xiaobai', 'game_only'],
    ['东城一霸', encryptPhone('13900000002'), 'wx_dongcheng', 'always'],
    ['雀神传说', encryptPhone('13900000003'), 'wx_queshen', 'game_only'],
    ['清风自来', encryptPhone('13900000004'), 'wx_qingfeng', 'never'],
    ['海底捞月', encryptPhone('13900000005'), 'wx_haidi', 'game_only'],
  ];
  for (const p of demoPlayers) {
    insertPlayer.run(...p);
  }

  console.log('✓ 种子数据已创建：3个麻将馆、18张牌桌、3个老板、5位玩家');
  return db;
}

module.exports = { initDatabase, getDb };
