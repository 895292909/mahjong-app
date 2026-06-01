const api = require('../../utils/api');
const app = getApp();

const STATUS_MAP = { waiting: '等待中', playing: '已成局', finished: '已结束' };
const PLAYER_COLORS = ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'];

Page({
  data: {
    loggedIn: false,
    loginTab: 'login',
    activeTab: 'tables',

    // 登录
    hallOptions: [], hallIds: [], loginHallIdx: 0, loginHallName: '', loginPass: '',

    // 入驻
    regName: '', regAddr: '', regNick: '', regPhone: '', regWechat: '', regPass: '',
    regOpenTime: '09:00', regCloseTime: '02:00',

    // 管理面板
    stats: { total_tables: 0, waiting_tables: 0, playing_tables: 0, finished_tables: 0 },
    tables: [],
    statusMap: STATUS_MAP,
    playerColors: PLAYER_COLORS,

    // 通知
    notifications: [],
    unreadCount: 0,

    // 审计日志
    auditLogs: [],

    // 联系方式
    showContactModal: false,
    contactTableNumber: '',
    contactPlayers: [],

    // 查看完整号码
    showRevealModal: false,
    revealTargetName: '',
    revealTargetIdx: -1,

    // 上次牌桌状态快照
    prevPlayingCount: 0,
  },

  pollTimer: null,

  onLoad() {
    this.loadHalls();
    const token = app.getOwnerToken();
    if (token) {
      this.data.loggedIn = true;
      this.loadDashboard();
    }
    const savedNotifs = wx.getStorageSync('ownerNotifs') || [];
    this.setData({ notifications: savedNotifs });
    this.updateUnreadCount();
  },

  onShow() {
    if (this.data.loggedIn) this.loadDashboard();
  },

  onUnload() {
    this.stopPolling();
  },

  // ===== 加载 =====
  loadHalls() {
    api.getHalls().then(halls => {
      this.setData({
        hallOptions: halls.map(h => h.name),
        hallIds: halls.map(h => h.id),
        loginHallName: halls.length > 0 ? halls[0].name : '',
      });
    }).catch(() => {});
  },

  loadDashboard() {
    const hallId = wx.getStorageSync('ownerHallId');
    const token = app.getOwnerToken();
    if (!hallId || !token) return;
    this.loadStats(hallId, token);
    this.loadTables(hallId);
    this.startPolling(hallId, token);
  },

  loadStats(hallId, token) {
    api.getOwnerStats(hallId, token).then(stats => this.setData({ stats })).catch(() => {});
  },

  loadTables(hallId) {
    api.getHallDetail(hallId).then(data => {
      const tables = data.tables || [];
      this.data.prevPlayingCount = tables.filter(t => t.status === 'playing').length;
      this.setData({ tables });
    }).catch(() => {});
  },

  startPolling(hallId, token) {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      api.getHallDetail(hallId).then(data => {
        const tables = data.tables || [];
        const playing = tables.filter(t => t.status === 'playing');
        this.setData({ tables });

        if (playing.length > this.data.prevPlayingCount) {
          const newOne = playing[playing.length - 1];
          this.addNotification({
            tableId: newOne.id,
            message: `${newOne.tableNumber} 已成局！`,
          });
        }
        this.data.prevPlayingCount = playing.length;

        api.getOwnerStats(hallId, token).then(stats => this.setData({ stats })).catch(() => {});
      }).catch(() => {});
    }, 5000);
  },

  stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  // ===== 登录 =====
  switchLoginTab(e) {
    this.setData({ loginTab: e.currentTarget.dataset.tab });
  },

  onHallChange(e) {
    const idx = e.detail.value;
    this.setData({ loginHallIdx: idx, loginHallName: this.data.hallOptions[idx] });
  },

  onLoginPassInput(e) { this.data.loginPass = e.detail.value; },

  doLogin() {
    const hallId = this.data.hallIds[this.data.loginHallIdx];
    if (!hallId) { wx.showToast({ title: '请选择麻将馆', icon: 'none' }); return; }
    wx.showLoading({ title: '登录中...' });
    api.ownerLogin(hallId, this.data.loginPass)
      .then(data => {
        wx.hideLoading();
        app.setOwnerInfo({ token: data.token, hallId, name: data.name });
        this.setData({ loggedIn: true });
        this.loadDashboard();
      })
      .catch(err => { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  // ===== 入驻 =====
  onRegNameInput(e) { this.data.regName = e.detail.value; },
  onRegAddrInput(e) { this.data.regAddr = e.detail.value; },
  onRegNickInput(e) { this.data.regNick = e.detail.value; },
  onRegPhoneInput(e) { this.data.regPhone = e.detail.value; },
  onRegWechatInput(e) { this.data.regWechat = e.detail.value; },
  onRegPassInput(e) { this.data.regPass = e.detail.value; },
  onRegOpenTime(e) { this.setData({ regOpenTime: e.detail.value }); },
  onRegCloseTime(e) { this.setData({ regCloseTime: e.detail.value }); },

  doRegister() {
    if (!this.data.regName) { wx.showToast({ title: '请输入麻将馆名称', icon: 'none' }); return; }
    if (!this.data.regNick) { wx.showToast({ title: '请输入老板称呼', icon: 'none' }); return; }
    if (!this.data.regPass || this.data.regPass.length < 4) { wx.showToast({ title: '密码至少4位', icon: 'none' }); return; }
    wx.showLoading({ title: '注册中...' });
    api.ownerRegister({
      name: this.data.regName, address: this.data.regAddr,
      openTime: this.data.regOpenTime, closeTime: this.data.regCloseTime,
      nickname: this.data.regNick, phone: this.data.regPhone,
      wechatId: this.data.regWechat, password: this.data.regPass,
    }).then(data => {
      wx.hideLoading();
      app.setOwnerInfo({ token: data.token, hallId: data.hallId, name: data.name });
      this.setData({ loggedIn: true });
      wx.showToast({ title: '🎉 入驻成功', icon: 'none' });
      this.loadDashboard();
    }).catch(err => { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  // ===== Tab 切换 =====
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'logs') this.refreshAuditLogs();
  },

  // ===== 牌桌管理 =====
  addTable() {
    wx.showModal({ title: '确认', content: '确定添加一张新牌桌？', success: (res) => {
      if (!res.confirm) return;
      api.manageTables(wx.getStorageSync('ownerHallId'), 'add', app.getOwnerToken())
        .then(() => { wx.showToast({ title: '已添加', icon: 'none' }); this.loadDashboard(); })
        .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
    }});
  },

  removeTable() {
    wx.showModal({ title: '确认', content: '删除最后一张空桌？（有人的不会被删除）', success: (res) => {
      if (!res.confirm) return;
      api.manageTables(wx.getStorageSync('ownerHallId'), 'remove', app.getOwnerToken())
        .then(() => { wx.showToast({ title: '已删除', icon: 'none' }); this.loadDashboard(); })
        .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
    }});
  },

  // ===== 通知系统 =====
  addNotification(n) {
    n.id = Date.now() + '_' + Math.random();
    n.read = false;
    n.time = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const notifs = this.data.notifications;
    notifs.unshift(n);
    this.setData({ notifications: notifs, unreadCount: notifs.filter(x => !x.read).length });
    wx.setStorageSync('ownerNotifs', notifs);
  },

  updateUnreadCount() {
    this.setData({ unreadCount: this.data.notifications.filter(n => !n.read).length });
  },

  markRead(e) {
    const idx = e.currentTarget.dataset.idx;
    const notifs = this.data.notifications;
    if (notifs[idx]) notifs[idx].read = true;
    this.setData({ notifications: notifs, unreadCount: notifs.filter(n => !n.read).length });
    wx.setStorageSync('ownerNotifs', notifs);
  },

  markAllRead() {
    const notifs = this.data.notifications.map(n => ({ ...n, read: true }));
    this.setData({ notifications: notifs, unreadCount: 0 });
    wx.setStorageSync('ownerNotifs', notifs);
  },

  goToTable(e) {
    const tableId = e.currentTarget.dataset.tabid;
    this.setData({ activeTab: 'tables' });
    setTimeout(() => {
      if (wx.pageScrollTo) wx.pageScrollTo({ selector: '#mon-' + tableId });
    }, 200);
  },

  refreshAuditLogs() {
    const recent = this.data.notifications.filter(n => n.read).slice(0, 20);
    this.setData({ auditLogs: recent });
  },

  // ===== 联系方式 =====
  showContacts(e) {
    const tableId = e.currentTarget.dataset.tableid;
    const token = app.getOwnerToken();
    wx.showLoading({ title: '加载中...' });
    api.getTableContacts(tableId, token)
      .then(data => {
        wx.hideLoading();
        const players = (data.players || []).map(p => ({
          ...p,
          maskedPhone: p.phone ? p.phone.slice(0, 3) + '****' + p.phone.slice(7) : '',
          revealed: !!p.canViewFullPhone,
        }));
        this.setData({
          showContactModal: true,
          contactTableNumber: data.tableNumber,
          contactPlayers: players,
        });
      })
      .catch(err => { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  closeContactModal() {
    this.setData({ showContactModal: false, revealTargetIdx: -1 });
  },

  showRevealConfirm(e) {
    const idx = e.currentTarget.dataset.idx;
    const player = this.data.contactPlayers[idx];
    if (!player) return;
    this.setData({ showRevealModal: true, revealTargetIdx: idx, revealTargetName: player.nickname });
  },

  cancelReveal() {
    this.setData({ showRevealModal: false, revealTargetIdx: -1 });
  },

  async confirmReveal() {
    const idx = this.data.revealTargetIdx;
    const player = this.data.contactPlayers[idx];
    if (!player) return;

    try {
      await api.logContactView({
        playerId: player.id,
        tableId: 0,
        viewType: 'phone',
      }, app.getOwnerToken());
    } catch {}

    const players = this.data.contactPlayers;
    players[idx].revealed = true;
    this.setData({ contactPlayers: players, showRevealModal: false, revealTargetIdx: -1 });
    wx.showToast({ title: '已显示完整号码（已记录至审计日志）', icon: 'none' });
  },

  copyPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (!phone) return;
    wx.setClipboardData({
      data: phone,
      success: () => wx.showToast({ title: '手机号已复制', icon: 'none' }),
    });
  },
});
