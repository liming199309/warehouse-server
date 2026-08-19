# 牧龙山进销存 · 微信云托管部署指南（不绑卡版）

> 适用：没有信用卡、需要外网访问、微信小程序内部仓库管理
> 费用：前 3 个月免费，之后约 ¥20/月（微信支付，随用随扣）
> 数据库：继续用 Neon（免费，数据已迁移好）

---

## 准备（只需一次）

1. 电脑装 **微信开发者工具**（稳定版）：
   https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
2. 打开工具，**微信扫码登录**（用小程序管理员的那个微信）
3. 确认小程序 AppID：`wxe3b6bf8e40e25541`（project.config.json 里已配好）

---

## 第 1 步：开通云托管（2 分钟）

1. 微信开发者工具顶部菜单 → 点「**云开发**」按钮
2. 第一次会提示开通 → 同意协议 → 创建一个环境：
   - 环境名称：`warehouse`
   - 记一下**环境 ID**（形如 `warehouse-1a2b3c`）
3. 进入云开发控制台后，左侧找「**云托管**」标签页

> 也可以直接开网页版控制台：https://cloud.weixin.qq.com/

## 第 2 步：创建服务（3 分钟）

1. 云托管页面 → 「**新建服务**」
2. 填写：
   - 服务名称：`mulongshan-warehouse`
   - 代码来源：选「**本地代码** / 上传代码包」
   - 上传文件：**`warehouse-cloudrun.zip`**（我已经打好包，在项目根目录）
   - 端口：**80**
   - 实例规格：选**最小档**（0.25 核 / 0.5G，够用且省额度）
3. 高级设置 / 环境变量里加 3 条：

   | 变量名 | 值 |
   |---|---|
   | `DATABASE_URL` | `postgresql://neondb_owner:npg_4DdF9rNTpxOf@ep-raspy-star-azse4fmv-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` |
   | `UPLOADS_DIR` | `/tmp/uploads` |
   | `JWT_SECRET` | `mulongshan-warehouse-jwt-secret-2026` |

4. 点「**创建 / 部署**」→ 等 3-5 分钟构建

## 第 3 步：拿到公网地址（1 分钟）

部署成功后，服务详情页有「**公网访问地址**」，形如：
```
https://mulongshan-warehouse-xxxxxx.ap-shanghai.run.tcloudbase.com
```

**验证**：浏览器打开 `你的地址/api/health`，看到：
```json
{"ok":true,"db":"postgres",...}
```
`db:"postgres"` = 已连上 Neon，数据全在 ✅

## 第 4 步：小程序指向新地址（1 分钟）

把地址发给我（或自己改）：
- 文件：`warehouse-miniprogram/app.js` 第 9 行 `baseUrl` 改成你的服务地址
- 开发/体验版：开发者工具勾「不校验合法域名」即可用
- 正式发布版：去 mp.weixin.qq.com → 开发管理 → 服务器域名 → 把服务地址加进 request 合法域名

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
