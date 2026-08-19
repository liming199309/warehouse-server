// migrate-to-neon.js - 把本地 data/store.json 的真实数据一键迁移到 Neon Postgres
// 用法：
//   1. 把 Neon 的 connection string 填到 .env 的 DATABASE_URL= 后面
//   2. 运行：node migrate-to-neon.js
// 安全：会先把云端已有数据打印出来让你确认，加 --force 才直接覆盖
try { require('dotenv').config() } catch (e) { /* Render 上不需要 dotenv */ }

const fs = require('fs')
const path = require('path')

const LOCAL_FILE = path.join(__dirname, 'data', 'store.json')

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    console.error('[迁移] 错误：请先在 .env 里填 DATABASE_URL（Neon 的 connection string）')
    process.exit(1)
  }
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error('[迁移] 错误：找不到本地数据文件 ' + LOCAL_FILE)
    process.exit(1)
  }

  const localData = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
  console.log('[迁移] 本地数据概况：', {
    inventory: (localData.inventory || []).length,
    records: (localData.records || []).length,
    orders: (localData.orders || []).length,
    users: (localData.users || []).length
  })

  const { Client } = require('pg')
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  await client.connect()
  console.log('[迁移] 已连接 Neon')

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // 看云端现状
  const existing = await client.query('SELECT data, updated_at FROM app_state WHERE id = 1')
  if (existing.rows.length > 0) {
    const cloud = existing.rows[0].data || {}
    console.log('[迁移] 云端已有数据：', {
      inventory: (cloud.inventory || []).length,
      records: (cloud.records || []).length,
      orders: (cloud.orders || []).length,
      users: (cloud.users || []).length,
      updated_at: existing.rows[0].updated_at
    })
    if (!process.argv.includes('--force')) {
      console.log('[迁移] 云端已有数据，未覆盖。确认要用本地数据覆盖云端的话，运行：node migrate-to-neon.js --force')
      await client.end()
      return
    }
    console.log('[迁移] --force 模式，将用本地数据覆盖云端')
  }

  await client.query(
    `INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(localData)]
  )
  await client.end()
  console.log('[迁移] ✅ 完成！本地数据已写入 Neon。现在打开 Render 的网址验证：/api/health 应显示 db:"postgres"')
}

main().catch(e => {
  console.error('[迁移] 失败：', e.message)
  process.exit(1)
})
