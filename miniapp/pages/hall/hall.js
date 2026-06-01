const api = require('../../utils/api');
const app = getApp();

const COLORS = ['#e84a5f', '#4a90d9', '#f5a623', '#7ed321'];
const STATUS_MAP = { waiting: '等待中', playing: '已成局', finished: '已结束' };

let prevPlayingCount = 0;

Page({
  data: {
    hallId: null,
    hallName: '',
    tables: [],
    loading: true,
    onlineCount: 0,
    statusMap: STATUS_MAP,

    showSeatModal: false,
    selectedSeat: null,
    seatTaken: {},

    showDetailModal: false,
    detailTable: null,
    detailSeats: [],
    isOwner: false,

    showSettingsModal: false,
    settingsScore: 0,
    settingsScoreValue: '1',
    settingsStartTime: '',
    scoreOptions: ['1', '2', '5', '10', '20'],

    showLeaveConfirm: false,
  },

  joinTarget: null,
  leaveTarget: null,
  pollTimer: null,
  previousTables: [],

  onLoad(options) {
    const hallId = parseInt(options.hallId);
    this.data.hallId = hallId;
    prevPlayingCount = 0;
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
        prevPlayingCount = tables.filter(t => t.status === 'playing').length;
        this.previousTables = tables;
        this.setData({
          hallName: data.name,
          tables,
          loading: false,
          onlineCount: data.emptyTables, // 用空桌数替代在线人数
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
        const playing = tables.filter(t => t.status === 'playing');

        // 检测新成局 → 撒花
        if (playing.length > prevPlayingCount) {
          this.showConfetti();
        }
        prevPlayingCount = playing.length;

        this.setData({ tables, onlineCount: data.emptyTables });
      })
      .catch(() => {});
  },

  buildTables(tables) {
    return tables.map(t => {
      const seats = [{}, {}, {}, {}];
      const occupied = {};
      (t.players || []).forEach(p => { occupied[p.seatNumber] = p; });
      for (let i = 0; i < 4; i++) {
        const pos = ['top', 'right', 'bottom', 'left'][i];
        const p = occupied[i + 1];
        if (p) {
          seats[i] = {
            taken: true, pos,
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

  // ===== 撒花 =====
  showConfetti() {
    wx.showToast({ title: '🎉 已成局！', icon: 'none' });
  },

  // ===== 点击座位 =====
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
    const table = this.data.tables.find(t => t.id === tableId);
    if (!table) return;
    const p = (table.players || []).find(p => p.seatNumber === seat);
    if (p) { wx.showToast({ title: '该座位已被占用', icon: 'none' }); return; }
    this.data.joinTarget = { tableId, seatNumber: seat };
    this.joinTable();
  },

  // ===== 详情弹窗 =====
  showTableDetail(e) {
    const tableId = e.currentTarget.dataset.id;
    const t = this.data.tables.find(t => t.id === tableId);
    if (!t) return;
    const player = app.getPlayer();
    const myId = player ? player.id : null;
    const seats = [1, 2, 3, 4].map(n => {
      const p = (t.players || []).find(p => p.seatNumber === n);
      return {
        seat: n, taken: !!p, nickname: p ? p.nickname : '',
        isOwner: p ? p.isOwner : false, isMe: p && p.id === myId, id: p ? p.id : null,
      };
    });
    this.setData({
      showDetailModal: true,
      detailTable: t,
      detailSeats: seats,
      isOwner: myId && t.ownerId === myId,
    });
  },

  closeDetailModal() { this.setData({ showDetailModal: false }); },

  quickJoin(e) {
    const seat = parseInt(e.currentTarget.dataset.seat);
    const player = app.getPlayer();
    if (!player) { wx.showToast({ title: '请先设置个人信息', icon: 'none' }); return; }
    this.data.joinTarget = { tableId: this.data.detailTable.id, seatNumber: seat };
    this.setData({ showDetailModal: false });
    this.joinTable();
  },

  // ===== 加入 =====
  joinTable() {
    const target = this.data.joinTarget;
    if (!target) return;
    const player = app.getPlayer();
    if (!player) { wx.showToast({ title: '请先在「我的」设置个人信息', icon: 'none' }); return; }
    if (!player.id || player.id === 0) {
      wx.showModal({ title: '无法加入', content: '请先在「我的」页面保存个人信息，然后再加入牌桌', showCancel: false });
      return;
    }
    console.log('[joinTable] table:', target.tableId, 'player:', player.id, 'seat:', target.seatNumber);
    wx.showLoading({ title: "加入中..." });
    api.joinTable(target.tableId, player.id, target.seatNumber, this.data.hallId)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '🎉 加入成功', icon: 'none' });
        this.setData({ showSeatModal: false });
        this.loadTablesSilent();
      })
      .catch(err => { wx.hideLoading(); wx.showModal({ title: '加入失败', content: err.message, showCancel: false }); });
  },

  // ===== 离座 =====
  confirmLeave() {
    const player = app.getPlayer();
    if (!player) return;
    this.data.leaveTarget = { tableId: this.data.detailTable.id, playerId: player.id };
    this.setData({ showLeaveConfirm: true, showDetailModal: false });
  },
  closeLeaveConfirm() { this.setData({ showLeaveConfirm: false }); },
  doLeave() {
    const target = this.data.leaveTarget;
    if (!target) return;
    wx.showLoading({ title: '离座中...' });
    api.leaveTable(target.tableId, target.playerId, this.data.hallId)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已离座', icon: 'none' });
        this.setData({ showLeaveConfirm: false });
        this.loadTablesSilent();
      })
      .catch(err => { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  // ===== 设置 =====
  showSettings() {
    const t = this.data.detailTable;
    const idx = ['1', '2', '5', '10', '20'].indexOf(String(t.baseScore));
    this.setData({
      showSettingsModal: true,
      settingsScore: idx >= 0 ? idx : 0,
      settingsScoreValue: this.data.scoreOptions[idx >= 0 ? idx : 0],
      settingsStartTime: '',
    });
  },
  closeSettingsModal() { this.setData({ showSettingsModal: false }); },
  onScoreChange(e) {
    const val = this.data.scoreOptions[e.detail.value];
    this.setData({ settingsScore: e.detail.value, settingsScoreValue: val });
  },
  onStartTimeChange(e) {
    this.setData({ settingsStartTime: e.detail.value });
  },
  saveSettings() {
    const player = app.getPlayer();
    if (!player) return;
    const tableId = this.data.detailTable.id;
    const baseScore = parseInt(this.data.settingsScoreValue);
    const body = { playerId: player.id, baseScore };
    if (this.data.settingsStartTime) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      body.startTime = dateStr + 'T' + this.data.settingsStartTime + ':00';
    }
    wx.showLoading({ title: '保存中...' });
    api.updateTableSettings(tableId, body)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '设置已更新', icon: 'none' });
        this.setData({ showSettingsModal: false });
        this.loadTablesSilent();
      })
      .catch(err => { wx.hideLoading(); wx.showToast({ title: err.message, icon: 'none' }); });
  },

  // ===== 弹窗 =====
  showModal() { this.setData({ showSeatModal: true }); },
  closeModal() { this.setData({ showSeatModal: false, selectedSeat: null }); },
});
