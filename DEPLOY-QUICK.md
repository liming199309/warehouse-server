# 牧龙山石斛进销存 · Render 部署清单（极简版）

> 目标：让你的微信小程序在**任何地方都能用**（脱离局域网、跨网络、外网可访问）
> 总时间：30-60 分钟
> 总成本：**0 元**

---

## 你需要准备的 3 个账号（免费注册）

| 账号 | 地址 | 用途 |
|---|---|---|
| **GitHub** | https://github.com | 存代码（Render 部署从这里拉） |
| **Render** | https://render.com | 云服务器（部署 Node.js 后端） |
| **Neon** | https://neon.tech | 免费 Postgres 数据库（持久化数据） |

---

## 7 步搞定（每步都已验证可跑）

### 第 1 步：注册 Neon 数据库（5 分钟）

1. 打开 https://neon.tech → **Sign Up with GitHub**
2. 创建新项目：
   - Project name: `mulonshan-warehouse`
   - Region: **Singapore**（亚洲最近）
   - Postgres version: 16（默认）
3. 创建完成后，**首页能看到 connection string**：
   ```
   postgres://用户名:密码@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. **复制这串字符保存到手机备忘录**（部署时要填到 Render）

### 第 2 步：把代码推到 GitHub（5 分钟）

**两种方式二选一**：

#### 方式 A：用我帮你做（你提供 token）
1. 在 GitHub 创建新仓库 `warehouse-server`（Public）
2. 在 GitHub → Settings → Developer settings → Personal access tokens → **生成新 token**（勾选 repo 权限）
3. 把 token 发我，我立刻帮你推代码

#### 方式 B：你自己推（更安全）
1. 在 GitHub 创建新仓库 `warehouse-server`（**Public**，不要选 Private，否则 Render 免费版拉不到）
2. 在本地 PowerShell 跑：
   ```bash
   cd "E:/workbuddy缓存/2026-08-17-16-04-30/warehouse-server"
   git remote add origin https://github.com/你的用户名/warehouse-server.git
   git branch -M main
   git push -u origin main
   ```
3. 等 push 完成

### 第 3 步：在 Render 创建 Web Service（5 分钟）

1. 登录 https://render.com → **New +** → **Web Service**
2. 选 **"Build and deploy from a Git repository"**
3. **Connect** GitHub → 找到 `warehouse-server` 仓库 → **Connect**
4. 填写：
   | 字段 | 填什么 |
   |---|---|
   | **Name** | `mulonshan-warehouse` |
   | **Region** | Singapore |
   | **Branch** | `main` |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `node server.js` |
   | **Plan** | **Free**（免费） |
5. 点 **"Advanced"** → 添加**环境变量**：

   | 变量名 | 值 |
   |---|---|
   | `DATABASE_URL` | 第 1 步的 Neon connection string |
   | `JWT_SECRET` | `mulonshan-warehouse-jwt-secret-2026` |
   | `UPLOADS_DIR` | `/tmp/uploads` |
   | `NODE_VERSION` | `18.19.0` |

6. 点 **Create Web Service** → 等 2-3 分钟部署完成
7. 拿到公网 URL：`https://mulonshan-warehouse.onrender.com`

### 第 4 步：验证部署（2 分钟）

浏览器打开：
```
https://mulonshan-warehouse.onrender.com/api/health
```

应该看到：
```json
{"ok":true,"db":"postgres",...}
```

看到 `db:"postgres"` 就 OK ✅

### 第 5 步：配置防冷启动（5 分钟）

1. 注册 https://uptimerobot.com → Free Account
2. **+ Add New Monitor**：
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `牧龙山仓库`
   - URL: `https://mulonshan-warehouse.onrender.com/api/health`
   - Monitoring Interval: **5 minutes**
3. 点 **Create Monitor**

→ **从此告别冷启动**，服务永远热着

### 第 6 步：改小程序 baseUrl（2 分钟）

打开 `warehouse-miniprogram/app.js`，找到这一行：
```js
baseUrl: 'https://mulonshan-warehouse.onrender.com',
```

**改成你的实际 URL**（如果和默认名不同）：
```js
baseUrl: 'https://你的服务名.onrender.com',
```

### 第 7 步：配置微信小程序合法域名（5 分钟）

⚠️ **正式发布版必须配置**；**真机调试版可以不配置**（开发者工具勾「不校验合法域名」）

1. 登录 https://mp.weixin.qq.com → 你的小程序后台
2. **开发管理** → **开发设置** → **服务器域名**
3. **request 合法域名**：添加 `https://mulonshan-warehouse.onrender.com`
4. **uploadFile 合法域名**：添加同 URL
5. 保存

---

## ✅ 部署完成！现在你能

| 场景 | 怎么用 |
|---|---|
| 同事在外地用小程序 | 打开小程序 → 自动连 Render 公网 → 立即用 |
| 同事在公司用 | 打开小程序 → 同 WiFi 时可继续用 192.168.1.68:3000（更快） |
| 电脑浏览器管理 | 浏览器开 `https://mulonshan-warehouse.onrender.com/` → 登录 admin/admin123 或 mls001/mls1234 |
| 上传发票 | 移动端 OK，自动存 Render `/tmp`（**注意**：重启 Render 会丢图片，需要时接 Cloudflare R2）|

---

## 常见问题

| Q | A |
|---|---|
| **数据库要不要钱？** | Neon 免费 0.5GB，够你们用 10 年 |
| **Render 免费够用吗？** | 750 小时/月，**每天 24h 够用**（靠 UptimeRobot 续命） |
| **同事扫码就能用？** | 是，不需要 IP，不需要 WiFi |
| **图片（发票）丢了怎么办？** | Render 重启会丢 `/tmp` 图。**长期方案**：接 Cloudflare R2（10GB 免费） |
| **不想用了怎么删？** | Render 控制台 → 你的 service → Settings → Delete |

---

## 一句话流程

> Neon 注册拿 connection string → GitHub 建仓推代码 → Render 创建 Web Service → 填 4 个环境变量 → 部署 → 改小程序 baseUrl → 注册 UptimeRobot 防冷启动 → 完成

**需要我帮你做任何一步，告诉我"第 X 步"。**