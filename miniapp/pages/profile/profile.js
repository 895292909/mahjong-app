const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    // 微信登录状态
    wechatLogged: false,
    wechatNickname: '',
    wechatPhone: '',
    wechatOpenid: '',

    // 表单
    formNickname: '',
    formPhone: '',
    formWechat: '',
    privacyOptions: ['game_only', 'always', 'never'],
    privacyIdx: 0,
    privacyText: '同局玩家可见',

    // 老板
    hasOwner: false,
    ownerName: '',
  },

  // 预先存储最新的 wx.login code，用于手机号解密
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
    wx.login({
      success: (res) => {
        this.phoneCode = res.code;
      },
    });
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
      privacyIdx: ['game_only', 'always', 'never'].indexOf(player.privacySetting || 'game_only'),
      privacyText: this.getPrivacyText(player.privacySetting || 'game_only'),
    });
  },

  getPrivacyText(val) {
    return { game_only: '同局玩家可见', always: '所有人可见', never: '所有人不可见' }[val] || '同局玩家可见';
  },

  checkOwner() {
    const name = wx.getStorageSync('ownerName');
    if (name) {
      this.setData({ hasOwner: true, ownerName: name });
    }
  },

  // ===== 微信登录（先弹协议，再登录）=====
  async wechatLoginBtn() {
    const agreed = wx.getStorageSync('agreed');
    if (!agreed) {
      try {
        await app.showAgreement();
      } catch (e) {
        return;
      }
    }

    wx.showLoading({ title: '登录中...' });

    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });

      const data = await api.wechatLogin(loginRes.code);
      const openid = data.openid;

      const existing = app.getPlayer();
      const nickname = existing?.nickname || app.generateNickname();
      const bindRes = await api.wechatBindUser({ openid, nickname, avatarUrl: '' });
      wx.setStorageSync('wechatOpenid', openid);
      app.globalData.wechatOpenid = openid;

      if (!existing) {
        app.setPlayer({ id: bindRes.id, nickname: bindRes.nickname, openid });
        this.setData({
          formNickname: bindRes.nickname,
          wechatNickname: bindRes.nickname,
        });
      }

      wx.hideLoading();
      this.setData({
        wechatLogged: true,
        wechatOpenid: openid,
      });
      wx.showToast({ title: '微信登录成功', icon: 'none' });
    } catch (err) {
      wx.hideLoading();
      console.error('微信登录失败:', err);
      wx.showModal({ title: '登录失败', content: err.message, showCancel: false });
    }
  },

  // ===== 获取手机号 =====
  async onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showModal({ title: '授权失败', content: e.detail.errMsg, showCancel: false });
      return;
    }

    const openid = this.data.wechatOpenid || app.globalData.wechatOpenid;
    if (!openid) { wx.showToast({ title: '请先微信登录', icon: 'none' }); return; }

    wx.showLoading({ title: '获取中...' });
    try {
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

      const data = await api.wechatBindPhone(body);

      wx.hideLoading();
      wx.showModal({
        title: '手机号确认',
        content: `是否使用 ${data.phone} 作为您的手机号？`,
        confirmText: '确定',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              formPhone: data.phone,
              wechatPhone: data.phone,
            });
            wx.showToast({ title: '手机号已绑定', icon: 'none' });
          }
        },
      });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '获取失败', content: err.message, showCancel: false });
    }
  },

  // ===== 表单输入 =====
  onNicknameInput(e) { this.data.formNickname = e.detail.value; },
  onPhoneInput(e) { this.data.formPhone = e.detail.value; },
  onWechatInput(e) { this.data.formWechat = e.detail.value; },
  onPrivacyChange(e) {
    const idx = e.detail.value;
    this.setData({
      privacyIdx: idx,
      privacyText: this.getPrivacyText(this.data.privacyOptions[idx]),
    });
  },

  // ===== 保存 =====
  saveProfile() {
    const nickname = this.data.formNickname;
    const phone = this.data.formPhone;
    const wechatId = this.data.formWechat;
    const privacySetting = this.data.privacyOptions[this.data.privacyIdx];

    if (!nickname) { wx.showToast({ title: '请输入昵称', icon: 'none' }); return; }
    if (!phone || phone.length < 11) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }

    wx.showLoading({ title: '保存中...' });
    const existing = app.getPlayer();
    const save = (data) => {
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
          save(data);
        })
        .catch(() => save({ ...existing, nickname, phone, wechatId, privacySetting }));
    } else {
      api.createPlayer({ nickname, phone, wechatId, privacySetting })
        .then(data => save(data))
        .catch(() => save({ id: 0, nickname, phone, wechatId, privacySetting }));
    }
  },

  // ===== 老板退出 =====
  logoutOwner() {
    wx.showModal({
      title: '确认',
      content: '确定退出老板账号？',
      success: (res) => {
        if (!res.confirm) return;
        app.clearOwnerInfo();
        this.setData({ hasOwner: false, ownerName: '' });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },
});
