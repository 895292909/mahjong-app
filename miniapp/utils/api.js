// 后端 API 地址 — 部署后替换为 Railway 域名
var BASE_URL = 'https://mahjong-app-production-8a77.up.railway.app';

/**
 * 统一 API 请求 8f16da86ebd5414b135d760885d8e5f8
 */
function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      success(res) {
        if (res.statusCode >= 400) {
          reject(new Error(res.data?.message || '请求失败'));
        } else if (res.data?.success) {
          resolve(res.data.data);
        } else {
          reject(new Error(res.data?.message || '操作失败'));
        }
      },
      fail(err) {
        reject(new Error('网络错误: ' + (err.errMsg || '无法连接服务器')));
      },
    });
  });
}

// ===== 麻将馆 =====
function getHalls() {
  return request('GET', '/api/halls');
}
function getHallDetail(id) {
  return request('GET', '/api/halls/' + id);
}

// ===== 玩家 =====
function createPlayer(data) {
  return request('POST', '/api/players', data);
}
function getPlayer(id) {
  return request('GET', '/api/players/' + id);
}
function updatePlayer(id, data) {
  return request('PUT', '/api/players/' + id, data);
}

// ===== 牌桌 =====
function joinTable(tableId, playerId, seatNumber, hallId) {
  return request('POST', '/api/tables/join', { tableId, playerId, seatNumber, hallId });
}
function leaveTable(tableId, playerId, hallId) {
  return request('POST', '/api/tables/leave', { tableId, playerId, hallId });
}
function updateTableSettings(tableId, data) {
  return request('PUT', '/api/tables/' + tableId + '/settings', data);
}

// ===== 老板 =====
function ownerLogin(hallId, password) {
  return request('POST', '/api/owner/login', { hallId, password });
}
function ownerRegister(data) {
  return request('POST', '/api/owner/register', data);
}
function getOwnerStats(hallId, token) {
  return request('GET', '/api/owner/stats/' + hallId, null, token);
}
function getTableContacts(tableId, token) {
  return request('GET', '/api/owner/table/' + tableId + '/contacts', null, token);
}
function logContactView(data, token) {
  return request('POST', '/api/owner/contact-log', data, token);
}
function manageTables(hallId, action, token) {
  return request('POST', '/api/owner/halls/' + hallId + '/tables', { action }, token);
}

// ===== 微信登录 =====
function wechatLogin(code) {
  return request('POST', '/api/wechat/login', { code });
}
function wechatBindUser(data) {
  return request('POST', '/api/wechat/bind-user', data);
}
function wechatBindPhone(data) {
  return request('POST', '/api/wechat/bind-phone', data);
}

module.exports = {
  getHalls, getHallDetail,
  createPlayer, getPlayer, updatePlayer,
  joinTable, leaveTable, updateTableSettings,
  ownerLogin, ownerRegister, getOwnerStats, getTableContacts, logContactView, manageTables,
  wechatLogin, wechatBindUser, wechatBindPhone,
  setBaseUrl(url) { BASE_URL = url; },
};
