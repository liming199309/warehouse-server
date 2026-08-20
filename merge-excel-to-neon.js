// merge-excel-to-neon.js
// 安全合并：从 Neon 拉取云端最新 state → 追加 Excel 导入的 inventory/records → 推送回 Neon
// 不会覆盖云端已有的用户数据
try { require('dotenv').config() } catch (e) {}

const fs = require('fs')
const path = require('path')

const STORE_FILE = path.join(__dirname, 'data', 'store.json')
const STORE_BAK = STORE_FILE + '.pre-merge-bak'

// 本地刚导入 Excel 后的 store.json 包含：原有12条 + 133条Excel = 145条 inventory
// 云端最新：13条 inventory（比本地多1条，是用户今天白天录入的）
// 策略：从云端拉取最新 state，然后找出 Excel 导入的那 133 条（标记为 entryPerson="Excel导入"），
// 追加到云端 state 里，推回去。

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    console.error('[合并] 错误：.env 里没有 DATABASE_URL')
    process.exit(1)
  }

  const { Client } = require('pg')
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  await client.connect()
  console.log('[合并] 已连接 Neon')

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // 1. 拉取云端最新 state
  const res = await client.query('SELECT data FROM app_state WHERE id = 1')
  if (res.rows.length === 0) {
    console.error('[合并] 云端没有数据，请先运行 migrate-to-neon.js')
    await client.end()
    process.exit(1)
  }

  const cloudState = res.rows[0].data
  console.log('[合并] 云端现状：', {
    inventory: (cloudState.inventory || []).length,
    records: (cloudState.records || []).length,
    orders: (cloudState.orders || []).length,
    users: (cloudState.users || []).length
  })

  // 2. 读取本地刚导入 Excel 的 store.json
  const localState = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
  console.log('[合并] 本地数据：', {
    inventory: (localState.inventory || []).length,
    records: (localState.records || []).length
  })

  // 3. 提取 Excel 导入的记录（entryPerson === 'Excel导入'）
  const excelItems = (localState.inventory || []).filter(i => i.entryPerson === 'Excel导入')
  const excelRecords = (localState.records || []).filter(r => r.operator === 'Excel导入' && r.remark === 'Excel批量导入')
  console.log('[合并] Excel 导入条目：', {
    inventory: excelItems.length,
    records: excelRecords.length
  })

  // 4. 合并：Excel 数据追加到云端 state 的前面
  //    注意去重：如果云端已有同 name+batchNo 的记录就跳过（避免重复导入）
  const cloudKeys = new Set(
    (cloudState.inventory || []).map(i => `${i.name}|${i.batchNo || ''}|${i.company || ''}`)
  )
  let added = 0, skipped = 0
  const newItems = []
  for (const item of excelItems) {
    const key = `${item.name}|${item.batchNo || ''}|${item.company || ''}`
    if (cloudKeys.has(key)) {
      skipped++
      continue
    }
    newItems.push(item)
    added++
  }
  console.log(`[合并] 去重后：新增 ${added} 条，跳过已存在 ${skipped} 条`)

  // 同步过滤 records（只保留新增 inventory 对应的 records）
  const newItemIds = new Set(newItems.map(i => i.id))
  const newRecords = excelRecords.filter(r => newItemIds.has(r.itemId))

  // 合并
  const mergedState = JSON.parse(JSON.stringify(cloudState)) // 深拷贝云端 state
  mergedState.inventory = [...newItems, ...(mergedState.inventory || [])]
  mergedState.records = [...newRecords, ...(mergedState.records || [])]
  // users/orders/meta 保持云端原样不动
  console.log('[合并] 合并后：', {
    inventory: (mergedState.inventory || []).length,
    records: (mergedState.records || []).length,
    orders: (mergedState.orders || []).length,
    users: (mergedState.users || []).length
  })

  // 5. 备份本地 store.json
  fs.copyFileSync(STORE_FILE, STORE_BAK)
  console.log('[合并] 本地 store.json 已备份:', STORE_BAK)

  // 6. 写入云端
  await client.query(
    `UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1`,
    [JSON.stringify(mergedState)]
  )
  console.log('[合并] ✅ 已写入 Neon')

  // 7. 本地也更新为合并后的 state
  fs.writeFileSync(STORE_FILE, JSON.stringify(mergedState, null, 2), 'utf8')
  console.log('[合并] ✅ 本地 store.json 也已同步更新')

  await client.end()
  console.log('\n下一步：打开小程序刷新，应该能看到新导入的库存数据')
}

main().catch(e => {
  console.error('[合并] 失败：', e.message)
  process.exit(1)
})
