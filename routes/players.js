const express = require('express');
const router = express.Router();
const dao = require('../database/dao');
const { encryptPhone, decryptPhone } = require('../utils/crypto');
const { ok, fail } = require('../middleware/auth');

// GET /api/players - 获取所有玩家列表
router.get('/', (req, res) => {
  try {
    const players = dao.getAllPlayers();
    const data = players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      privacySetting: p.privacy_setting,
      status: p.status,
    }));
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// POST /api/players - 创建/注册玩家
router.post('/', (req, res) => {
  try {
    const { nickname, phone, wechatId, privacySetting } = req.body;
    if (!nickname) return fail(res, '昵称必填');
    if (!privacySetting || !['game_only', 'always', 'never'].includes(privacySetting)) {
      return fail(res, 'privacySetting 必须是 game_only / always / never');
    }
    const encryptedPhone = phone ? encryptPhone(phone) : null;
    const player = dao.createPlayer({ nickname, phone: encryptedPhone, wechatId, privacySetting });
    const data = {
      id: player.id,
      nickname: player.nickname,
      phone: player.phone ? decryptPhone(player.phone) : null,
      wechatId: player.wechat_id,
      privacySetting: player.privacy_setting,
      status: player.status,
      createdAt: player.created_at,
    };
    ok(res, data, 201);
  } catch (e) {
    fail(res, e.message);
  }
});

// GET /api/players/:id - 获取玩家信息
router.get('/:id', (req, res) => {
  try {
    const player = dao.getPlayerById(req.params.id);
    if (!player) return fail(res, '玩家不存在', 404);
    const data = {
      id: player.id,
      nickname: player.nickname,
      phone: player.phone ? decryptPhone(player.phone) : null,
      wechatId: player.wechat_id,
      privacySetting: player.privacy_setting,
      currentTableId: player.current_table_id,
      status: player.status,
      createdAt: player.created_at,
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

// PUT /api/players/:id - 更新玩家信息（联系方式等）
router.put('/:id', (req, res) => {
  try {
    const player = dao.getPlayerById(req.params.id);
    if (!player) return fail(res, '玩家不存在', 404);

    const { phone, wechatId, privacySetting } = req.body;
    const updates = {};
    if (phone !== undefined) updates.phone = encryptPhone(phone);
    if (wechatId !== undefined) updates.wechatId = wechatId;
    if (privacySetting !== undefined) {
      if (!['game_only', 'always', 'never'].includes(privacySetting)) {
        return fail(res, 'privacySetting 必须是 game_only / always / never');
      }
      updates.privacySetting = privacySetting;
    }

    dao.updatePlayerContact(player.id, {
      phone: 'phone' in updates ? updates.phone : undefined,
      wechatId: 'wechatId' in updates ? updates.wechatId : undefined,
      privacySetting: 'privacySetting' in updates ? updates.privacySetting : undefined,
    });

    const updated = dao.getPlayerById(player.id);
    const data = {
      id: updated.id,
      nickname: updated.nickname,
      phone: updated.phone ? decryptPhone(updated.phone) : null,
      wechatId: updated.wechat_id,
      privacySetting: updated.privacy_setting,
    };
    ok(res, data);
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
