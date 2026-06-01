/**
 * 麻将排桌 - 主逻辑
 * 同时用于 index.html（首页）和 hall.html（牌桌页）
 */

// ============================================================
// 工具函数
// ============================================================

async function api(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json();
  if (!body.success) throw new Error(body.message);
  return body.data;
}

/**
 * 将后端 snake_case 字段转为前端 camelCase
 */
function normalizeTable(t) {
  return {
    id: t.id,
    hallId: t.hall_id,
    tableNumber: t.table_number,
    status: t.status,
    baseScore: t.base_score,
    startTime: t.start_time,
    maxPlayers: t.max_players,
    currentPlayers: t.current_players,
    ownerId: t.owner_id,
    ownerNickname: t.ownerNickname,
    players: (t.players || []).map(p => ({
      id: p.id,
      nickname: p.nickname,
      seatNumber: p.seat_number || p.seatNumber,
      isOwner: !!(p.is_owner || p.isOwner),
      joinedAt: p.joined_at || p.joinedAt,
    })),
  };
}

function normalizeTables(tables) {
  return (tables || []).map(normalizeTable);
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function showModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ============================================================
// 玩家信息管理
// ============================================================

function getPlayer() {
  try { return JSON.parse(localStorage.getItem('mahjongPlayer')); } catch { return null; }
}

function savePlayer(data) {
  localStorage.setItem('mahjongPlayer', JSON.stringify(data));
  updateAvatarUI();
}

function updateAvatarUI() {
  const p = getPlayer();
  const els = document.querySelectorAll('.player-avatar');
  els.forEach(el => {
    el.textContent = p ? p.nickname.charAt(0) : '?';
  });
}

function showProfile() {
  const p = getPlayer();
  const isEdit = document.getElementById('profileEdit');
  const display = document.getElementById('profileDisplay');
  const title = document.getElementById('profileTitle');

  if (p && display) {
    title.textContent = '个人信息';
    document.getElementById('profileAvatar').textContent = p.nickname.charAt(0);
    document.getElementById('profileName').textContent = p.nickname;
    document.getElementById('profilePhone').textContent = p.phone || '';
    isEdit.style.display = 'none';
    display.style.display = 'flex';
  } else {
    if (title) title.textContent = '设置个人信息';
    if (isEdit) isEdit.style.display = 'block';
    if (display) display.style.display = 'none';
  }
  if (p) {
    document.getElementById('profileNickname').value = p.nickname || '';
    document.getElementById('profilePhoneInput').value = p.phone || '';
    document.getElementById('profileWechat').value = p.wechatId || '';
    document.getElementById('profilePrivacy').value = p.privacySetting || 'game_only';
  }
  showModal('profileModal');
}

function showProfileHall() { showProfile(); }

function toggleProfileEdit() {
  document.getElementById('profileDisplay').style.display = 'none';
  document.getElementById('profileEdit').style.display = 'block';
  document.getElementById('profileTitle').textContent = '修改信息';
}

async function saveProfile() {
  const nickname = document.getElementById('profileNickname').value.trim();
  const phone = document.getElementById('profilePhoneInput').value.trim();
  const wechatId = document.getElementById('profileWechat').value.trim();
  const privacySetting = document.getElementById('profilePrivacy').value;

  if (!nickname) return toast('请输入昵称');
  if (!phone || phone.length < 11) return toast('请输入正确的手机号');

  try {
    // Try to create/update player on server
    const existing = getPlayer();
    let data;
    if (existing && existing.id) {
      data = await api(`/api/players/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, wechatId, privacySetting }),
      });
      data.nickname = nickname;
    } else {
      data = await api('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, phone, wechatId, privacySetting }),
      });
    }
    savePlayer({ id: data.id, nickname: data.nickname, phone: data.phone, wechatId: data.wechatId, privacySetting: data.privacySetting });
    closeModal('profileModal');
    toast('信息已保存');
  } catch (e) {
    // Fallback: save locally only
    savePlayer({ id: existing?.id || 0, nickname, phone, wechatId, privacySetting });
    closeModal('profileModal');
    toast('信息已保存');
  }
}

// ============================================================
// 首页：麻将馆列表
// ============================================================

async function loadHalls() {
  const el = document.getElementById('hallList');
  if (!el) return;
  try {
    const halls = await api('/api/halls');
    if (!halls || halls.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无营业中的麻将馆</p></div>';
      return;
    }
    el.innerHTML = halls.map((h, i) => `
      <div class="hall-card" onclick="goHall(${h.id})" style="animation-delay:${i * 0.07}s">
        <h3>${h.name}</h3>
        <div class="info info-row">📍 ${h.address || '地址待补'}</div>
        <div class="info info-row">🕐 ${h.openTime || '?'} - ${h.closeTime || '?'}　📞 ${h.phone || '-'}</div>
        <div class="bottom-row">
          <span class="tag tag-open">营业中</span>
          <div class="empty-count">${h.emptyTables} <span>/ ${h.totalTables} 空桌</span></div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>加载失败: ${e.message}</p></div>`;
  }
}

function goHall(id) {
  window.location.href = `/hall.html?hallId=${id}`;
}

// ============================================================
// 牌桌页面
// ============================================================

let currentHallId = null;
let currentTables = [];
let joinTarget = null;      // { tableId }
let leaveTarget = null;     // { tableId, playerId, nickname }
let settingsTarget = null;  // { tableId }
let selectedSeat = null;

const SEAT_POSITIONS = ['top', 'right', 'bottom', 'left'];
const PLAYER_COLORS = ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'];

async function loadTables() {
  const el = document.getElementById('tableList');
  if (!el) return;

  const params = new URLSearchParams(location.search);
  currentHallId = parseInt(params.get('hallId'));
  if (!currentHallId) { el.innerHTML = '<div class="empty-state"><p>参数错误</p></div>'; return; }

  try {
    const hallData = await api(`/api/halls/${currentHallId}`);
    document.getElementById('hallTitle').textContent = hallData.name;
    currentTables = hallData.tables || [];
    renderTables();
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }

  // Socket setup — join hall + listen for real-time updates
  const p = getPlayer();
  let playerId = currentPlayerId || (p ? p.id : 0);

  function setupSocketListeners() {
    if (typeof socket === 'undefined' || !socket.connected) return;
    socket.emit('joinHall', { hallId: currentHallId, playerId: playerId || undefined });

    socket.off('tableUpdate');
    socket.on('tableUpdate', (tables) => { currentTables = normalizeTables(tables); renderTables(); });

    socket.off('playerCountUpdate');
    socket.on('playerCountUpdate', ({ onlineCount }) => {
      const badge = document.getElementById('onlineBadge');
      if (badge) badge.textContent = `● ${onlineCount}人在线`;
    });
  }

  setupSocketListeners();

  // Re-establish player context on socket reconnect
  if (typeof socket !== 'undefined') {
    socket.off('connect', setupSocketListeners);
    socket.on('connect', setupSocketListeners);
  }
}

function renderTables() {
  const el = document.getElementById('tableList');
  if (!el) return;
  if (!currentTables || currentTables.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🪑</div><p>暂无牌桌</p></div>';
    return;
  }
  el.innerHTML = currentTables.map((t, i) => renderTableCard(t, i)).join('');
}

function renderTableCard(t, idx) {
  const statusMap = { waiting: '等待中', playing: '已成局', finished: '已结束' };
  const occupied = {};
  (t.players || []).forEach(p => { occupied[p.seatNumber] = p; });

  const seatsHtml = SEAT_POSITIONS.map((pos, i) => {
    const seatNum = i + 1;
    const player = occupied[seatNum];
    if (player) {
      const isOwner = player.isOwner;
      const initial = player.nickname.charAt(0);
      return `
        <div class="seat ${pos} occupied ${isOwner ? 'owner-seat' : ''}" style="background:${PLAYER_COLORS[(player.id || i) % 4]};color:#fff;border-color:${isOwner ? '#d4a574' : 'transparent'}">
          ${isOwner ? '<span class="crown">👑</span>' : ''}
          ${initial}<span class="seat-label">${player.nickname.length > 2 ? player.nickname.slice(0,2)+'..' : player.nickname}</span>
        </div>`;
    }
    return `<div class="seat ${pos} vacant" onclick="event.stopPropagation();showJoinModal(${t.id})">+<span class="seat-label">空位</span></div>`;
  });

  const startTimeStr = t.startTime ? new Date(t.startTime).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : null;

  return `
    <div class="table-card" id="table-${t.id}" onclick="showTableDetail(${t.id})" style="animation-delay:${(idx % 6) * 0.06}s">
      <div class="mahjong-table">
        <div class="table-center">
          <div class="table-num">${t.tableNumber}</div>
          <div class="table-base-score">底分 ${t.baseScore}</div>
        </div>
        ${seatsHtml.join('')}
      </div>
      <div class="table-footer">
        <div class="left">
          <span class="status-badge status-${t.status}">${statusMap[t.status] || t.status}</span>
        </div>
        <div class="table-meta">
          ${t.currentPlayers}/${t.maxPlayers}人
          ${startTimeStr ? ' | ' + startTimeStr : ''}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// 牌桌详情弹窗
// ============================================================

function showTableDetail(tableId) {
  const t = currentTables.find(t => t.id === tableId);
  if (!t) return;
  const p = getPlayer();
  const myPlayerId = p ? p.id : null;
  const isOwner = myPlayerId && t.ownerId === myPlayerId;

  const statusMap = { waiting: '等待中', playing: '已成局', finished: '已结束' };

  let bodyHtml = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:24px;font-weight:700;color:var(--green)">${t.tableNumber}</div>
      <div style="font-size:13px;color:var(--gray-400);margin-top:4px">底分 ${t.baseScore} 分</div>
      <span class="status-badge status-${t.status}" style="margin-top:8px;font-size:13px;padding:4px 14px">${statusMap[t.status] || t.status}</span>
    </div>
  `;

  bodyHtml += '<div style="border-top:1px solid var(--cream-dark);padding-top:12px">';
  for (let seat = 1; seat <= 4; seat++) {
    const player = (t.players || []).find(p => p.seatNumber === seat);
    if (player) {
      bodyHtml += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--cream-dark)">
          <div>
            <strong>${player.isOwner ? '👑 ' : ''}${player.nickname}</strong>
            <span style="font-size:12px;color:var(--gray-400);margin-left:8px">${seat}号位</span>
          </div>
          ${myPlayerId === player.id ? `
            <button class="btn btn-sm btn-danger" onclick="closeModal('tableModal');showLeaveConfirm(${t.id},${player.id},'${player.nickname}')">离座</button>
          ` : ''}
        </div>`;
    } else {
      bodyHtml += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--cream-dark)">
          <div style="color:var(--gray-400)">
            空位（${seat}号）
          </div>
          ${t.status === 'waiting' ? `<button class="btn btn-sm btn-primary" onclick="closeModal('tableModal');showJoinModal(${t.id})">加入</button>` : ''}
        </div>`;
    }
  }
  bodyHtml += '</div>';

  // Actions
  bodyHtml += '<div style="margin-top:14px;display:flex;gap:8px">';
  if (isOwner && t.status === 'waiting') {
    bodyHtml += `<button class="btn btn-sm btn-gold" style="flex:1" onclick="closeModal('tableModal');showSettingsModal(${t.id})">⚙️ 设置</button>`;
  }
  bodyHtml += '</div>';

  document.getElementById('tableModalTitle').textContent = t.tableNumber + ' 详情';
  document.getElementById('tableModalBody').innerHTML = bodyHtml;
  showModal('tableModal');
}

// ============================================================
// 加入牌桌
// ============================================================

function showJoinModal(tableId) {
  joinTarget = { tableId };
  selectedSeat = null;

  const t = currentTables.find(t => t.id === tableId);
  const occupied = (t.players || []).map(p => p.seatNumber);
  const p = getPlayer();

  if (!p) {
    toast('请先在「我的」中设置个人信息');
    return;
  }

  const seatHtml = [1, 2, 3, 4].map(n => {
    const taken = occupied.includes(n);
    const cls = taken ? 'taken' : '';
    const label = taken ? `${n}号（已占）` : `${n}号位`;
    return `<div class="seat-option ${cls}" data-seat="${n}" onclick="${taken ? '' : 'selectSeat('+n+')'}">${label}</div>`;
  }).join('');

  document.getElementById('seatGrid').innerHTML = seatHtml;
  document.getElementById('joinBtn').disabled = true;
  document.getElementById('joinBtn').style.opacity = '.5';
  showModal('joinModal');
}

function selectSeat(seatNum) {
  selectedSeat = seatNum;
  document.querySelectorAll('.seat-option').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.seat) === seatNum);
  });
  document.getElementById('joinBtn').disabled = false;
  document.getElementById('joinBtn').style.opacity = '1';
}

async function confirmJoin() {
  if (!joinTarget || !selectedSeat) return toast('请选择座位');
  const p = getPlayer();
  if (!p) return toast('请先设置个人信息');

  const body = { tableId: joinTarget.tableId, playerId: p.id, seatNumber: selectedSeat, hallId: currentHallId };

  try {
    // Always use REST API for critical operations (not dependent on socket identity)
    await api('/api/tables/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    closeModal('joinModal');
    toast('🎉 加入成功');
    // The socket tableUpdate will refresh the UI automatically
  } catch (e) {
    toast(e.message);
  }
}

// ============================================================
// 离开牌桌
// ============================================================

function showLeaveConfirm(tableId, playerId, nickname) {
  leaveTarget = { tableId, playerId };
  document.getElementById('leaveConfirmText').textContent = `${nickname}，确定离开该牌桌吗？`;
  showModal('leaveModal');
}

async function confirmLeave() {
  if (!leaveTarget) return;
  const p = getPlayer();
  const playerId = leaveTarget.playerId || (p ? p.id : null);
  if (!playerId) return toast('请先登录');

  try {
    // Always use REST API for critical operations (not dependent on socket identity)
    await api('/api/tables/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: leaveTarget.tableId, playerId, hallId: currentHallId }),
    });
    closeModal('leaveModal');
    toast('已离开牌桌');
    // The socket tableUpdate will refresh the UI automatically
  } catch (e) {
    toast(e.message);
  }
}

// ============================================================
// 房主设置
// ============================================================

function showSettingsModal(tableId) {
  settingsTarget = { tableId };
  const t = currentTables.find(t => t.id === tableId);
  if (!t) return;

  document.getElementById('settingsBaseScore').value = t.baseScore || 1;
  if (t.startTime) {
    try {
      const d = new Date(t.startTime);
      document.getElementById('settingsStartTime').value = d.toISOString().slice(0, 16);
    } catch { document.getElementById('settingsStartTime').value = ''; }
  } else {
    document.getElementById('settingsStartTime').value = '';
  }
  showModal('settingsModal');
}

async function confirmSettings() {
  if (!settingsTarget) return;
  const p = getPlayer();
  if (!p) return toast('请先设置个人信息');

  const baseScore = parseInt(document.getElementById('settingsBaseScore').value);
  const startTimeRaw = document.getElementById('settingsStartTime').value;
  const startTime = startTimeRaw ? new Date(startTimeRaw).toISOString() : undefined;

  try {
    // 使用 REST API 确保操作可靠
    await api(`/api/tables/${settingsTarget.tableId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: p.id, baseScore, startTime }),
    });
    closeModal('settingsModal');
    toast('设置已更新');
  } catch (e) {
    toast(e.message);
  }
}

// ============================================================
// 撒花庆祝
// ============================================================

function showConfetti() {
  const colors = ['#c41e3a', '#d4a574', '#2d5016', '#f5a623', '#4a90d9', '#e84a5f'];
  const container = document.getElementById('confettiContainer') || document.body;
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.top = '-10px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 6 + 4) + 'px';
    piece.style.height = (Math.random() * 6 + 4) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 3000);
  }
  toast('🎉 已成局！');
}

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  updateAvatarUI();
  loadHalls();
  loadTables();
});
