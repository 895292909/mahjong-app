var api = require('../../utils/api');
var app = getApp();

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

  onLoad: function() {
    var player = app.getPlayer();
    var openid = wx.getStorageSync('wechatOpenid');
    if (openid) {
      app.globalData.wechatOpenid = openid;
      this.setData({
        wechatLogged: true,
        wechatOpenid: openid,
        wechatNickname: player && player.nickname ? player.nickname : '',
        wechatPhone: player && player.phone ? player.phone : '',
      });
    }
    if (player) this.loadPlayer(player);
    this.checkOwner();
    this.refreshPhoneCode();
  },

  refreshPhoneCode: function() {
    var that = this;
    wx.login({ success: function(res) { that.phoneCode = res.code; } });
  },

  onShow: function() {
    var player = app.getPlayer();
    if (player) this.loadPlayer(player);
  },

  loadPlayer: function(player) {
    this.setData({
      formNickname: player.nickname,
      formPhone: player.phone || '',
      formWechat: player.wechatId || '',
      privacyIdx: this.getPrivacyIdx(player.privacySetting || 'game_only'),
      privacyText: this.getPrivacyText(player.privacySetting || 'game_only'),
    });
  },

  getPrivacyText: function(val) {
    var opts = this.data.privacyOptions;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === val) return opts[i].name;
    }
    return '同局玩家可见';
  },

  getPrivacyIdx: function(val) {
    var opts = this.data.privacyOptions;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === val) return i;
    }
    return 0;
  },

  checkOwner: function() {
    var name = wx.getStorageSync('ownerName');
    if (name) this.setData({ hasOwner: true, ownerName: name });
  },

  // ===== 微信登录 =====
  wechatLoginBtn: function() {
    var that = this;
    var agreed = wx.getStorageSync('agreed');
    if (!agreed) {
      wx.showModal({
        title: '用户协议',
        content: '尊敬的用户，欢迎使用麻将排桌小程序。\n\n1. 信息收集\n我们可能会收集您的微信昵称、手机号及微信号等信息。\n\n2. 信息使用\n您的联系方式仅在同局玩家和麻将馆老板查看时使用，所有查看操作均记录审计日志。\n\n3. 信息保护\n您的手机号将经过加密存储。\n\n4. 隐私选择\n您可以在"我的"页面中设置联系方式可见性。',
        confirmText: '同意',
        cancelText: '退出',
        success: function(res) {
          if (res.confirm) {
            wx.setStorageSync('agreed', true);
            that.startWechatLogin();
          }
        },
      });
    } else {
      that.startWechatLogin();
    }
  },

  startWechatLogin: function() {
    var that = this;
    wx.showLoading({ title: '登录中...' });
    wx.login({
      success: function(loginRes) {
        api.wechatLogin(loginRes.code).then(function(data) {
          var openid = data.openid;
          var existing = app.getPlayer();
          var nickname = existing && existing.nickname ? existing.nickname : app.generateNickname();
          api.wechatBindUser({ openid: openid, nickname: nickname, avatarUrl: '' }).then(function(bindRes) {
            wx.setStorageSync('wechatOpenid', openid);
            app.globalData.wechatOpenid = openid;
            if (!existing) {
              app.setPlayer({ id: bindRes.id, nickname: bindRes.nickname, openid: openid });
              that.setData({ formNickname: bindRes.nickname, wechatNickname: bindRes.nickname });
            }
            wx.hideLoading();
            that.setData({ wechatLogged: true, wechatOpenid: openid });
            wx.showToast({ title: '微信登录成功', icon: 'none' });
          }).catch(function(err) { wx.hideLoading(); wx.showModal({ title: '登录失败', content: err.message, showCancel: false }); });
        }).catch(function(err) { wx.hideLoading(); wx.showModal({ title: '登录失败', content: err.message, showCancel: false }); });
      },
      fail: function() { wx.hideLoading(); wx.showToast({ title: '微信登录失败', icon: 'none' }); },
    });
  },

  // ===== 获取手机号 =====
  onGetPhoneNumber: function(e) {
    var that = this;
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showModal({ title: '授权失败', content: e.detail.errMsg, showCancel: false });
      return;
    }
    var openid = this.data.wechatOpenid || app.globalData.wechatOpenid;
    if (!openid) { wx.showToast({ title: '请先微信登录', icon: 'none' }); return; }
    wx.showLoading({ title: '获取中...' });
    var body = { openid: openid };
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
    api.wechatBindPhone(body).then(function(data) {
      wx.hideLoading();
      wx.showModal({
        title: '手机号确认',
        content: '是否使用 ' + data.phone + ' 作为您的手机号？',
        confirmText: '确定', cancelText: '取消',
        success: function(res) {
          if (res.confirm) {
            that.setData({ formPhone: data.phone, wechatPhone: data.phone });
            wx.showToast({ title: '手机号已绑定', icon: 'none' });
          }
        },
      });
    }).catch(function(err) {
      wx.hideLoading();
      wx.showModal({ title: '获取失败', content: err.message, showCancel: false });
    });
  },

  // ===== 表单 =====
  onNicknameInput: function(e) { this.data.formNickname = e.detail.value; },
  onPhoneInput: function(e) { this.data.formPhone = e.detail.value; },
  onWechatInput: function(e) { this.data.formWechat = e.detail.value; },
  onPrivacyChange: function(e) {
    var idx = e.detail.value;
    this.setData({ privacyIdx: idx, privacyText: this.data.privacyOptions[idx].name });
  },

  // ===== 保存 =====
  saveProfile: function() {
    var that = this;
    var nickname = this.data.formNickname;
    var phone = this.data.formPhone;
    var wechatId = this.data.formWechat;
    var privacySetting = this.data.privacyOptions[this.data.privacyIdx].value;

    if (!nickname) { wx.showToast({ title: '请输入昵称', icon: 'none' }); return; }
    if (!phone || phone.length < 11) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }

    wx.showLoading({ title: '保存中...' });
    var existing = app.getPlayer();

    var saveToLocal = function(data) {
      app.setPlayer(data);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      that.loadPlayer(data);
    };

    if (existing && existing.id) {
      api.updatePlayer(existing.id, { phone: phone, wechatId: wechatId, privacySetting: privacySetting })
        .then(function(data) {
          data.nickname = nickname;
          if (existing.openid) data.openid = existing.openid;
          saveToLocal(data);
        })
        .catch(function() {
          wx.hideLoading();
          wx.showModal({ title: '保存失败', content: '无法连接服务器，请稍后重试', showCancel: false });
        });
    } else {
      api.createPlayer({ nickname: nickname, phone: phone, wechatId: wechatId, privacySetting: privacySetting })
        .then(function(data) {
          var openid = existing && existing.openid ? existing.openid : wx.getStorageSync('wechatOpenid');
          if (openid) data.openid = openid;
          saveToLocal(data);
          if (openid) {
            api.wechatBindUser({ openid: openid, nickname: nickname, avatarUrl: '' }).catch(function() {});
          }
        })
        .catch(function() {
          wx.hideLoading();
          wx.showModal({ title: '保存失败', content: '无法连接服务器，请稍后重试', showCancel: false });
        });
    }
  },

  // ===== 老板退出 =====
  logoutOwner: function() {
    var that = this;
    wx.showModal({
      title: '确认', content: '确定退出老板账号？',
      success: function(res) {
        if (!res.confirm) return;
        app.clearOwnerInfo();
        that.setData({ hasOwner: false, ownerName: '' });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },
});
