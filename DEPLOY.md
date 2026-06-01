# 🀄 麻将排桌 — 部署指南

## 项目结构

```
E:\ai_en\
├── mahjong-app\          # 后端 (Node.js + Express + SQLite)
│   ├── server.js
│   ├── database/
│   ├── routes/
│   ├── socket/
│   ├── public/           # Web 版前端（小程序上线后仍可用）
│   └── package.json
│
└── mahjong-miniapp\      # 微信小程序前端
    ├── app.json
    ├── app.js
    ├── utils/api.js      # API 请求封装（修改 BASE_URL）
    └── pages/
        ├── index/        # 首页 - 麻将馆列表
        ├── hall/         # 牌桌选择页（5秒轮询）
        ├── owner/        # 老板管理页
        └── profile/      # 玩家信息页
```

---

## 第一步：部署后端到 Railway

### 1.1 推送代码到 GitHub

```bash
cd E:\ai_en\mahjong-app

git init
git add .
git commit -m "init: mahjong hall management system"

# 在 https://github.com/new 创建新仓库（不要勾选任何初始化选项）
git remote add origin https://github.com/你的用户名/mahjong-app.git
git branch -M main
git push -u origin main
```

### 1.2 Railway 部署

1. 访问 https://railway.app 并登录（可用 GitHub 账号）
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择刚才推送的 `mahjong-app` 仓库
4. Railway 会自动检测 Node.js 项目并部署
5. 等待部署完成后，点击生成的域名（`https://xxx.up.railway.app`）
6. 验证：访问 `https://xxx.up.railway.app/api/halls` 应看到 JSON 数据

### 1.3 设置环境变量（Railway Dashboard → Variables）

| 变量 | 说明 | 建议值 |
|------|------|--------|
| `PORT` | 端口 | `3000`（Railway 自动映射） |
| `JWT_SECRET` | JWT 签名密钥 | 随机字符串（可用 `openssl rand -hex 32` 生成） |
| `ENCRYPTION_KEY` | 手机号加密密钥 | 随机字符串（同上） |

---

## 第二步：配置小程序

### 2.1 修改 API 地址

打开 `E:\ai_en\mahjong-miniapp\utils\api.js`，将第 2 行的 `BASE_URL` 改为 Railway 域名：

```javascript
var BASE_URL = 'https://your-app.up.railway.app';  // 替换为你的 Railway 域名
```

### 2.2 微信开发者工具打开项目

1. 打开 **微信开发者工具**
2. 点击 **导入项目** → 选择 `E:\ai_en\mahjong-miniapp` 文件夹
3. 填入你的小程序 AppID
4. 点击 **导入**

### 2.3 设置不校验域名（开发阶段）

在开发者工具中：
1. 点击右上角 **详情** → **本地设置**
2. 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本及 HTTPS 证书**

### 2.4 编译预览

点击工具栏 **编译** 按钮，模拟器应显示麻将馆列表。

如果 API 不通，检查：
- Railway 项目是否正常运行（`curl https://xxx.up.railway.app/api/halls`）
- `BASE_URL` 是否填写正确
- 是否勾选了"不校验合法域名"

---

## 第三步：真机测试

1. 开发者工具中点击 **预览** 按钮
2. 用手机微信扫码
3. 测试完整流程：麻将馆列表 → 选馆 → 选桌 → 加入/离座 → 老板登录 → 查看联系方式

---

## 第四步：线上发布（需要 ICP 备案）

### 需要准备

| 项目 | 说明 |
|------|------|
| ICP 备案 | 国内服务器需要备案，Railway 是海外服务可绕过 |
| 自定义域名 | 为 Railway 配置自定义域名（可选） |
| 小程序域名白名单 | 在微信小程序后台 → 开发 → 开发设置 → 服务器域名 中添加 `https://xxx.up.railway.app` |

### 发布流程

1. 小程序后台 → 版本管理 → 提交审核
2. 审核通过后发布

---

## 注意事项

- **数据持久化**：Railway 重启后 SQLite 数据会丢失。如需持久化，建议改用 PostgreSQL（Railway 提供免费 500MB 实例）
- **加密密钥**：生产环境务必修改 `JWT_SECRET` 和 `ENCRYPTION_KEY`
- **兼容性**：Web 版（`http://localhost:3000`）和小程序版可同时运行，共享同一后端
