require('express-async-errors');
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
const wechatRouter = require('./routes/wechat');
const dao = require('./database/dao');
const { decryptPhone, maskPhone } = require('./utils/crypto');
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

app.use('/api/halls', hallsRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/players', playersRouter);
app.use('/api/owner', ownerRouter);
app.use('/api/wechat', wechatRouter);

app.get('/debug/db', async (req, res) => {
  const data = await dao.getDbDump();
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>数据库查看</title>';
  html += '<style>body{font-family:sans-serif;background:#f5efe6;padding:20px}h1{color:#2d5016}table{border-collapse:collapse;margin:12px 0 24px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}th{background:#2d5016;color:#fff;padding:8px 10px;font-size:13px;text-align:left}td{padding:6px 10px;font-size:13px;border-bottom:1px solid #eee}tr:hover{background:#f0f0f0}h2{color:#2d5016;margin-top:24px}code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:12px}</style></head><body>';
  html += '<h1>&#x1F004; 数据库内容</h1><p>从 PostgreSQL</p>';
  for (const [tableName, rows] of Object.entries(data)) {
    html += '<h2>&#x1F4CB; ' + tableName + ' <code>' + rows.length + ' 条记录</code></h2>';
    if (rows.length === 0) { html += '<p style="color:#999">空表</p>'; continue; }
    const cols = Object.keys(rows[0]);
    html += '<table><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>' + cols.map(c => {
        let val = row[c];
        if (val === null) return '<td style="color:#ccc">NULL</td>';
        if (c === 'phone' && tableName === 'players' && val) {
          try { val = decryptPhone(val); } catch {}
        }
        const str = String(val);
        if (str.length > 80) return '<td title="' + str + '">' + str.slice(0, 80) + '&#x2026;</td>';
        return '<td>' + str + '</td>';
      }).join('') + '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</body></html>';
  res.send(html);
});

io.on('connection', (socket) => setupSocket(socket, io));

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`麻将馆管理系统运行在 http://localhost:${PORT}`);
  });
});
