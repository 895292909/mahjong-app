const api = require('../../utils/api');
const app = getApp();

const COLORS = ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'];
const STATUS_MAP = { waiting: '等待中', playing: '已成局', finished: '已结束' };

Page({
  data: {
    hallId: null,
    hallName: '',
    tables: [],
    loading: true,
    onlineCount: 0,
    statusMap: STATUS_MAP,

    // 座位选取弹窗
    showSeatModal: false,
    selectedSeat: null,
    seatTaken: {},

    // 详情弹窗
    showDetailModal: false,
    detailTable: null,
    detailSeats: [],
    isOwner: false,

    // 设置弹窗
    showSettingsModal: false,
    settingsScore: 0,
    settingsScoreValue: '1',
    scoreOptions: ['1', '2', '5', '10', '20'],

    // 离座确认
    showLeaveConfirm: false,
  },

  // 内部状态
  joinTarget: null,
  leaveTarget: null,
  pollTimer: null,

  onLoad(options) {
    const hallId = parseInt(options.hallId);
    this.data.hallId = hallId;
    this.loadData();
    this.startPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.pollTimer = setInterval(() => {
      this.loadTablesSilent();
    }, 5000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  loadData() {
    this.setData({ loading: true });
    api.getHallDetail(this.data.hallId)
      .then(data => {
        this.data.hallName = data.name;
        const tables = this.buildTables(data.tables || []);
        this.setData({
          hallName: data.name,
          tables,
          loading: false,
        });
      })
      .catch(err => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  loadTablesSilent() {
    api.getHallDetail(this.data.hallId)
      .then(data => {
        const tables = this.buildTables(data.tables || []);
        this.setData({ tables });
      })
      .catch(() => {});
  },

  buildTables(tables) {
    return tables.map(t => {
      const seats = [{}, {}, {}, {}];
      const occupied = {};
      (t.players || []).forEach(p => {
        occupied[p.seatNumber] = p;
      });
      for (let i = 0; i < 4; i++) {
        const pos = ['top', 'right', 'bottom', 'left'][i];
        const p = occupied[i + 1];
        if (p) {
          seats[i] = {
            taken: true,
            pos,
            cls: 'occupied',
            initial: p.nickname.charAt(0),
            color: COLORS[(p.id || i) % 4],
            owner: p.isOwner,
          };
        } else {
          seats[i] = { taken: false, pos, cls: 'vacant', color: 'var(--cream)', owner: false };
        }
      }
      const startStr = t.startTime ? t.startTime.slice(5, 16) : '';
      return { ...t, seats, startTime: startStr };
    });
  },

  // 点击座位 → 直接加入
  tapSeat(e) {
    const tableId = e.currentTarget.dataset.tableid;
    const seat = e.currentTarget.dataset.seat;
    const player = app.getPlayer();
    if (!player) {
      wx.showModal({ title: '提示', content: '请先在「我的」设置个人信息', success: () => {
        wx.navigateTo({ url: '/pages/profile/profile' });
      }});
      return;
    }
    // 检查该桌该座位是否已被占
    const table = this.data.tables.find(t => t.id === tableId);
    if (!table) return;
    const p = (table.players || []).find(p => p.seatNumber === seat);
    if (p) {
      wx.showToast({ title: '该座位已被占用', icon: 'none' });
      return;
    }
    // 显示加入确认
    this.data.joinTarget = { tableId, seatNumber: seat };
    this.joinTable();
  },

  // 显示详情
  showTableDetail(e) {
    const tableId = e.currentTarget.dataset.id;
    const t = this.data.tables.find(t => t.id === tableId);
    if (!t) return;
    const player = app.getPlayer();
    const myId = player ? player.id : null;
    const seats = [1, 2, 3, 4].map(n => {
      const p = (t.players || []).find(p => p.seatNumber === n);
      return {
        seat: n,
        taken: !!p,
        nickname: p ? p.nickname : '',
        isOwner: p ? p.isOwner : false,
        isMe: p && p.id === myId,
        id: p ? p.id : null,
      };
    });
    this.setData({
      showDetailModal: true,
      detailTable: t,
      detailSeats: seats,
      isOwner: myId && t.ownerId === myId,
    });
  },

  closeDetailModal() {
    this.setData({ showDetailModal: false });
  },

  quickJoin(e) {
    const seat = parseInt(e.currentTarget.dataset.seat);
    const player = app.getPlayer();
    if (!player) { wx.showToast({ title: '请先设置个人信息', icon: 'none' }); return; }
    this.data.joinTarget = { tableId: this.data.detailTable.id, seatNumber: seat };
    this.setData({ showDetailModal: false });
    this.joinTable();
  },

  // 加入
  joinTable() {
    const target = this.data.joinTarget;
    if (!target) return;
    const player = app.getPlayer();
    if (!player) { wx.showToast({ title: '请先设置个人信息', icon: 'none' }); return; }

    wx.showLoading({ title: '加入中...' });
    api.joinTable(target.tableId, player.id, target.seatNumber)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '🎉 加入成功', icon: 'none' });
        this.setData({ showSeatModal: false });
        this.loadTablesSilent();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  // 离座
  confirmLeave() {
    const player = app.getPlayer();
    if (!player) return;
    this.data.leaveTarget = { tableId: this.data.detailTable.id, playerId: player.id };
    this.setData({ showLeaveConfirm: true, showDetailModal: false });
  },
  closeLeaveConfirm() {
    this.setData({ showLeaveConfirm: false });
  },
  doLeave() {
    const target = this.data.leaveTarget;
    if (!target) return;
    wx.showLoading({ title: '离座中...' });
    api.leaveTable(target.tableId, target.playerId)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已离座', icon: 'none' });
        this.setData({ showLeaveConfirm: false });
        this.loadTablesSilent();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  // 设置
  showSettings() {
    const t = this.data.detailTable;
    const idx = ['1', '2', '5', '10', '20'].indexOf(String(t.baseScore));
    this.setData({
      showSettingsModal: true,
      settingsScore: idx >= 0 ? idx : 0,
      settingsScoreValue: this.data.scoreOptions[idx >= 0 ? idx : 0],
    });
  },
  closeSettingsModal() {
    this.setData({ showSettingsModal: false });
  },
  onScoreChange(e) {
    const val = this.data.scoreOptions[e.detail.value];
    this.setData({ settingsScore: e.detail.value, settingsScoreValue: val });
  },
  saveSettings() {
    const player = app.getPlayer();
    if (!player) return;
    const tableId = this.data.detailTable.id;
    const baseScore = parseInt(this.data.settingsScoreValue);
    wx.showLoading({ title: '保存中...' });
    api.updateTableSettings(tableId, { playerId: player.id, baseScore })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '设置已更新', icon: 'none' });
        this.setData({ showSettingsModal: false });
        this.loadTablesSilent();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  // 通用弹窗
  showModal() { this.setData({ showSeatModal: true }); },
  closeModal() { this.setData({ showSeatModal: false, selectedSeat: null }); },
});
