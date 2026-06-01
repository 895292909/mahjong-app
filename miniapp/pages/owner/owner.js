const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    loggedIn: false,
    loginTab: 'login',

    // 登录
    hallOptions: [],
    hallIds: [],
    loginHallIdx: 0,
    loginHallName: '',
    loginPass: '',

    // 入驻
    regName: '',
    regAddr: '',
    regNick: '',
    regPhone: '',
    regPass: '',

    // 管理面板
    stats: { total_tables: 0, waiting_tables: 0, playing_tables: 0, finished_tables: 0 },
    tables: [],
    statusMap: { waiting: '等待中', playing: '已成局', finished: '已结束' },
    playerColors: ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'],

    // 联系方式
    showContactModal: false,
    contactTableNumber: '',
    contactPlayers: [],
  },

  onLoad() {
    this.loadHalls();
    const token = app.getOwnerToken();
    if (token) {
      this.data.loggedIn = true;
      this.loadDashboard();
    }
  },

  onShow() {
    if (this.data.loggedIn) this.loadDashboard();
  },

  // ===== 加载麻将馆列表 =====
  loadHalls() {
    api.getHalls().then(halls => {
      this.setData({
        hallOptions: halls.map(h => h.name),
        hallIds: halls.map(h => h.id),
        loginHallName: halls.length > 0 ? halls[0].name : '',
      });
    }).catch(() => {});
  },

  // ===== 登录 =====
  switchLoginTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ loginTab: tab });
  },
  onHallChange(e) {
    const idx = e.detail.value;
    this.setData({
      loginHallIdx: idx,
      loginHallName: this.data.hallOptions[idx],
    });
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
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  // ===== 入驻 =====
  onRegNameInput(e) { this.data.regName = e.detail.value; },
  onRegAddrInput(e) { this.data.regAddr = e.detail.value; },
  onRegNickInput(e) { this.data.regNick = e.detail.value; },
  onRegPhoneInput(e) { this.data.regPhone = e.detail.value; },
  onRegPassInput(e) { this.data.regPass = e.detail.value; },
  doRegister() {
    if (!this.data.regName) { wx.showToast({ title: '请输入麻将馆名称', icon: 'none' }); return; }
    if (!this.data.regNick) { wx.showToast({ title: '请输入老板称呼', icon: 'none' }); return; }
    if (!this.data.regPass || this.data.regPass.length < 4) { wx.showToast({ title: '密码至少4位', icon: 'none' }); return; }
    wx.showLoading({ title: '注册中...' });
    api.ownerRegister({
      name: this.data.regName,
      address: this.data.regAddr,
      nickname: this.data.regNick,
      phone: this.data.regPhone,
      password: this.data.regPass,
    }).then(data => {
      wx.hideLoading();
      app.setOwnerInfo({ token: data.token, hallId: data.hallId, name: data.name });
      this.setData({ loggedIn: true });
      wx.showToast({ title: '🎉 入驻成功', icon: 'none' });
      this.loadDashboard();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: err.message, icon: 'none' });
    });
  },

  // ===== 管理面板 =====
  loadDashboard() {
    const hallId = wx.getStorageSync('ownerHallId');
    const token = app.getOwnerToken();
    if (!hallId || !token) return;
    this.loadStats(hallId, token);
    this.loadTables(hallId);
  },

  loadStats(hallId, token) {
    api.getOwnerStats(hallId, token).then(stats => this.setData({ stats })).catch(() => {});
  },

  loadTables(hallId) {
    api.getHallDetail(hallId).then(data => {
      this.setData({ tables: data.tables || [] });
    }).catch(() => {});
  },

  addTable() {
    wx.showModal({ title: '确认', content: '确定添加一张新牌桌？', success: (res) => {
      if (!res.confirm) return;
      const hallId = wx.getStorageSync('ownerHallId');
      api.manageTables(hallId, 'add', app.getOwnerToken())
        .then(() => {
          wx.showToast({ title: '已添加', icon: 'none' });
          this.loadDashboard();
        })
        .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
    }});
  },

  removeTable() {
    wx.showModal({ title: '确认', content: '删除最后一张空桌？（有人的不会被删除）', success: (res) => {
      if (!res.confirm) return;
      const hallId = wx.getStorageSync('ownerHallId');
      api.manageTables(hallId, 'remove', app.getOwnerToken())
        .then(() => {
          wx.showToast({ title: '已删除', icon: 'none' });
          this.loadDashboard();
        })
        .catch(err => wx.showToast({ title: err.message, icon: 'none' }));
    }});
  },

  showContacts(e) {
    const tableId = e.currentTarget.dataset.tableid;
    const token = app.getOwnerToken();
    wx.showLoading({ title: '加载中...' });
    api.getTableContacts(tableId, token)
      .then(data => {
        wx.hideLoading();
        this.setData({
          showContactModal: true,
          contactTableNumber: data.tableNumber,
          contactPlayers: data.players || [],
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },
  closeContactModal() {
    this.setData({ showContactModal: false });
  },
});
