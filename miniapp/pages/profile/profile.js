var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    loggedIn: false,
    loginLoading: false,
    playerId: 0,

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

  onLoad: function() {
    this.checkLogin();
  },

  onShow: function() {
    this.checkLogin();
  },

  checkLogin: function() {
    var player = app.getPlayer();
    var openid = wx.getStorageSync('wechatOpenid');
    if (player && player.id && player.id > 0) {
      this.setData({ loggedIn: true, playerId: player.id });
      this.loadPlayer(player);
    } else if (openid) {
      this.refreshPlayer(openid);
    } else {
      this.setData({ loggedIn: false });
    }
    this.checkOwner();
  },

  refreshPlayer: function(openid) {
    var that = this;
    var nickname = app.generateNickname();
    api.wechatBindUser({ openid: openid, nickname: nickname, avatarUrl: '' }).then(function(data) {
      app.setPlayer(data);
      that.setData({ loggedIn: true, playerId: data.id });
      that.loadPlayer(data);
    }).catch(function() {});
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
            that.doWechatLogin();
          }
        },
      });
    } else {
      that.doWechatLogin();
    }
  },

  doWechatLogin: function() {
    var that = this;
    that.setData({ loginLoading: true });
    wx.showLoading({ title: '登录中...' });
    wx.login({
      success: function(loginRes) {
        api.wechatLogin(loginRes.code).then(function(data) {
          var openid = data.openid;
          var nickname = app.generateNickname();
          api.wechatBindUser({ openid: openid, nickname: nickname, avatarUrl: '' }).then(function(bindRes) {
            wx.setStorageSync('wechatOpenid', openid);
            app.globalData.wechatOpenid = openid;
            app.setPlayer(bindRes);
            wx.hideLoading();
            that.setData({
              loggedIn: true,
              loginLoading: false,
              playerId: bindRes.id,
              formNickname: bindRes.nickname,
              formPhone: bindRes.phone || '',
              formWechat: bindRes.wechatId || '',
              privacyIdx: that.getPrivacyIdx(bindRes.privacySetting || 'game_only'),
              privacyText: that.getPrivacyText(bindRes.privacySetting || 'game_only'),
            });
            wx.showToast({ title: '登录成功', icon: 'none' });
          }).catch(function(err) {
            wx.hideLoading();
            that.setData({ loginLoading: false });
            wx.showModal({ title: '登录失败', content: err.message, showCancel: false });
          });
        }).catch(function(err) {
          wx.hideLoading();
          that.setData({ loginLoading: false });
          wx.showModal({ title: '登录失败', content: err.message, showCancel: false });
        });
      },
      fail: function() {
        wx.hideLoading();
        that.setData({ loginLoading: false });
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      },
    });
  },

  // ===== 获取手机号 =====
  onGetPhoneNumber: function(e) {
    var that = this;
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      if (e.detail.errMsg && e.detail.errMsg.indexOf('fail') >= 0) {
        wx.showModal({ title: '获取失败', content: '微信获取手机号需要在小程序后台开通权限，请联系管理员开通', showCancel: false });
      }
      return;
    }
    var openid = wx.getStorageSync('wechatOpenid') || app.globalData.wechatOpenid;
    if (!openid) { wx.showToast({ title: '请先微信登录', icon: 'none' }); return; }
    wx.showLoading({ title: '获取中...' });
    var body = { openid: openid };
    if (e.detail.code) {
      body.phoneCode = e.detail.code;
    } else if (e.detail.encryptedData) {
      body.encryptedData = e.detail.encryptedData;
      body.iv = e.detail.iv;
    } else {
      wx.hideLoading();
      wx.showModal({ title: '获取失败', content: '微信版本不支持，请手动输入手机号', showCancel: false });
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
            that.setData({ formPhone: data.phone });
            that.saveToServer(data.phone, that.data.formWechat, that.data.privacyOptions[that.data.privacyIdx].value);
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
    var nickname = this.data.formNickname;
    var phone = this.data.formPhone;
    var wechatId = this.data.formWechat;
    var privacySetting = this.data.privacyOptions[this.data.privacyIdx].value;

    if (!nickname) { wx.showToast({ title: '请输入昵称', icon: 'none' }); return; }
    if (!phone || phone.length < 11) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }
    if (!this.data.playerId || this.data.playerId === 0) {
      wx.showToast({ title: '请先微信登录', icon: 'none' });
      return;
    }
    this.saveToServer(phone, wechatId, privacySetting, nickname);
  },

  saveToServer: function(phone, wechatId, privacySetting, nickname) {
    var that = this;
    wx.showLoading({ title: '保存中...' });
    api.updatePlayer(this.data.playerId, { phone: phone, wechatId: wechatId, privacySetting: privacySetting })
      .then(function(data) {
        if (nickname && nickname !== data.nickname) {
          return api.updatePlayer(that.data.playerId, { nickname: nickname }).then(function() {
            data.nickname = nickname;
            return data;
          });
        }
        return data;
      })
      .then(function(data) {
        var player = app.getPlayer() || {};
        player.id = that.data.playerId;
        player.nickname = data.nickname || nickname;
        player.phone = data.phone || phone;
        player.wechatId = data.wechatId || wechatId;
        player.privacySetting = data.privacySetting || privacySetting;
        app.setPlayer(player);
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        that.loadPlayer(player);
      })
      .catch(function(err) {
        wx.hideLoading();
        wx.showModal({ title: '保存失败', content: '无法连接服务器，请稍后重试。' + (err.message || ''), showCancel: false });
      });
  },

  // ===== 退出登录 =====
  logout: function() {
    var that = this;
    wx.showModal({
      title: '确认', content: '确定退出登录？',
      success: function(res) {
        if (!res.confirm) return;
        wx.removeStorageSync('wechatOpenid');
        app.globalData.wechatOpenid = null;
        app.setPlayer(null);
        that.setData({ loggedIn: false, playerId: 0 });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
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
