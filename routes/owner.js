const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const dao = require('../database/dao');
const { hashPassword, verifyPassword, signToken } = require('../utils/crypto');
const { ok, fail, ownerAuth } = require('../middleware/auth');

// POST /api/owner/login - 老板登录
router.post('/login', (req, res) => {
  try {
    const { hallId, password } = req.body;
    if (!hallId || !password) return fail(res, 'hallId和密码必填');

    const owner = dao.getOwnerByHallId(hallId);
    if (!owner || !verifyPassword(password, owner.password_hash)) {
      return fail(res, '麻将馆ID或密码错误', 401);
    }

    const token = signToken({ id: owner.id, hallId: owner.hall_id, name: owner.name });
    ok(res, { token, name: owner.name });
  } catch (e) {
    fail(res, e.message);
  }
});

// POST /api/owner/register - 老板入驻（输入麻将馆名称，不存在则自动创建）
router.post('/register', (req, res) => {
  try {
    const { name, nickname, phone, wechatId, password, address, openTime, closeTime } = req.body;
    if (!name || !password) return fail(res, '麻将馆名称和密码必填');

    // 按名称查找
    let hall = dao.getHallByName(name);
    let isNewHall = false;

    if (hall) {
      if (dao.checkOwnerExists(hall.id)) {
        return fail(res, `"${name}"已有老板入驻，如要加入该馆请联系管理员，或修改名称添加地点区分（如"${name}-分店"）`);
      }
    } else {
      hall = dao.createHall({ name, address, openTime, closeTime });
      isNewHall = true;

      for (let i = 1; i <= 6; i++) {
        getDb().prepare(
          'INSERT INTO tables (hall_id, table_number, status, current_players) VALUES (?, ?, ?, ?)'
        ).run(hall.id, `${i}号桌`, 'waiting', 0);
      }
    }

    const ownerDisplayName = nickname || name;
    const passwordHash = hashPassword(password);
    const owner = dao.createOwner({ hallId: hall.id, name: ownerDisplayName, phone, wechatId, passwordHash });
    const token = signToken({ id: owner.id, hallId: owner.hall_id, name: owner.name });
    ok(res, { token, name: owner.name, hallId: hall.id, isNewHall }, 201);
  } catch (e) {
    fail(res, e.message);
  }
});
router.get('/stats/:hallId', ownerAuth, (req, res) => {
  try {
    if (req.owner.hallId !== parseInt(req.params.hallId)) {
      return fail(res, '无权访问', 403);
    }
    const stats = dao.getHallStats(req.params.hallId);
    ok(res, stats);
  } catch (e) {
    fail(res, e.message);
  }
});

// 以下路由需要登录验证
router.use('/halls/:ownerId', ownerAuth);
router.use('/table/:tableId/contacts', ownerAuth);
router.use('/contact-log', ownerAuth);

// POST /api/owner/halls/:hallId/tables - 牌桌数量管理（增删）
router.post('/halls/:hallId/tables', ownerAuth, (req, res) => {
  try {
    if (req.owner.hallId !== parseInt(req.params.hallId)) {
      return fail(res, '无权操作', 403);
    }
    const { action } = req.body;
    if (action === 'add') {
      const total = dao.addTable(req.params.hallId);
      ok(res, { totalTables: total, action: 'add' });
    } else if (action === 'remove') {
      const total = dao.removeTable(req.params.hallId);
      ok(res, { totalTables: total, action: 'remove' });
    } else {
      fail(res, 'action 必须是 add 或 remove');
    }
  } catch (e) {
    fail(res, e.message);
  }
});

// GET /api/owner/halls/:ownerId - 获取老板管理的麻将馆
router.get('/halls/:ownerId', (req, res) => {
  try {
    if (req.owner.id !== parseInt(req.params.ownerId)) {
      return fail(res, '无权访问', 403);
    }
    const halls = dao.getOwnerHalls(req.owner.id);
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

// GET /api/owner/table/:tableId/contacts - 获取成局牌桌玩家联系方式
router.get('/table/:tableId/contacts', (req, res) => {
  try {
    const hallId = req.owner.hallId;
    const result = dao.getTableContacts(req.params.tableId, hallId);

    // 记录查看日志
    for (const p of result.players) {
      dao.logContactView({
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

// POST /api/owner/contact-log - 记录查看联系方式
router.post('/contact-log', (req, res) => {
  try {
    const { playerId, tableId, viewType } = req.body;
    if (!playerId || !tableId) return fail(res, 'playerId和tableId必填');
    if (!['phone', 'wechat'].includes(viewType)) return fail(res, 'viewType 必须是 phone 或 wechat');

    dao.logContactView({
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
