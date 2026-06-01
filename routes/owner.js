const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const dao = require('../database/dao');
const { hashPassword, verifyPassword, signToken } = require('../utils/crypto');
const { ok, fail, ownerAuth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { hallId, password } = req.body;
    if (!hallId || !password) return fail(res, 'hallId和密码必填');

    const owner = await dao.getOwnerByHallId(hallId);
    if (!owner || !verifyPassword(password, owner.password_hash)) {
      return fail(res, '麻将馆ID或密码错误', 401);
    }

    const token = signToken({ id: owner.id, hallId: owner.hall_id, name: owner.name });
    ok(res, { token, name: owner.name });
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, nickname, phone, wechatId, password, address, openTime, closeTime } = req.body;
    if (!name || !password) return fail(res, '麻将馆名称和密码必填');

    let hall = await dao.getHallByName(name);
    let isNewHall = false;

    if (hall) {
      if (await dao.checkOwnerExists(hall.id)) {
        return fail(res, `"${name}"已有老板入驻，如要加入该馆请联系管理员，或修改名称添加地点区分`);
      }
    } else {
      hall = await dao.createHall({ name, address, openTime, closeTime });
      isNewHall = true;

      const db = getDb();
      for (let i = 1; i <= 6; i++) {
        await db.query(
          'INSERT INTO tables (hall_id, table_number, status, current_players) VALUES ($1, $2, $3, $4)',
          [hall.id, `${i}号桌`, 'waiting', 0]
        );
      }
    }

    const ownerDisplayName = nickname || name;
    const passwordHash = hashPassword(password);
    const owner = await dao.createOwner({ hallId: hall.id, name: ownerDisplayName, phone, wechatId, passwordHash });
    const token = signToken({ id: owner.id, hallId: owner.hall_id, name: owner.name });
    ok(res, { token, name: owner.name, hallId: hall.id, isNewHall }, 201);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/stats/:hallId', ownerAuth, async (req, res) => {
  try {
    if (req.owner.hallId !== parseInt(req.params.hallId)) {
      return fail(res, '无权访问', 403);
    }
    const stats = await dao.getHallStats(req.params.hallId);
    ok(res, stats);
  } catch (e) {
    fail(res, e.message);
  }
});

router.use('/halls/:ownerId', ownerAuth);
router.use('/table/:tableId/contacts', ownerAuth);
router.use('/contact-log', ownerAuth);

router.post('/halls/:hallId/tables', ownerAuth, async (req, res) => {
  try {
    if (req.owner.hallId !== parseInt(req.params.hallId)) {
      return fail(res, '无权操作', 403);
    }
    const { action } = req.body;
    if (action === 'add') {
      const total = await dao.addTable(req.params.hallId);
      ok(res, { totalTables: total, action: 'add' });
    } else if (action === 'remove') {
      const total = await dao.removeTable(req.params.hallId);
      ok(res, { totalTables: total, action: 'remove' });
    } else {
      fail(res, 'action 必须是 add 或 remove');
    }
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/halls/:ownerId', async (req, res) => {
  try {
    if (req.owner.id !== parseInt(req.params.ownerId)) {
      return fail(res, '无权访问', 403);
    }
    const halls = await dao.getOwnerHalls(req.owner.id);
    const data = halls.map(h => ({
      id: h.id,
      name: h.name,
      address: h.address,
      phone: h.phone,
      status: h.status,
    }));
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

router.get('/table/:tableId/contacts', async (req, res) => {
  try {
    const hallId = req.owner.hallId;
    const result = await dao.getTableContacts(req.params.tableId, hallId);

    for (const p of result.players) {
      await dao.logContactView({
        ownerId: req.owner.id,
        playerId: p.id || 0,
        tableId: parseInt(req.params.tableId),
        viewType: 'phone',
      });
    }

    ok(res, result);
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/contact-log', async (req, res) => {
  try {
    const { playerId, tableId, viewType } = req.body;
    if (!playerId || !tableId) return fail(res, 'playerId和tableId必填');
    if (!['phone', 'wechat'].includes(viewType)) return fail(res, 'viewType 必须是 phone 或 wechat');

    await dao.logContactView({
      ownerId: req.owner.id,
      playerId,
      tableId,
      viewType,
    });
    ok(res, { logged: true });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
