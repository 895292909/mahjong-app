const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDatabase } = require('./database/init');
const hallsRouter = require('./routes/halls');
const tablesRouter = require('./routes/tables');
const playersRouter = require('./routes/players');
const ownerRouter = require('./routes/owner');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 30000,
  pingTimeout: 10000,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/halls', hallsRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/players', playersRouter);
app.use('/api/owner', ownerRouter);

// Socket.IO
io.on('connection', (socket) => setupSocket(socket, io));

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`麻将馆管理系统运行在 http://localhost:${PORT}`);
  });
});
