const express = require('express');
const router = express.Router();
const dao = require('../database/dao');
const { encryptPhone, decryptPhone } = require('../utils/crypto');
const { ok, fail } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const players = await dao.getAllPlayers();
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

router.post('/', async (req, res) => {
  try {
    const { nickname, phone, wechatId, privacySetting } = req.body;
    if (!nickname) return fail(res, '昵称必填');
    if (!privacySetting || !['game_only', 'always', 'never'].includes(privacySetting)) {
      return fail(res, 'privacySetting 必须是 game_only / always / never');
    }
    const encryptedPhone = phone ? encryptPhone(phone) : null;
    const player = await dao.createPlayer({ nickname, phone: encryptedPhone, wechatId, privacySetting });
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

router.get('/:id', async (req, res) => {
  try {
    const player = await dao.getPlayerById(req.params.id);
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

router.put('/:id', async (req, res) => {
  try {
    const player = await dao.getPlayerById(req.params.id);
    if (!player) return fail(res, '玩家不存在', 404);

    const { nickname, phone, wechatId, privacySetting } = req.body;
    if (nickname !== undefined) await dao.updateNickname(player.id, nickname);
    if (wechatId !== undefined || phone !== undefined || privacySetting !== undefined) {
      const updates = {};
      if (phone !== undefined) updates.phone = encryptPhone(phone);
      if (wechatId !== undefined) updates.wechatId = wechatId;
      if (privacySetting !== undefined) {
        if (!['game_only', 'always', 'never'].includes(privacySetting)) {
          return fail(res, 'privacySetting 必须是 game_only / always / never');
        }
        updates.privacySetting = privacySetting;
      }
      await dao.updatePlayerContact(player.id, {
        phone: 'phone' in updates ? updates.phone : undefined,
        wechatId: 'wechatId' in updates ? updates.wechatId : undefined,
        privacySetting: 'privacySetting' in updates ? updates.privacySetting : undefined,
      });
    }

    const updated = await dao.getPlayerById(player.id);
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
