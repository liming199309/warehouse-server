// server.js - 牧龙山石斛进销存后端服务（适配 Render + Neon + 钉钉免登）
// 启动前会加载 .env 文件（本地用），Render 部署时通过环境变量面板注入
try { require('dotenv').config() } catch (e) { /* dotenv 未装时也允许运行（Render 不需要） */ }

const express = require('express')
const cors = require('cors')
const path = require('path')

const authRoutes = require('./routes/auth')
const inventoryRoutes = require('./routes/inventory')
const operationRoutes = require('./routes/operations')
const recordsRoutes = require('./routes/records')
const statsRoutes = require('./routes/stats')
const usersRoutes = require('./routes/users')
const ordersRoutes = require('./routes/orders')
const uploadRoutes = require('./routes/upload')
const db = require('./db')

function build() {
  const app = express()
  const PORT = process.env.PORT || 3000

  app.use(cors()) // 允许小程序/网页跨域访问
  app.use(express.json({ limit: '20mb' }))

  app.use('/api/auth', authRoutes)
  app.use('/api/inventory', inventoryRoutes)
  app.use('/api/operations', operationRoutes)
  app.use('/api/records', recordsRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/users', usersRoutes)
  app.use('/api/orders', ordersRoutes)
  app.use('/api/upload', uploadRoutes)

  // Render 唯一可写目录是 /tmp，所以上传图片存到 /tmp
  const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.RENDER ? '/tmp/uploads' : path.join(__dirname, 'data', 'uploads'))
  if (!require('fs').existsSync(UPLOADS_DIR)) require('fs').mkdirSync(UPLOADS_DIR, { recursive: true })
  app.use('/uploads', express.static(UPLOADS_DIR))
  // 电脑端网页后台（静态文件）
  app.use(express.static(path.join(__dirname, 'public')))

  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now(), db: db.isPg() ? 'postgres' : 'json' }))

  return { app, PORT, UPLOADS_DIR }
}

async function start() {
  // 1) 初始化 DB（连 PG 或加载本地 JSON）
  await db.bootstrap()

  // 2) 把 build 后的 app 启起来
  const { app, PORT } = build()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[牧龙山石斛进销存] 后端已启动: http://localhost:${PORT}`)
    console.log(`[牧龙山石斛进销存] 电脑端后台: 浏览器打开 http://localhost:${PORT}`)
    console.log(`[牧龙山石斛进销存] 默认管理员账号 admin / admin123`)
    console.log(`[牧龙山石斛进销存] 数据库: ${db.isPg() ? 'Postgres' : '本地 JSON'}`)
  })
}

// 顶层启动入口
if (require.main === module) {
  start().catch(e => {
    console.error('[启动失败]', e)
    process.exit(1)
  })
}

module.exports = { build, start }
