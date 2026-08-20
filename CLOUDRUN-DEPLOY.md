# 牧龙山进销存 · 微信云托管部署指南（v4 · 修复版）

> 适用：没有信用卡、需要外网访问、微信小程序内部仓库管理
> 费用：前 3 个月免费，之后约 ¥20/月（微信支付，随用随扣）
> 数据库：继续用 Neon（免费，数据已迁移好）

---

## 本次修复说明（第 4 次部署）

**前 3 次失败的根本原因已查明**：ZIP 包使用了 Windows 反斜杠路径分隔符（`\`），而微信云托管的构建环境是 Linux，要求正斜杠（`/`），导致构建机无法正确解析文件路径，全部 3 次都在「解压 ZIP 后、启动 docker build 前」就失败。

**v4 修复**：用 Python `zipfile` 模块重新打包，强制使用正斜杠路径分隔符。已验证：ZIP 内 0 个反斜杠路径。

---

## 准备（只需一次）

1. 电脑装 **微信开发者工具**（稳定版）：
   https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
2. 打开工具，**微信扫码登录**（用小程序管理员的那个微信）
3. 确认小程序 AppID：`wx2f03d6ba85cdfb3a`（project.config.json 里已配好）
4. 云开发环境 `cloud1` 已开通，云托管已启用（上次已做完）

---

## 第 1 步：上传代码包（1 分钟）

**新包位置**：
```
C:\Users\Mullongshan\Desktop\warehouse-cloudrun-v4.zip
```
（40.9 KB，正斜杠路径，已验证）

1. 进入微信云托管控制台（开发者工具 → 云开发 → 云托管；或网页版 https://console.cloud.tencent.com/tcb）
2. 找到已创建的服务 **mulongshan-warehouse**
3. 点击「**版本列表**」→ 「**新建版本**」
4. 上传方式选「**本地代码 / 上传代码包**」
5. 选文件：**`warehouse-cloudrun-v4.zip`**（从桌面选）
6. 端口：**80**
7. Dockerfile 路径：留空（包里有 Dockerfile，自动识别）

## 第 2 步：环境变量（关键！）

新建版本时，高级设置 → 环境变量，确认有这 3 条：

| 变量名 | 值 |
|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_4DdF9rNTpxOf@ep-raspy-star-azse4fmv-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` |
| `UPLOADS_DIR` | `/tmp/uploads` |
| `JWT_SECRET` | `mulongshan-warehouse-jwt-secret-2026` |

> 如果之前版本已配过环境变量，可跳过——服务级环境变量会继承到新版本。

## 第 3 步：构建部署（3-5 分钟）

1. 确认信息 → 点「**确认**」开始构建
2. 等 3-5 分钟，关注日志：
   - ✅ 看到 `Downloading ZIP package...` + 解压列表
   - ✅ 看到 `Step 1/x : FROM ccr.ccs.tencentyun.com/library/node:20-alpine`
   - ✅ 看到 `npm install` 输出
   - ✅ 看到 `Successfully built` 和 `Successfully tagged`
3. 构建成功后，版本列表里状态变为「**正常**」

## 第 4 步：拿到公网地址（1 分钟）

部署成功后，服务详情页有「**公网访问地址**」，形如：
```
https://mulongshan-warehouse-xxxxxx.ap-shanghai.run.tcloudbase.com
```

**验证**：浏览器打开 `你的地址/api/health`，看到：
```json
{"ok":true,"db":"postgres",...}
```
`db:"postgres"` = 已连上 Neon，数据全在 ✅

## 第 5 步：小程序指向新地址（1 分钟）

把地址发给我（或自己改）：
- 文件：`warehouse-miniprogram/app.js` 第 9 行 `baseUrl` 改成你的服务地址
- 开发/体验版：开发者工具勾「不校验合法域名」即可用
- 正式发布版：去 mp.weixin.qq.com → 开发管理 → 服务器域名 → 把服务地址加进 request 合法域名

---

## 前 3 次失败日志对比

| 次数 | 日志特征 | 失败原因 |
|---|---|---|
| 001 | 解压 ZIP 后无后续构建日志 | ZIP 反斜杠路径 + npm 源超时 |
| 002 | 同上 | 改了镜像源，但 ZIP 反斜杠问题未解 |
| 003 | 同上（25 行，完全一致） | ZIP 反斜杠问题未解 |
| **v4** | **Python 打包，0 反斜杠** | **应可成功构建** |

---

## 常见问题

| Q | A |
|---|---|
| 免费多久？ | 首个环境送 3 个月免费额度（720 核时 CPU + 5GB 流量等） |
| 之后多少钱？ | 最小实例 24 小时跑 ≈ ¥20/月，从微信零钱扣 |
| 数据会丢吗？ | 不会。数据在 Neon（新加坡），容器重启不影响 |
| 上传的发票照片呢？ | 容器重启会丢（/tmp 临时目录），要长期存再说，我可以接对象存储（5GB 免费额度内） |
| 怎么停掉不花钱？ | 云托管控制台 → 服务 → 暂停服务，实例数调 0 就不计费 |

---

## 部署完告诉我

把「公网访问地址」发我，我帮你：
1. 验证部署 + 数据库连接
2. 改好小程序 baseUrl
3. 收尾记录
