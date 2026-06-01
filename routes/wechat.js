const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const dao = require('../database/dao');
const { ok, fail } = require('../middleware/auth');
const { wechat } = require('../config/database');

// 内存 session_key 缓存（生产环境建议用 Redis）
const sessionCache = new Map();

/**
 * 微信登录：code → jscode2session → openid
 */
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return fail(res, 'code 必填');

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${wechat.appid}&secret=${wechat.secret}&js_code=${code}&grant_type=authorization_code`;
    const wxResp = await fetch(url);
    const wxData = await wxResp.json();

    if (wxData.errcode) {
      return fail(res, `微信登录失败: ${wxData.errmsg}`, 400);
    }

    const { openid, session_key } = wxData;

    // 查找是否已注册
    const existing = dao.getPlayerByOpenid(openid);
    const isNew = !existing;

    // 缓存 session_key 用于后续解密
    sessionCache.set(openid, session_key);

    ok(res, { openid, isNew });
  } catch (e) {
    fail(res, e.message);
  }
});

/**
 * 绑定用户信息（创建或更新玩家）
 */
router.post('/bind-user', (req, res) => {
  try {
    const { openid, nickname, avatarUrl } = req.body;
    if (!openid || !nickname) return fail(res, 'openid 和 nickname 必填');

    const existing = dao.getPlayerByOpenid(openid);
    if (existing) {
      dao.updatePlayerWechatAvatar(existing.id, { nickname, avatarUrl });
      const player = dao.getPlayerById(existing.id);
      ok(res, { id: player.id, nickname: player.nickname, avatarUrl: player.avatar_url, isNew: false });
    } else {
      const player = dao.createPlayerWithWechat({ openid, nickname, avatarUrl });
      ok(res, { id: player.id, nickname: player.nickname, avatarUrl: player.avatar_url, isNew: true }, 201);
    }
  } catch (e) {
    fail(res, e.message);
  }
});

/**
 * 解密微信手机号（getPhoneNumber 授权）
 * 前端需要先 wx.login() 获取新 code，一起传过来换取 session_key
 */
router.post('/bind-phone', async (req, res) => {
  try {
    const { openid, encryptedData, iv, code } = req.body;
    if (!openid || !encryptedData || !iv) return fail(res, '参数不完整');

    let sessionKey = sessionCache.get(openid);
    if (code) {
      // 前端传了新 code，重新换取 session_key
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(wechat.appid)}&secret=${encodeURIComponent(wechat.secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
      const wxResp = await fetch(url);
      const wxData = await wxResp.json();
      if (wxData.errcode) {
        return fail(res, `微信验证失败(${wxData.errcode}): ${wxData.errmsg}`, 400);
      }
      sessionKey = wxData.session_key;
      sessionCache.set(openid, sessionKey);
    }

    if (!sessionKey) return fail(res, 'session_key 不存在，请先 wx.login', 401);

    // AES-128-CBC 解密（微信规范）
    const aesKey = Buffer.from(sessionKey, 'base64');
    const aesIv = Buffer.from(iv, 'base64');
    const encrypted = Buffer.from(encryptedData, 'base64');

    const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, aesIv);
    decipher.setAutoPadding(true);
    let decoded = decipher.update(encrypted, null, 'utf8');
    decoded += decipher.final('utf8');

    const data = JSON.parse(decoded);

    // 验证数据属于该 openid
    if (data.watermark && data.watermark.openid !== openid) {
      return fail(res, '手机号校验失败', 400);
    }

    const phoneNumber = data.phoneNumber;
    const { encryptPhone } = require('../utils/crypto');
    const encryptedPhone = encryptPhone(phoneNumber);

    // 更新玩家手机号
    const player = dao.getPlayerByOpenid(openid);
    if (player) {
      dao.updatePlayerContact(player.id, { phone: encryptedPhone });
    }

    ok(res, { phone: phoneNumber });
  } catch (e) {
    fail(res, '手机号解密失败: ' + e.message);
  }
});

module.exports = router;
