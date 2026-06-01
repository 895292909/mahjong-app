const dao = require('../database/dao');

async function broadcastTableUpdate(io, hallId) {
  const tables = await dao.getTablesByHall(hallId);
  io.to(`hall-${hallId}`).emit('tableUpdate', tables);
}

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

async function broadcastOnlineCount(io, hallId) {
  const onlineCount = await dao.getOnlineCountByHall(hallId);
  io.to(`hall-${hallId}`).emit('playerCountUpdate', { onlineCount });
}

function setupSocket(socket, io) {
  console.log(`[连接] ${socket.id} 已连接`);

  socket.on('joinHall', async ({ hallId, playerId }) => {
    socket.join(`hall-${hallId}`);
    socket.data.hallId = hallId;
    socket.data.playerId = playerId;

    if (playerId) {
      await dao.updatePlayerStatus(playerId, 'online', socket.id);
    }

    const tables = await dao.getTablesByHall(hallId);
    socket.emit('tableUpdate', tables);

    broadcastOnlineCount(io, hallId);
  });

  socket.on('ownerLogin', ({ ownerId, hallId }) => {
    socket.join(`owner-${hallId}`);
    socket.data.hallId = hallId;
    socket.data.ownerId = ownerId;
    console.log(`[老板] ${ownerId} 登录麻将馆 ${hallId}`);
  });

  socket.on('joinTable', async ({ tableId, playerId, seatNumber, hallId }, cb = () => {}) => {
    try {
      const table = await dao.joinTable(tableId, playerId, seatNumber || null);
      const resolvedHallId = hallId || table.hall_id;

      broadcastTableUpdate(io, resolvedHallId);

      if (table.status === 'playing' && table.current_players >= table.max_players) {
        notifyGameReady(io, resolvedHallId, table);
      }

      broadcastOnlineCount(io, resolvedHallId);
      cb({ ok: true, table });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  socket.on('leaveTable', async ({ tableId, playerId, hallId }, cb = () => {}) => {
    try {
      const table = await dao.leaveTable(tableId, playerId);
      const resolvedHallId = hallId || table.hall_id;

      broadcastTableUpdate(io, resolvedHallId);
      broadcastOnlineCount(io, resolvedHallId);
      cb({ ok: true, table });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  socket.on('updateSettings', async ({ tableId, playerId, baseScore, startTime, hallId }, cb = () => {}) => {
    try {
      const table = await dao.getTableById(tableId);
      if (!table) return cb({ error: '牌桌不存在' });
      if (table.owner_id !== playerId) return cb({ error: '只有房主才能修改设置' });

      await dao.updateTableSettings(tableId, { baseScore, startTime });
      broadcastTableUpdate(io, hallId || table.hall_id);
      cb({ ok: true });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  socket.on('disconnect', async () => {
    console.log(`[断线] ${socket.id}`);

    const playerId = socket.data.playerId;
    const hallId = socket.data.hallId;

    if (playerId) {
      const player = await dao.getPlayerById(playerId);
      if (player && player.socket_id === socket.id) {
        await dao.updatePlayerStatus(playerId, 'offline', null);
      }
    }

    if (hallId) {
      broadcastOnlineCount(io, hallId);
    }
  });
}

module.exports = setupSocket;
