# 牧龙山石斛进销存 · 后端服务 + 电脑端后台

安徽牧龙山铁皮石斛生物科技开发有限公司 · 进销存系统后端。
**单台服务器 + 多个小程序用户并发访问**，数据集中存储、支持多人登录、并发出入库不重复不超卖。

## 功能
- 多用户登录（Token 鉴权，7 天有效）
- 库存增删改查、批量上传商品（电脑后台一次性导入）
- 入库 / 销售出库 / 退库，全部带流水记录
- 按日 / 月 / 年统计数量与金额
- **并发安全**：所有变更操作走串行写锁 + 幂等去重（nonce），同一商品多人同时操作不会重复出入库、不会超卖、不会卡顿崩库

## 运行（在“服务器”那台电脑上）
1. 安装 Node.js 18+（https://nodejs.org）
2. 进入本目录，安装依赖：
   ```
   npm install
   ```
3. 启动：
   ```
   npm start
   ```
   默认端口 3000。看到「后端已启动」即成功。
4. 电脑端后台：浏览器打开 `http://localhost:3000`
   小程序用户：手机微信里打开小程序，登录时填服务器地址 `http://<这台电脑的局域网IP>:3000`

## 默认账号
| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 管理员 |
| zhangwei | 123456 | 仓管员 |
| lixiiufang | 123456 | 销售员 |

> 账号加在 `data/store.json` 的 `users` 里（密码用 `pwd.js` 的 hashPassword 生成），或用后台后续扩展。

## 局域网多人访问
- 服务器电脑查局域网 IP：`ipconfig` 看「IPv4 地址」，如 `192.168.1.100`
- 同一局域网的同事：浏览器开 `http://192.168.1.100:3000`；小程序登录地址填 `http://192.168.1.100:3000`
- 防火墙需放行 3000 端口（或用 `npm start` 前设置 `PORT=8080` 换端口）

## 微信小程序对接注意
- 开发阶段：微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」
- 正式发布：需 HTTPS 域名 + 小程序后台配置 request 合法域名
- 小程序 `app.js` 里 `baseUrl` 改成你的服务器地址

## 数据存储
- 数据在 `data/store.json`（单文件，免安装数据库）。备份即复制该文件。
- 每次写操作原子落盘（先写临时文件再 rename），断电不损坏。

## 接口一览
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录，返回 token |
| GET | /api/inventory | 库存列表 |
| POST | /api/inventory | 新增商品 |
| POST | /api/inventory/bulk | 批量上传商品 |
| POST | /api/operations/inbound | 入库 |
| POST | /api/operations/outbound | 销售出库 |
| POST | /api/operations/return | 退库 |
| POST | /api/operations/sync | 同步（更新同步时间） |
| GET | /api/records | 交易记录 |
| GET | /api/stats?range=daily\|monthly\|yearly | 统计 |
