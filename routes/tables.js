const express = require('express');
const router = express.Router();
const dao = require('../database/dao');
const { ok, fail } = require('../middleware/auth');

// GET /api/tables/hall/:hallId - 获取某麻将馆所有牌桌
router.get('/hall/:hallId', (req, res) => {
  try {
    const tables = dao.getTablesByHall(req.params.hallId);
    const data = tables.map(t => ({
      id: t.id,
      hallId: t.hall_id,
      tableNumber: t.table_number,
      status: t.status,
      baseScore: t.base_score,
      startTime: t.start_time,
      maxPlayers: t.max_players,
      currentPlayers: t.current_players,
      ownerId: t.owner_id,
      ownerNickname: t.ownerNickname,
      players: (t.players || []).map(p => ({
        id: p.id,
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
        joinedAt: p.joined_at,
      })),
    }));
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// GET /api/tables/:id - 获取牌桌详情
router.get('/:id', (req, res) => {
  try {
    const t = dao.getTableById(req.params.id);
    if (!t) return fail(res, '牌桌不存在', 404);
    const data = {
      id: t.id,
      hallId: t.hall_id,
      tableNumber: t.table_number,
      status: t.status,
      baseScore: t.base_score,
      startTime: t.start_time,
      maxPlayers: t.max_players,
      currentPlayers: t.current_players,
      ownerId: t.owner_id,
      ownerNickname: t.ownerNickname,
      players: (t.players || []).map(p => ({
        id: p.id,
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
        joinedAt: p.joined_at,
      })),
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// POST /api/tables/join - 加入牌桌
router.post('/join', (req, res) => {
  try {
    const { tableId, playerId, seatNumber } = req.body;
    if (!tableId || !playerId) return fail(res, 'tableId和playerId必填');
    const table = dao.joinTable(tableId, playerId, seatNumber || null);
    const data = {
      id: table.id,
      tableNumber: table.table_number,
      status: table.status,
      currentPlayers: table.current_players,
      maxPlayers: table.max_players,
      ownerNickname: table.ownerNickname,
      players: (table.players || []).map(p => ({
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
      })),
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// POST /api/tables/leave - 离开牌桌
router.post('/leave', (req, res) => {
  try {
    const { tableId, playerId } = req.body;
    if (!tableId || !playerId) return fail(res, 'tableId和playerId必填');
    const table = dao.leaveTable(tableId, playerId);
    const data = {
      id: table.id,
      tableNumber: table.table_number,
      status: table.status,
      currentPlayers: table.current_players,
      ownerNickname: table.ownerNickname,
      players: (table.players || []).map(p => ({
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
      })),
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// PUT /api/tables/:id/settings - 房主修改设置
router.put('/:id/settings', (req, res) => {
  try {
    const table = dao.getTableById(req.params.id);
    if (!table) return fail(res, '牌桌不存在', 404);

    const { playerId, baseScore, startTime } = req.body;
    if (playerId && table.owner_id !== playerId) {
      return fail(res, '只有房主才能修改设置');
    }

    const updated = dao.updateTableSettings(table.id, { baseScore, startTime });
    const data = {
      id: updated.id,
      tableNumber: updated.table_number,
      baseScore: updated.base_score,
      startTime: updated.start_time,
      ownerNickname: updated.ownerNickname,
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
