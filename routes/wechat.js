const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const dao = require('../database/dao');
const { ok, fail } = require('../middleware/auth');
const { wechat } = require('../config/database');

const sessionCache = new Map();

router.post('/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return fail(res, 'code 必填');

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(wechat.appid)}&secret=${encodeURIComponent(wechat.secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const wxResp = await fetch(url);
    const wxData = await wxResp.json();

    if (wxData.errcode) {
      return fail(res, `微信登录失败(${wxData.errcode}): ${wxData.errmsg}`, 400);
    }

    const { openid, session_key } = wxData;

    const existing = await dao.getPlayerByOpenid(openid);
    const isNew = !existing;

    sessionCache.set(openid, session_key);

    ok(res, { openid, isNew });
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/bind-user', async (req, res) => {
  try {
    const { openid, nickname, avatarUrl } = req.body;
    if (!openid || !nickname) return fail(res, 'openid 和 nickname 必填');

    const existing = await dao.getPlayerByOpenid(openid);
    if (existing) {
      const player = await dao.getPlayerById(existing.id);
      const { decryptPhone } = require('../utils/crypto');
      ok(res, {
        id: player.id,
        nickname: player.nickname,
        phone: player.phone ? decryptPhone(player.phone) : null,
        wechatId: player.wechat_id,
        privacySetting: player.privacy_setting,
        avatarUrl: player.avatar_url,
        isNew: false,
      });
    } else {
      const player = await dao.createPlayerWithWechat({ openid, nickname, avatarUrl });
      ok(res, {
        id: player.id,
        nickname: player.nickname,
        phone: null,
        wechatId: null,
        privacySetting: player.privacy_setting,
        avatarUrl: player.avatar_url,
        isNew: true,
      }, 201);
    }
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/bind-phone', async (req, res) => {
  try {
    const { openid, encryptedData, iv, code, phoneCode } = req.body;
    if (!openid) return fail(res, 'openid 必填');

    if (phoneCode) {
      const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?appid=${encodeURIComponent(wechat.appid)}&secret=${encodeURIComponent(wechat.secret)}&grant_type=client_credential`;
      const tokenResp = await fetch(tokenUrl);
      const tokenData = await tokenResp.json();
      if (!tokenData.access_token) {
        return fail(res, `获取 access_token 失败: ${tokenData.errmsg}`, 400);
      }

      const phoneUrl = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenData.access_token}`;
      const phoneResp = await fetch(phoneUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: phoneCode }),
      });
      const phoneData = await phoneResp.json();
      if (phoneData.errcode !== 0) {
        return fail(res, `获取手机号失败(${phoneData.errcode}): ${phoneData.errmsg}`, 400);
      }

      const phoneNumber = phoneData.phone_info.phoneNumber;
      const { encryptPhone } = require('../utils/crypto');
      const encryptedPhone = encryptPhone(phoneNumber);

      const player = await dao.getPlayerByOpenid(openid);
      if (player) await dao.updatePlayerContact(player.id, { phone: encryptedPhone });

      return ok(res, { phone: phoneNumber });
    }

    if (!encryptedData || !iv) return fail(res, '参数不完整');

    let sessionKey = sessionCache.get(openid);
    if (code) {
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

    const aesKey = Buffer.from(sessionKey, 'base64');
    const aesIv = Buffer.from(iv, 'base64');
    const encrypted = Buffer.from(encryptedData, 'base64');

    const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, aesIv);
    decipher.setAutoPadding(true);
    let decoded = decipher.update(encrypted, null, 'utf8');
    decoded += decipher.final('utf8');

    const data = JSON.parse(decoded);
    if (data.watermark && data.watermark.openid !== openid) {
      return fail(res, '手机号校验失败', 400);
    }

    const phoneNumber = data.phoneNumber;
    const { encryptPhone } = require('../utils/crypto');
    const encryptedPhone = encryptPhone(phoneNumber);

    const player = await dao.getPlayerByOpenid(openid);
    if (player) await dao.updatePlayerContact(player.id, { phone: encryptedPhone });

    ok(res, { phone: phoneNumber });
  } catch (e) {
    fail(res, '获取手机号失败: ' + e.message);
  }
});

router.post('/admin-bind', async (req, res) => {
  try {
    const { openid, playerId } = req.body;
    if (!openid || !playerId) return fail(res, '参数不完整');
    const { getDb } = require('../database/init');
    await getDb().query('UPDATE players SET openid = $1 WHERE id = $2', [openid, playerId]);
    ok(res, { ok: true });
  } catch (e) {
    fail(res, e.message);
  }
});

router.post('/admin-delete', async (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) return fail(res, '参数不完整');
    const { getDb } = require('../database/init');
    await getDb().query('DELETE FROM players WHERE id = $1', [playerId]);
    ok(res, { ok: true });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
