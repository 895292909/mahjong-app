const express = require('express');
const router = express.Router();
const dao = require('../database/dao');
const { ok, fail } = require('../middleware/auth');

// GET /api/halls - 获取所有麻将馆列表（含空桌数统计）
router.get('/', (req, res) => {
  try {
    const halls = dao.getAllHalls();
    const data = halls.map(h => ({
      id: h.id,
      name: h.name,
      address: h.address,
      phone: h.phone,
      openTime: h.open_time,
      closeTime: h.close_time,
      totalTables: dao.getHallStats(h.id).total_tables,
      emptyTables: h.available_tables,
    }));
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// GET /api/halls/:id - 获取单个麻将馆详情+所有牌桌状态
router.get('/:id', (req, res) => {
  try {
    const hall = dao.getHallById(req.params.id);
    if (!hall) return fail(res, '麻将馆不存在', 404);
    const stats = dao.getHallStats(hall.id);
    const tables = dao.getTablesByHall(hall.id);
    const tableData = tables.map(t => ({
      id: t.id,
      tableNumber: t.table_number,
      status: t.status,
      currentPlayers: t.current_players,
      maxPlayers: t.max_players,
      baseScore: t.base_score,
      ownerNickname: t.ownerNickname,
      players: (t.players || []).map(p => ({
        nickname: p.nickname,
        seatNumber: p.seat_number,
        isOwner: !!p.is_owner,
      })),
    }));
    const data = {
      id: hall.id,
      name: hall.name,
      address: hall.address,
      phone: hall.phone,
      openTime: hall.open_time,
      closeTime: hall.close_time,
      totalTables: stats.total_tables,
      emptyTables: stats.waiting_tables,
      tables: tableData,
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
