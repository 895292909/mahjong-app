var api = require('../../utils/api');
var app = getApp();

var STATUS_MAP = { waiting: '等待中', playing: '已成局', finished: '已结束' };
var PLAYER_COLORS = ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'];

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
    currentContactTableId: 0,

    // 查看完整号码
    showRevealModal: false,
    revealTargetName: '',
    revealTargetIdx: -1,

    // 上次牌桌状态快照
    prevPlayingCount: 0,
  },

  pollTimer: null,

  onLoad: function() {
    this.loadHalls();
    var token = app.getOwnerToken();
    if (token) {
      this.data.loggedIn = true;
      this.loadDashboard();
    }
    var savedNotifs = wx.getStorageSync('ownerNotifs') || [];
    this.setData({ notifications: savedNotifs });
    this.updateUnreadCount();
  },

  onShow: function() {
    if (this.data.loggedIn) this.loadDashboard();
  },

  onUnload: function() {
    this.stopPolling();
  },

  // ===== 加载 =====
  loadHalls: function() {
    var that = this;
    api.getHalls().then(function(halls) {
      that.setData({
        hallOptions: halls.map(function(h) { return h.name; }),
        hallIds: halls.map(function(h) { return h.id; }),
        loginHallName: halls.length > 0 ? halls[0].name : '',
      });
    }).catch(function() {});
  },

  loadDashboard: function() {
    var hallId = wx.getStorageSync('ownerHallId');
    var token = app.getOwnerToken();
    if (!hallId || !token) return;
    this.loadStats(hallId, token);
    this.loadTables(hallId);
    this.startPolling(hallId, token);
  },

  loadStats: function(hallId, token) {
    var that = this;
    api.getOwnerStats(hallId, token).then(function(stats) { that.setData({ stats: stats }); }).catch(function() {});
  },

  loadTables: function(hallId) {
    var that = this;
    api.getHallDetail(hallId).then(function(data) {
      var tables = data.tables || [];
      that.data.prevPlayingCount = tables.filter(function(t) { return t.status === 'playing'; }).length;
      that.setData({ tables: tables });
    }).catch(function() {});
  },

  startPolling: function(hallId, token) {
    var that = this;
    this.stopPolling();
    this.pollTimer = setInterval(function() {
      api.getHallDetail(hallId).then(function(data) {
        var tables = data.tables || [];
        var playing = tables.filter(function(t) { return t.status === 'playing'; });
        that.setData({ tables: tables });

        if (playing.length > that.data.prevPlayingCount) {
          that.addNotification({
            tableId: playing[playing.length - 1].id,
            message: playing[playing.length - 1].tableNumber + ' 已成局！',
          });
        }
        that.data.prevPlayingCount = playing.length;

        api.getOwnerStats(hallId, token).then(function(stats) { that.setData({ stats: stats }); }).catch(function() {});
      }).catch(function() {});
    }, 5000);
  },

  stopPolling: function() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  // ===== 登录 =====
  switchLoginTab: function(e) {
    this.setData({ loginTab: e.currentTarget.dataset.tab });
  },

  onHallChange: function(e) {
    var idx = e.detail.value;
    this.setData({ loginHallIdx: idx, loginHallName: this.data.hallOptions[idx] });
  },

  onLoginPassInput: function(e) { this.data.loginPass = e.detail.value; },

  doLogin: function() {
    var that = this;
    var hallId = this.data.hallIds[this.data.loginHallIdx];
    if (!hallId) { wx.showToast({ title: '请选择麻将馆', icon: 'none' }); return; }
    wx.showLoading({ title: '登录中...' });
    api.ownerLogin(hallId, this.data.loginPass)
      .then(function(data) {
        wx.hideLoading();
        app.setOwnerInfo({ token: data.token, hallId: hallId, name: data.name });
        that.setData({ loggedIn: true });
        that.loadDashboard();
      })
      .catch(function(err) { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  // ===== 入驻 =====
  onRegNameInput: function(e) { this.data.regName = e.detail.value; },
  onRegAddrInput: function(e) { this.data.regAddr = e.detail.value; },
  onRegNickInput: function(e) { this.data.regNick = e.detail.value; },
  onRegPhoneInput: function(e) { this.data.regPhone = e.detail.value; },
  onRegWechatInput: function(e) { this.data.regWechat = e.detail.value; },
  onRegPassInput: function(e) { this.data.regPass = e.detail.value; },
  onRegOpenTime: function(e) { this.setData({ regOpenTime: e.detail.value }); },
  onRegCloseTime: function(e) { this.setData({ regCloseTime: e.detail.value }); },

  doRegister: function() {
    var that = this;
    if (!this.data.regName) { wx.showToast({ title: '请输入麻将馆名称', icon: 'none' }); return; }
    if (!this.data.regNick) { wx.showToast({ title: '请输入老板称呼', icon: 'none' }); return; }
    if (!this.data.regPass || this.data.regPass.length < 4) { wx.showToast({ title: '密码至少4位', icon: 'none' }); return; }
    wx.showLoading({ title: '注册中...' });
    api.ownerRegister({
      name: this.data.regName, address: this.data.regAddr,
      openTime: this.data.regOpenTime, closeTime: this.data.regCloseTime,
      nickname: this.data.regNick, phone: this.data.regPhone,
      wechatId: this.data.regWechat, password: this.data.regPass,
    }).then(function(data) {
      wx.hideLoading();
      app.setOwnerInfo({ token: data.token, hallId: data.hallId, name: data.name });
      that.setData({ loggedIn: true });
      wx.showToast({ title: '🎉 入驻成功', icon: 'none' });
      that.loadDashboard();
    }).catch(function(err) { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  // ===== Tab 切换 =====
  switchTab: function(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'logs') this.refreshAuditLogs();
  },

  // ===== 牌桌管理 =====
  addTable: function() {
    var that = this;
    wx.showModal({ title: '确认', content: '确定添加一张新牌桌？', success: function(res) {
      if (!res.confirm) return;
      api.manageTables(wx.getStorageSync('ownerHallId'), 'add', app.getOwnerToken())
        .then(function() { wx.showToast({ title: '已添加', icon: 'none' }); that.loadDashboard(); })
        .catch(function(err) { wx.showToast({ title: err.message, icon: 'none' }); });
    }});
  },

  removeTable: function() {
    var that = this;
    wx.showModal({ title: '确认', content: '删除最后一张空桌？（有人的不会被删除）', success: function(res) {
      if (!res.confirm) return;
      api.manageTables(wx.getStorageSync('ownerHallId'), 'remove', app.getOwnerToken())
        .then(function() { wx.showToast({ title: '已删除', icon: 'none' }); that.loadDashboard(); })
        .catch(function(err) { wx.showToast({ title: err.message, icon: 'none' }); });
    }});
  },

  // ===== 通知系统 =====
  addNotification: function(n) {
    n.id = Date.now() + '_' + Math.random();
    n.read = false;
    n.time = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    var notifs = this.data.notifications;
    notifs.unshift(n);
    this.setData({ notifications: notifs, unreadCount: notifs.filter(function(x) { return !x.read; }).length });
    wx.setStorageSync('ownerNotifs', notifs);
  },

  updateUnreadCount: function() {
    this.setData({ unreadCount: this.data.notifications.filter(function(n) { return !n.read; }).length });
  },

  markRead: function(e) {
    var idx = e.currentTarget.dataset.idx;
    var notifs = this.data.notifications;
    if (notifs[idx]) notifs[idx].read = true;
    this.setData({ notifications: notifs, unreadCount: notifs.filter(function(n) { return !n.read; }).length });
    wx.setStorageSync('ownerNotifs', notifs);
  },

  markAllRead: function() {
    var notifs = this.data.notifications.map(function(n) { return Object.assign({}, n, { read: true }); });
    this.setData({ notifications: notifs, unreadCount: 0 });
    wx.setStorageSync('ownerNotifs', notifs);
  },

  goToTable: function(e) {
    var tableId = e.currentTarget.dataset.tabid;
    this.setData({ activeTab: 'tables' });
  },

  refreshAuditLogs: function() {
    var recent = this.data.notifications.filter(function(n) { return n.read; }).slice(0, 20);
    this.setData({ auditLogs: recent });
  },

  // ===== 联系方式 =====
  showContacts: function(e) {
    var that = this;
    var tableId = parseInt(e.currentTarget.dataset.tableid);
    var token = app.getOwnerToken();
    that.data.currentContactTableId = tableId;
    wx.showLoading({ title: '加载中...' });
    api.getTableContacts(tableId, token)
      .then(function(data) {
        wx.hideLoading();
        var players = (data.players || []).map(function(p) {
          return Object.assign({}, p, {
            maskedPhone: p.phone ? p.phone.slice(0, 3) + '****' + p.phone.slice(7) : '',
            revealed: !!p.canViewFullPhone,
          });
        });
        that.setData({
          showContactModal: true,
          contactTableNumber: data.tableNumber,
          contactPlayers: players,
        });
      })
      .catch(function(err) { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  closeContactModal: function() {
    this.setData({ showContactModal: false, revealTargetIdx: -1 });
  },

  showRevealConfirm: function(e) {
    var idx = e.currentTarget.dataset.idx;
    var player = this.data.contactPlayers[idx];
    if (!player) return;
    this.setData({ showRevealModal: true, revealTargetIdx: idx, revealTargetName: player.nickname });
  },

  cancelReveal: function() {
    this.setData({ showRevealModal: false, revealTargetIdx: -1 });
  },

  confirmReveal: function() {
    var that = this;
    var idx = that.data.revealTargetIdx;
    var player = that.data.contactPlayers[idx];
    if (!player) return;

    api.logContactView({
      playerId: player.id,
      tableId: that.data.currentContactTableId || 0,
      viewType: 'phone',
    }, app.getOwnerToken()).catch(function() {});

    var players = that.data.contactPlayers;
    players[idx].revealed = true;
    that.setData({ contactPlayers: players, showRevealModal: false, revealTargetIdx: -1 });
    wx.showToast({ title: '已显示完整号码（已记录至审计日志）', icon: 'none' });
  },

  copyPhone: function(e) {
    var phone = e.currentTarget.dataset.phone;
    if (!phone) return;
    wx.setClipboardData({
      data: phone,
      success: function() { wx.showToast({ title: '手机号已复制', icon: 'none' }); },
    });
  },
});
