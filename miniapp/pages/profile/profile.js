const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    wechatLogged: false,
    wechatNickname: '',
    wechatPhone: '',
    wechatOpenid: '',

    formNickname: '',
    formPhone: '',
    formWechat: '',
    privacyOptions: [
      { name: '同局玩家可见', value: 'game_only' },
      { name: '所有人可见', value: 'always' },
      { name: '所有人不可见', value: 'never' },
    ],
    privacyIdx: 0,
    privacyText: '同局玩家可见',

    hasOwner: false,
    ownerName: '',
  },

  phoneCode: '',

  onLoad() {
    const player = app.getPlayer();
    const openid = wx.getStorageSync('wechatOpenid');
    if (openid) {
      app.globalData.wechatOpenid = openid;
      this.setData({
        wechatLogged: true,
        wechatOpenid: openid,
        wechatNickname: player?.nickname || '',
        wechatPhone: player?.phone || '',
      });
    }
    if (player) this.loadPlayer(player);
    this.checkOwner();
    this.refreshPhoneCode();
  },

  refreshPhoneCode() {
    wx.login({ success: (res) => { this.phoneCode = res.code; } });
  },

  onShow() {
    const player = app.getPlayer();
    if (player) this.loadPlayer(player);
  },

  loadPlayer(player) {
    this.setData({
      formNickname: player.nickname,
      formPhone: player.phone || '',
      formWechat: player.wechatId || '',
      privacyIdx: this.getPrivacyIdx(player.privacySetting || 'game_only'),
      privacyText: this.getPrivacyText(player.privacySetting || 'game_only'),
    });
  },

  getPrivacyText(val) {
    const opt = this.data.privacyOptions.find(o => o.value === val);
    return opt ? opt.name : '同局玩家可见';
  },

  getPrivacyIdx(val) {
    const idx = this.data.privacyOptions.findIndex(o => o.value === val);
    return idx >= 0 ? idx : 0;
  },

  checkOwner() {
    const name = wx.getStorageSync('ownerName');
    if (name) this.setData({ hasOwner: true, ownerName: name });
  },

  // ===== 微信登录 =====
  wechatLoginBtn() {
    const agreed = wx.getStorageSync('agreed');
    if (!agreed) {
      app.showAgreement().then(() => this.doWechatLogin()).catch(() => {});
    } else {
      this.doWechatLogin();
    }
  },

  doWechatLogin() {
    wx.showLoading({ title: '登录中...' });
    wx.login({
      success: (loginRes) => {
        api.wechatLogin(loginRes.code).then(data => {
          const openid = data.openid;
          const existing = app.getPlayer();
          const nickname = existing?.nickname || app.generateNickname();
          api.wechatBindUser({ openid, nickname, avatarUrl: '' }).then(bindRes => {
            wx.setStorageSync('wechatOpenid', openid);
            app.globalData.wechatOpenid = openid;
            if (!existing) {
              app.setPlayer({ id: bindRes.id, nickname: bindRes.nickname, openid });
              this.setData({ formNickname: bindRes.nickname, wechatNickname: bindRes.nickname });
            }
            wx.hideLoading();
            this.setData({ wechatLogged: true, wechatOpenid: openid });
            wx.showToast({ title: '微信登录成功', icon: 'none' });
          }).catch(err => { wx.hideLoading(); wx.showModal({ title: '登录失败', content: err.message, showCancel: false }); });
        }).catch(err => { wx.hideLoading(); wx.showModal({ title: '登录失败', content: err.message, showCancel: false }); });
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '微信登录失败', icon: 'none' }); },
    });
  },

  // ===== 获取手机号 =====
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showModal({ title: '授权失败', content: e.detail.errMsg, showCancel: false });
      return;
    }
    const openid = this.data.wechatOpenid || app.globalData.wechatOpenid;
    if (!openid) { wx.showToast({ title: '请先微信登录', icon: 'none' }); return; }
    wx.showLoading({ title: '获取中...' });
    const body = { openid };
    if (e.detail.code) {
      body.phoneCode = e.detail.code;
    } else if (e.detail.encryptedData) {
      body.encryptedData = e.detail.encryptedData;
      body.iv = e.detail.iv;
      body.code = this.phoneCode;
    } else {
      wx.hideLoading();
      wx.showModal({ title: '获取失败', content: '微信版本不支持获取手机号，请手动输入', showCancel: false });
      return;
    }
    api.wechatBindPhone(body).then(data => {
      wx.hideLoading();
      wx.showModal({
        title: '手机号确认',
        content: '是否使用 ' + data.phone + ' 作为您的手机号？',
        confirmText: '确定', cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({ formPhone: data.phone, wechatPhone: data.phone });
            wx.showToast({ title: '手机号已绑定', icon: 'none' });
          }
        },
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showModal({ title: '获取失败', content: err.message, showCancel: false });
    });
  },

  // ===== 表单 =====
  onNicknameInput(e) { this.data.formNickname = e.detail.value; },
  onPhoneInput(e) { this.data.formPhone = e.detail.value; },
  onWechatInput(e) { this.data.formWechat = e.detail.value; },
  onPrivacyChange(e) {
    const idx = e.detail.value;
    this.setData({ privacyIdx: idx, privacyText: this.data.privacyOptions[idx].name });
  },

  // ===== 保存（必须联网同步到服务端）=====
  saveProfile() {
    const nickname = this.data.formNickname;
    const phone = this.data.formPhone;
    const wechatId = this.data.formWechat;
    const privacySetting = this.data.privacyOptions[this.data.privacyIdx].value;

    if (!nickname) { wx.showToast({ title: '请输入昵称', icon: 'none' }); return; }
    if (!phone || phone.length < 11) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }

    wx.showLoading({ title: '保存中...' });
    const existing = app.getPlayer();

    const saveToLocal = (data) => {
      app.setPlayer(data);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.loadPlayer(data);
    };

    if (existing && existing.id) {
      api.updatePlayer(existing.id, { phone, wechatId, privacySetting })
        .then(data => {
          data.nickname = nickname;
          if (existing.openid) data.openid = existing.openid;
          saveToLocal(data);
        })
        .catch(() => {
          wx.hideLoading();
          wx.showModal({ title: '保存失败', content: '无法连接服务器，请稍后重试', showCancel: false });
        });
    } else {
      api.createPlayer({ nickname, phone, wechatId, privacySetting })
        .then(data => {
          const openid = existing?.openid || wx.getStorageSync('wechatOpenid');
          if (openid) data.openid = openid;
          saveToLocal(data);
          if (openid) {
            api.wechatBindUser({ openid, nickname, avatarUrl: '' }).catch(() => {});
          }
        })
        .catch(() => {
          wx.hideLoading();
          wx.showModal({ title: '保存失败', content: '无法连接服务器，请稍后重试', showCancel: false });
        });
    }
  },

  // ===== 老板退出 =====
  logoutOwner() {
    wx.showModal({
      title: '确认', content: '确定退出老板账号？',
      success: (res) => {
        if (!res.confirm) return;
        app.clearOwnerInfo();
        this.setData({ hasOwner: false, ownerName: '' });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },
});
