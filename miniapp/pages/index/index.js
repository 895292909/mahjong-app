const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    halls: [],
    loading: true,
    player: null,
    playerName: '?',
  },

  onLoad() {
    this.loadHalls();
  },

  onShow() {
    const player = app.getPlayer();
    this.setData({
      player,
      playerName: player ? player.nickname.charAt(0) : '?',
    });
  },

  loadHalls() {
    this.setData({ loading: true });
    api.getHalls()
      .then(halls => this.setData({ halls, loading: false }))
      .catch(err => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },

  goHall(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/hall/hall?hallId=' + id });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },
});
