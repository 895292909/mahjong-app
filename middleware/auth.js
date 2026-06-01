const { verifyToken } = require('../utils/crypto');
const dao = require('../database/dao');

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, message: 'ok' });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ success: false, data: null, message });
}

function ownerAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return fail(res, '未提供认证令牌', 401);
  }
  try {
    const decoded = verifyToken(header.slice(7));
    // Verify owner still exists and is active
    const owner = dao.getOwnerByHallId(decoded.hallId);
    if (!owner || owner.id !== decoded.id) {
      return fail(res, '认证令牌无效', 401);
    }
    req.owner = decoded;
    next();
  } catch {
    return fail(res, '认证令牌无效或已过期', 401);
  }
}

module.exports = { ok, fail, ownerAuth };
