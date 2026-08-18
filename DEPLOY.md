# 部署到 Render（外网访问 · 永久免费）

> 让你的牧龙山石斛进销存从「只能在公司局域网用」变成「任何地方都能用」。
> 全程 **0 元**，用 Render 免费层 + Neon 免费 Postgres。

---

## 总体流程

```
1. 注册 Render（GitHub 登录）
2. 注册 Neon，创建免费 Postgres 数据库
3. 把代码推到 GitHub
4. Render 创建 Web Service 并连 Neon
5. 拿到 https://xxx.onrender.com 公网 URL
6. 配置 UptimeRobot 防冷启动（详见 UPTIMEROBOT.md）
7. 小程序 / PC 后台 baseUrl 改成新 URL
```

预计耗时：30-60 分钟。

---

## Step 1：注册 Render

1. 打开 https://render.com
2. 点 **Get Started for Free** → **Sign up with GitHub**
3. 授权 Render 访问你的 GitHub（建议用一个测试 GitHub 账号，不要用生产账号）

---

## Step 2：注册 Neon（创建免费 Postgres）

1. 打开 https://neon.tech
2. 点 **Sign Up** → **Continue with GitHub**（同 Render 那个）
3. 创建项目：
   - **Project name**: `mulongshan-warehouse`
   - **Region**: `Singapore`（亚洲最近，免费层支持）
   - **Postgres version**: 选最新
4. 进项目后会自动创建一个 `main` branch + 默认 database
5. 点右上角 **Connection Details** → 选 **Pooled connection** (端口 5432)
6. 复制 connection string，长这样：
   ```
   postgresql://username:password@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
7. **保存这个字符串**，下一步要用

> 💡 Neon 免费层：0.5 GB 存储、无限期使用、自动休眠（不会消耗你额度）。

---

## Step 3：把代码推到 GitHub

如果你的代码已经在 GitHub 仓库，跳到 Step 4。

否则：

```bash
# 在 warehouse-server 目录下
cd warehouse-server
git init
git add .
git commit -m "first commit"
# 在 GitHub 网页上 New repository，名字比如 mulongshan-warehouse-server
# 然后推送：
git remote add origin https://github.com/你的用户名/mulongshan-warehouse-server.git
git branch -M main
git push -u origin main
```

---

## Step 4：在 Render 创建 Web Service

### 4.1 方式 A：用 Blueprint（推荐，最快）

1. Render 控制台 → **New** → **Blueprint**
2. 选你的 GitHub 仓库 `mulongshan-warehouse-server`
3. Render 自动识别 `render.yaml` 并创建服务
4. 进服务详情 → **Environment** → 找到 `DATABASE_URL`
5. 把 Step 2 拿到的 Neon connection string 填进去 → **Save Changes**
6. 等 1-2 分钟自动部署完

### 4.2 方式 B：手动创建

1. Render 控制台 → **New** → **Web Service**
2. 选你的 GitHub 仓库 → 点 **Connect**
3. 填配置：
   - **Name**: `mulongshan-warehouse`
   - **Region**: `Singapore`
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
4. **Advanced** → **Health Check Path**: `/api/health`
5. **Environment Variables** → 添加：
   - `DATABASE_URL` = 你的 Neon connection string
   - `UPLOADS_DIR` = `/tmp/uploads`
   - `RENDER` = `true`
   - `NODE_VERSION` = `20`
6. 点 **Create Web Service**

---

## Step 5：拿到公网 URL

部署成功后，Render 会给你一个 URL：

```
https://mulongshan-warehouse.onrender.com
```

### 5.1 验证部署成功

浏览器打开：
- `https://你的URL.onrender.com/` → 应该看到管理后台登录页
- `https://你的URL.onrender.com/api/health` → 应该返回 `{"ok":true,"time":...,"db":"postgres"}`

### 5.2 测试登录

打开管理后台，用 `admin / admin123` 登录。

> ⚠️ **首次启动可能等 30-50 秒**（冷启动）。配置 UptimeRobot 之后就秒开。

---

## Step 6：配置 UptimeRobot 防冷启动

详见 [UPTIMEROBOT.md](./UPTIMEROBOT.md)，5 分钟搞定，让服务永远秒开。

---

## Step 7：客户端 baseUrl 切换

### 7.1 小程序

打开 `warehouse-miniprogram/app.js`，找到：
```js
baseUrl: 'http://192.168.1.68:3000'
```
改成：
```js
baseUrl: 'https://mulongshan-warehouse.onrender.com'
```

### 7.2 PC 后台

PC 后台是纯静态 HTML，**没有 baseUrl 写死**。但访问的 API 是相对路径 `/api/*`，所以只要你打开 `https://你的URL.onrender.com/` 就能用。

### 7.3 钉钉 / 飞书等其他平台

如果未来要接钉钉微应用，配置首页 URL = `https://你的URL.onrender.com/`

---

## 数据备份（强烈建议）

Neon 永久免费且数据不丢，但万一你误删了 DB 也没了。建议：

1. 每周进 Render → 你的服务 → **Shell** 标签页
2. 跑：
   ```bash
   curl -s https://你的URL.onrender.com/api/inventory -H "Authorization: Bearer $TOKEN" > backup.json
   ```
3. 或者直接用 PC 后台的 **导出 CSV** 功能定期备份

或者用 Neon's 内置分支功能做快照（Free 7 天自动保留）。

---

## 常见问题

### Q1：部署后访问很慢？
第一次冷启动要 30-50 秒。配 UptimeRobot 解决。

### Q2：图片上传后刷新就 404？
**这是 Render 的限制**：上传到 `/tmp` 的图片会在服务重启时丢失。
解决方案（任选）：
- 改用对象存储：Cloudflare R2（10GB 免费）/ AWS S3 / 阿里云 OSS
- 暂时不用发票上传功能
- 上传到 Imgur 等图床（不适合生产）

### Q3：数据会不会丢？
**不会**。Neon 永久免费且数据持久。UptimeRobot 防止冷启动让服务一直在线。

### Q4：能不能用其他免费云？
可以。代码兼容任何支持 Node.js 的 PaaS：Railway、Fly.io、Glitch、Cyclic 等。
本指南只示范 Render，迁移到其他平台只需：
- 配环境变量 `DATABASE_URL`
- 改启动命令为 `npm start`

### Q5：上线了以后想改代码怎么办？
直接 `git push`，Render 会自动重新部署。
注意：重新部署会重启进程，但**数据库内容不会丢**（在 Neon 里）。

---

## 总结：成本 & 限额

| 项目 | 免费额度 | 你公司使用情况 | 够用？ |
|---|---|---|---|
| Render Web Service | 750 小时/月 | 每天 24h = 720h/月 | ✅ |
| Neon Postgres | 0.5 GB 存储 | 几千条商品/记录 | ✅ 10 年以上 |
| Neon 计算 | 191.9 小时/月 | Render 用 Render 的 | ✅ |
| UptimeRobot | 50 个监控 / 5 分钟间隔 | 1 个就够 | ✅ |
| **总成本** | | | **0 元** |
