const dao = require('../database/dao');

/**
 * 向 hall-{hallId} 广播完整的牌桌列表更新
 */
function broadcastTableUpdate(io, hallId) {
  const tables = dao.getTablesByHall(hallId);
  io.to(`hall-${hallId}`).emit('tableUpdate', tables);
}

/**
 * 向 owner-{hallId} 发送成局通知
 */
function notifyGameReady(io, hallId, table) {
  io.to(`owner-${hallId}`).emit('gameReady', {
    tableId: table.id,
    tableNumber: table.table_number,
    hallId,
    message: `${table.table_number}已成局，请及时联系玩家`,
    playerCount: table.current_players,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 广播 hall-{hallId} 在线人数
 */
function broadcastOnlineCount(io, hallId) {
  const onlineCount = dao.getOnlineCountByHall(hallId);
  io.to(`hall-${hallId}`).emit('playerCountUpdate', { onlineCount });
}

function setupSocket(socket, io) {
  console.log(`[连接] ${socket.id} 已连接`);

  // ---- 连接身份绑定 ----
  socket.on('joinHall', ({ hallId, playerId }) => {
    socket.join(`hall-${hallId}`);
    socket.data.hallId = hallId;
    socket.data.playerId = playerId;

    // 更新玩家在线状态
    if (playerId) {
      dao.updatePlayerStatus(playerId, 'online', socket.id);
    }

    // 回复当前牌桌状态
    const tables = dao.getTablesByHall(hallId);
    socket.emit('tableUpdate', tables);

    broadcastOnlineCount(io, hallId);
  });

  socket.on('ownerLogin', ({ ownerId, hallId }) => {
    socket.join(`owner-${hallId}`);
    socket.data.hallId = hallId;
    socket.data.ownerId = ownerId;
    console.log(`[老板] ${ownerId} 登录麻将馆 ${hallId}`);
  });

  // ---- 加入牌桌 ----
  socket.on('joinTable', ({ tableId, playerId, seatNumber, hallId }, cb = () => {}) => {
    try {
      const table = dao.joinTable(tableId, playerId, seatNumber || null);
      const resolvedHallId = hallId || table.hall_id;

      // 广播牌桌更新（DAO已经处理了玩家状态）
      broadcastTableUpdate(io, resolvedHallId);

      // 如果满员成局 → 通知老板
      if (table.status === 'playing' && table.current_players >= table.max_players) {
        notifyGameReady(io, resolvedHallId, table);
      }

      broadcastOnlineCount(io, resolvedHallId);
      cb({ ok: true, table });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  // ---- 离开牌桌 ----
  socket.on('leaveTable', ({ tableId, playerId, hallId }, cb = () => {}) => {
    try {
      const table = dao.leaveTable(tableId, playerId);
      const resolvedHallId = hallId || table.hall_id;

      broadcastTableUpdate(io, resolvedHallId);
      broadcastOnlineCount(io, resolvedHallId);
      cb({ ok: true, table });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  // ---- 房主修改设置 ----
  socket.on('updateSettings', ({ tableId, playerId, baseScore, startTime, hallId }, cb = () => {}) => {
    try {
      const table = dao.getTableById(tableId);
      if (!table) return cb({ error: '牌桌不存在' });
      if (table.owner_id !== playerId) return cb({ error: '只有房主才能修改设置' });

      dao.updateTableSettings(tableId, { baseScore, startTime });
      broadcastTableUpdate(io, hallId || table.hall_id);
      cb({ ok: true });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  // ---- 断线 ----
  socket.on('disconnect', () => {
    console.log(`[断线] ${socket.id}`);

    const playerId = socket.data.playerId;
    const hallId = socket.data.hallId;

    if (playerId) {
      // 只清理 socket_id，不改变在线状态
      // 避免多标签页场景下（同时开着牌桌页和老板页）一个标签页断开导致另一标签页失去身份
      const player = dao.getPlayerById(playerId);
      if (player && player.socket_id === socket.id) {
        dao.updatePlayerStatus(playerId, 'offline', null);
      }
      // 如果 socket_id 已被其他 socket 覆盖（另一个标签页），则不修改
    }

    if (hallId) {
      broadcastOnlineCount(io, hallId);
    }
  });
}

module.exports = setupSocket;
