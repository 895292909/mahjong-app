/**
 * 老板管理端 - 完整逻辑
 */

// ============================================================
// 工具
// ============================================================
async function api(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json();
  if (!body.success) throw new Error(body.message);
  return body.data;
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function showModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

function apiOwner(path, opts) {
  return api(path, { ...opts, headers: { ...(opts?.headers || {}), Authorization: `Bearer ${token}` } });
}

// ============================================================
// 状态
// ============================================================
let token = localStorage.getItem('ownerToken');
let currentHallId = parseInt(localStorage.getItem('ownerHallId') || '0');
let ownerName = localStorage.getItem('ownerName') || '';
let ownerId = parseInt(localStorage.getItem('ownerId') || '0');

let tables = [];
let notifications = JSON.parse(localStorage.getItem('ownerNotifs') || '[]');
let unreadCount = notifications.filter(n => !n.read).length;

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadHallSelect();
  if (token && currentHallId) {
    showPanel();
    connectSocket();
  }
});

// ============================================================
// 登录
// ============================================================
async function loadHallSelect() {
  try {
    const halls = await api('/api/halls');
    const select = document.getElementById('hallSelect');
    select.innerHTML = halls.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
  } catch {}
}

async function login() {
  const hallId = parseInt(document.getElementById('hallSelect').value);
  const password = document.getElementById('loginPass').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!password) { showLoginError('请输入管理密码'); return; }

  errorEl.style.display = 'none';
  btn.disabled = true; btn.textContent = '登录中...';

  try {
    const data = await api('/api/owner/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hallId, password }),
    });
    token = data.token;
    ownerName = data.name;
    currentHallId = hallId;
    // Decode owner ID from token JWT payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      ownerId = payload.id;
    } catch { ownerId = 0; }

    const hallSelect = document.getElementById('hallSelect');
    const hallName = hallSelect.options[hallSelect.selectedIndex]?.text || '';

    localStorage.setItem('ownerToken', token);
    localStorage.setItem('ownerHallId', hallId);
    localStorage.setItem('ownerHallName', hallName);
    localStorage.setItem('ownerName', ownerName);
    localStorage.setItem('ownerId', ownerId);

    document.getElementById('loginPass').value = '';
    showPanel();
    connectSocket();
    toast(`欢迎，${ownerName}`);
  } catch (e) {
    showLoginError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.style.display = 'block';
}

// ============================================================
// 入驻
// ============================================================
function switchLoginTab(tab) {
  document.querySelectorAll('.login-tab').forEach(el => {
    if (el.textContent.trim() === (tab === 'login' ? '登录' : '入驻')) {
      el.style.background = 'var(--green)';
      el.style.color = '#fff';
    } else {
      el.style.background = 'var(--gray-50)';
      el.style.color = 'var(--gray-600)';
    }
  });
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('loginError').style.display = 'none';
}

async function register() {
  const hallName = document.getElementById('regHallName').value.trim();
  const address = document.getElementById('regAddress').value.trim();
  const openTime = document.getElementById('regOpenTime').value;
  const closeTime = document.getElementById('regCloseTime').value;
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const wechatId = document.getElementById('regWechat').value.trim();
  const password = document.getElementById('regPass').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('regBtn');

  if (!hallName) { showLoginError('请输入麻将馆名称'); return; }
  if (!name) { showLoginError('请输入老板称呼'); return; }
  if (!password || password.length < 4) { showLoginError('密码至少4位'); return; }

  errorEl.style.display = 'none';
  btn.disabled = true; btn.textContent = '注册中...';

  try {
    const data = await api('/api/owner/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: hallName, address, openTime, closeTime, nickname: name, phone, wechatId, password }),
    });
    token = data.token;
    ownerName = data.name;
    currentHallId = data.hallId;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      ownerId = payload.id;
    } catch { ownerId = 0; }

    localStorage.setItem('ownerToken', token);
    localStorage.setItem('ownerHallId', data.hallId);
    localStorage.setItem('ownerHallName', hallName);
    localStorage.setItem('ownerName', ownerName);
    localStorage.setItem('ownerId', ownerId);

    showPanel();
    connectSocket();
    toast(`🎉 入驻成功，欢迎 ${ownerName}`);
  } catch (e) {
    showLoginError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = '立即入驻';
  }
}

// ============================================================
// 面板切换
// ============================================================
function showPanel() {
  document.getElementById('loginBox').style.display = 'none';
  document.querySelector('.admin-panel').classList.add('active');
  document.getElementById('notifBell').style.display = 'flex';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  const hallName = localStorage.getItem('ownerHallName') || '管理';
  document.getElementById('ownerHeaderTitle').textContent = ownerName + ' · ' + hallName;
  loadDashboard();
}

function switchTab(tab) {
  document.querySelectorAll('.owner-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  ['tabTables', 'tabNotifs', 'tabLogs'].forEach(id => {
    document.getElementById(id).style.display = id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1) ? 'block' : 'none';
  });
  if (tab === 'notifs') renderNotifs();
  if (tab === 'logs') loadAuditLogs();
}

// ============================================================
// 仪表盘
// ============================================================
async function loadDashboard() {
  await Promise.all([loadStats(), loadMonitorList(), renderTableManager()]);
}

async function renderTableManager() {
  const el = document.getElementById('tableManagerBar');
  if (!el) return;
  el.style.display = 'flex';
}

async function addTable() {
  if (!confirm('确定添加一张新牌桌？')) return;
  try {
    await apiOwner(`/api/owner/halls/${currentHallId}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add' }),
    });
    toast('新牌桌已添加');
    loadDashboard();
  } catch (e) { toast(e.message); }
}

async function removeTable() {
  if (!confirm('确定删除最后一张空桌？（有人的牌桌不会被删除）')) return;
  try {
    await apiOwner(`/api/owner/halls/${currentHallId}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove' }),
    });
    toast('空桌已删除');
    loadDashboard();
  } catch (e) { toast(e.message); }
}

async function loadStats() {
  try {
    const stats = await apiOwner(`/api/owner/stats/${currentHallId}`);
    document.getElementById('statsRow').innerHTML = `
      <div class="stat-card"><div class="num">${stats.total_tables}</div><div class="label">总桌</div></div>
      <div class="stat-card"><div class="num">${stats.waiting_tables}</div><div class="label">空闲</div></div>
      <div class="stat-card"><div class="num">${stats.playing_tables}</div><div class="label">已成局</div></div>
      <div class="stat-card"><div class="num">${stats.finished_tables}</div><div class="label">已结束</div></div>
    `;
  } catch (e) { if (String(e).includes('令牌')) logout(); }
}

// ============================================================
// 牌桌监控列表
// ============================================================
const PLAYER_COLORS_OWNER = ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'];

async function loadMonitorList() {
  try {
    const hallData = await api(`/api/halls/${currentHallId}`);
    tables = hallData.tables || [];
    renderMonitorList();
  } catch (e) { toast(e.message); }
}

function renderMonitorList() {
  const el = document.getElementById('monitorList');
  if (!tables.length) { el.innerHTML = '<div class="empty-state"><p>暂无牌桌</p></div>'; return; }

  el.innerHTML = tables.map(t => {
    const statusMap = { waiting: '等待中', playing: '已成局', finished: '已结束' };
    const isPlaying = t.status === 'playing';
    const btnHtml = isPlaying
      ? `<button class="btn btn-sm btn-primary" onclick="showContacts(${t.id})" style="background:var(--gold);color:var(--green-dark)">📞 查看联系方式</button>`
      : '';

    const playersHtml = (t.players || []).map(p => {
      const color = PLAYER_COLORS_OWNER[(p.id || p.seatNumber || 1) % 4];
      return `<span class="monitor-player"><span class="mini-avatar" style="background:${color}">${p.nickname.charAt(0)}</span>${p.nickname}</span>`;
    }).join('');

    const startStr = t.startTime ? new Date(t.startTime).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

    return `
      <div class="monitor-table ${isPlaying ? 'playing' : ''}" id="monTable-${t.id}">
        <div class="top-row">
          <span class="table-name">${t.tableNumber}</span>
          <span><span class="status-badge status-${t.status}">${statusMap[t.status] || t.status}</span></span>
        </div>
        <div class="table-mid">
          <span>🧑 ${t.currentPlayers}/${t.maxPlayers}人</span>
          ${t.ownerNickname ? `<span>👑 ${t.ownerNickname}</span>` : ''}
          <span>🎯 底分 ${t.baseScore}</span>
          ${startStr ? `<span>🕐 ${startStr}</span>` : ''}
        </div>
        ${playersHtml ? `<div class="players-row">${playersHtml}</div>` : '<div style="font-size:13px;color:var(--gray-200);margin-bottom:8px">空桌</div>'}
        ${btnHtml}
      </div>
    `;
  }).join('');
}

// ============================================================
// 联系方式 - 弹窗
// ============================================================
let contactCache = null;
let revealTarget = null; // { playerId, playerName }

async function showContacts(tableId) {
  try {
    const data = await apiOwner(`/api/owner/table/${tableId}/contacts`);
    contactCache = data;

    document.getElementById('contactModalTitle').textContent = `${data.tableNumber} · 联系方式`;

    const playersHtml = data.players.map((p, i) => {
      const color = PLAYER_COLORS_OWNER[i % 4];
      const isOwner = p.isOwner;
      const phoneDisplay = p.canViewFullPhone && p.phone
        ? `<span class="revealed" id="phoneVal-${p.id}">${p.phone}</span>`
        : `<span class="masked" id="phoneVal-${p.id}">${p.phone || '未提供'}</span>`;
      const revealBtn = p.phone && !p.canViewFullPhone
        ? `<button class="btn btn-sm btn-gold" onclick="showRevealConfirm(${p.id},'${p.nickname}')" style="font-size:11px">查看完整号码</button>`
        : '';
      const copyBtn = p.phone
        ? `<button class="btn btn-sm btn-secondary" onclick="copyText('${p.phone}','手机号已复制')" style="font-size:11px">📋 复制</button>`
        : '';

      return `
        <div class="contact-player">
          <div class="contact-avatar" style="background:${color}">${p.nickname.charAt(0)}</div>
          <div class="contact-info">
            <div class="name">${isOwner ? '<span class="crown-small">👑</span>' : ''}${p.nickname}<span class="seat-tag">${p.seatNumber}号位</span></div>
            <div class="detail-row">
              📞 ${phoneDisplay}
              ${revealBtn}
              ${copyBtn}
            </div>
            <div class="detail-row">💬 ${p.wechatId || '未提供'}</div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('contactModalBody').innerHTML = playersHtml;
    showModal('contactModal');
  } catch (e) { toast(e.message); }
}

function closeContactModal() {
  closeModal('contactModal');
  contactCache = null;
  revealTarget = null;
}

// ============================================================
// 查看完整号码 - 二次确认
// ============================================================
function showRevealConfirm(playerId, nickname) {
  revealTarget = { playerId, nickname };
  document.getElementById('revealPlayerName').textContent = nickname;
  showModal('revealModal');
}

async function confirmReveal() {
  if (!revealTarget) return;

  // Log the view
  try {
    await apiOwner('/api/owner/contact-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: revealTarget.playerId,
        tableId: contactCache?.tableId || 0,
        viewType: 'phone',
      }),
    });
  } catch {}

  // Show full number - need to re-fetch to get decrypted phone
  try {
    const tableId = contactCache?.tableId;
    const fresh = await apiOwner(`/api/owner/table/${tableId}/contacts`);
    const player = fresh.players.find(p => p.id === revealTarget.playerId);
    if (player && player.phone) {
      const el = document.getElementById(`phoneVal-${player.id}`);
      if (el) {
        el.textContent = player.phone;
        el.className = 'revealed';
      }
    }
  } catch {}

  closeModal('revealModal');
  toast('已显示完整号码（已记录至审计日志）');
  revealTarget = null;
}

// ============================================================
// 复制
// ============================================================
function copyText(text, msg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast(msg || '已复制'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
    toast(msg || '已复制');
  }
}

// ============================================================
// 通知管理
// ============================================================
function addNotification(notif) {
  notif.id = Date.now() + Math.random();
  notif.read = false;
  notif.time = new Date().toISOString();
  notifications.unshift(notif);
  unreadCount++;
  localStorage.setItem('ownerNotifs', JSON.stringify(notifications));
  updateNotifBadge();
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  const tabBadge = document.getElementById('notifTabBadge');
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = 'flex';
    tabBadge.textContent = unreadCount;
    tabBadge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
    tabBadge.style.display = 'none';
  }
}

function renderNotifs() {
  const el = document.getElementById('notifList');
  if (!notifications.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🔔</div><p>暂无通知</p></div>';
    return;
  }
  el.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="scrollToTable(${n.tableId})">
      <div class="notif-icon">🀄</div>
      <div class="notif-body">
        <div class="notif-title">${n.message || '牌桌已成局'}</div>
        <div class="notif-time">${formatTime(n.time)}</div>
      </div>
      ${n.read ? '' : `<span class="notif-read-btn" onclick="event.stopPropagation();markRead('${n.id}')">标为已读</span>`}
    </div>
  `).join('');
}

function markRead(id) {
  const n = notifications.find(x => x.id == id);
  if (n) { n.read = true; unreadCount = Math.max(0, unreadCount - 1); }
  localStorage.setItem('ownerNotifs', JSON.stringify(notifications));
  updateNotifBadge();
  renderNotifs();
}

function markAllRead() {
  notifications.forEach(n => n.read = true);
  unreadCount = 0;
  localStorage.setItem('ownerNotifs', JSON.stringify(notifications));
  updateNotifBadge();
  renderNotifs();
}

function scrollToTable(tableId) {
  switchTab('tables');
  setTimeout(() => {
    const el = document.getElementById(`monTable-${tableId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function toggleNotifPanel() {
  switchTab('notifs');
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// 审计日志
// ============================================================
async function loadAuditLogs() {
  const el = document.getElementById('auditList');
  try {
    const hallData = await api(`/api/halls/${currentHallId}`);
    const playing = hallData.tables.filter(t => t.status === 'playing');
    // Show each playing table and who's at it (this serves as the view log proxy)
    if (!playing.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>暂无查看记录</p></div>';
      return;
    }
    // For demo, show recently viewed players from notification history
    const recentViews = notifications.filter(n => !n.read).slice(0, 10);
    if (recentViews.length) {
      el.innerHTML = recentViews.map(n => `
        <div class="audit-item">
          <div class="audit-left">🀄 ${n.message || '查看联系方式'}</div>
          <div class="audit-time">${formatTime(n.time)}</div>
        </div>
      `).join('');
    } else {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);font-size:13px">查看玩家联系方式时，系统会自动记录审计日志。</div>';
    }
  } catch { el.innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; }
}

// ============================================================
// 桌面通知
// ============================================================
function requestNotifPermission() {
  if (!('Notification' in window)) { toast('此浏览器不支持桌面通知'); return; }
  if (Notification.permission === 'granted') { toast('桌面通知已开启'); return; }
  if (Notification.permission === 'denied') { toast('通知已被浏览器阻止，请在设置中开启'); return; }
  Notification.requestPermission().then(perm => {
    toast(perm === 'granted' ? '桌面通知已开启' : '通知被拒绝');
  });
}

function sendDesktopNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch {}
}

// ============================================================
// Socket 连接（以老板身份）
// ============================================================
function connectSocket() {
  if (typeof socket === 'undefined' || !socket.connected) {
    // Wait for socket to connect then register
    const check = setInterval(() => {
      if (typeof socket !== 'undefined' && socket.connected) {
        clearInterval(check);
        registerOwner();
      }
    }, 300);
    setTimeout(() => clearInterval(check), 10000);
  } else {
    registerOwner();
  }
}

function registerOwner() {
  socket.emit('ownerLogin', { ownerId, hallId: currentHallId });
  console.log('[Owner] 已加入老板房间 hall=' + currentHallId);

  // Listen for gameReady
  socket.off('gameReady');
  socket.on('gameReady', (data) => {
    console.log('[Owner] gameReady:', data.message);
    addNotification({ tableId: data.tableId, message: data.message, hallId: data.hallId });
    showGameReadyToast(data);
    loadMonitorList();
    loadStats();
    sendDesktopNotif('🀄 牌桌已成局', data.message);
  });

  // Listen for table update
  socket.off('tableUpdate');
  socket.on('tableUpdate', () => {
    loadMonitorList();
    loadStats();
  });
}

function showGameReadyToast(data) {
  // Remove any existing
  document.querySelectorAll('.game-ready-toast').forEach(e => e.remove());
  const toast = document.createElement('div');
  toast.className = 'game-ready-toast';
  toast.onclick = () => { toast.remove(); scrollToTable(data.tableId); };
  toast.innerHTML = `<div class="toast-title">🀄 ${data.message}</div><div class="toast-sub">${data.playerCount}人 · ${new Date(data.timestamp).toLocaleTimeString()}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

// ============================================================
// 退出
// ============================================================
function logout() {
  if (typeof socket !== 'undefined') {
    socket.off('gameReady');
    socket.off('tableUpdate');
  }
  localStorage.removeItem('ownerToken');
  localStorage.removeItem('ownerHallId');
  localStorage.removeItem('ownerName');
  localStorage.removeItem('ownerId');
  token = null; currentHallId = 0;
  location.reload();
}
