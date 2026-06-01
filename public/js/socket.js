/**
 * Socket.IO 客户端封装
 * 提供自动重连和全局 socket 实例
 */
const socket = io({
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

socket.on('connect', () => {
  console.log('[Socket] 已连接:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] 断开:', reason);
});

socket.on('connect_error', (err) => {
  console.log('[Socket] 连接错误:', err.message);
});
