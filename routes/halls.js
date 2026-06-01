const express = require('express');
const router = express.Router();
const dao = require('../database/dao');
const { ok, fail } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const halls = await dao.getAllHalls();
    const data = await Promise.all(halls.map(async h => ({
      id: h.id,
      name: h.name,
      address: h.address,
      phone: h.phone,
      openTime: h.open_time,
      closeTime: h.close_time,
      totalTables: (await dao.getHallStats(h.id)).total_tables,
      emptyTables: h.available_tables,
    })));
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const hall = await dao.getHallById(req.params.id);
    if (!hall) return fail(res, '麻将馆不存在', 404);
    const stats = await dao.getHallStats(hall.id);
    const tables = await dao.getTablesByHall(hall.id);
    const tableData = tables.map(t => ({
      id: t.id,
      tableNumber: t.table_number,
      status: t.status,
      currentPlayers: t.current_players,
      maxPlayers: t.max_players,
      baseScore: t.base_score,
      ownerNickname: t.ownerNickname,
      players: (t.players || []).map(p => ({
        id: p.id,
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
