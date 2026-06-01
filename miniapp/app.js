const AGREEMENT_TEXT =
`尊敬的用户，欢迎使用麻将排桌小程序。在您开始使用前，请仔细阅读以下条款：

1. 信息收集
在使用本小程序时，我们可能会收集您的微信昵称、头像、手机号及微信号等信息，用于牌桌排位和玩家间的必要联系。

2. 信息使用
您的联系方式仅在以下场景中使用：
- 同局玩家通过牌桌信息查看
- 麻将馆老板查看已成局牌桌的联系方式
- 所有查看操作均记录审计日志

3. 信息保护
您的手机号将经过加密存储，确保数据安全。

4. 隐私选择
您可以在"我的"页面中设置联系方式可见性：
- 同局玩家可见（默认）
- 所有人可见
- 所有人不可见

5. 联系我们
如有疑问，请联系麻将馆管理人员。`;

App({
  globalData: {
    player: null,
    currentHallId: null,
    pollTimer: null,
    wechatOpenid: null,
  },

  onLaunch() {
    // 不再自动弹协议，移到点击微信登录时
  },

  // 返回 Promise 的用户协议
  showAgreement() {
    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '用户协议',
        content: AGREEMENT_TEXT,
        confirmText: '同意',
        cancelText: '退出',
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('agreed', true);
            resolve(true);
          } else {
            wx.showToast({ title: '需要同意协议才能使用', icon: 'none' });
            reject(new Error('用户未同意协议'));
          }
        },
        fail: reject,
      });
    });
  },

  // 生成随机昵称
  generateNickname() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return '玩家' + suffix;
  },

  getPlayer() {
    if (this.globalData.player) return this.globalData.player;
    const p = wx.getStorageSync('mahjongPlayer');
    if (p) this.globalData.player = p;
    return p || null;
  },

  setPlayer(data) {
    this.globalData.player = data;
    wx.setStorageSync('mahjongPlayer', data);
  },

  getOwnerToken() {
    return wx.getStorageSync('ownerToken') || null;
  },

  setOwnerInfo({ token, hallId, name }) {
    wx.setStorageSync('ownerToken', token);
    wx.setStorageSync('ownerHallId', hallId);
    wx.setStorageSync('ownerName', name);
  },

  clearOwnerInfo() {
    wx.removeStorageSync('ownerToken');
    wx.removeStorageSync('ownerHallId');
    wx.removeStorageSync('ownerName');
  },
});
