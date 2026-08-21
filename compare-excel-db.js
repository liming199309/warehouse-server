// compare-excel-db.js - 对比 Excel 全量行 vs Neon 云端 inventory，找出缺失
const fs = require('fs')
const path = require('path')

// 读 .env 拿 DATABASE_URL
function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) { console.error('无 .env'); process.exit(1) }
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
}
loadEnv()

const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const excelRows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tmp_scripts', 'excel_all_rows.json'), 'utf8'))

async function main() {
  const r = await pool.query('SELECT data FROM app_state WHERE id = 1')
  const state = r.rows[0].data
  console.log('云端 inventory 总数:', state.inventory.length)
  console.log('云端 records 总数:', state.records.length)
  console.log('云端 users 总数:', state.users.length)

  // Excel 有效行（有名称、非合计/制表行）——不管有没有库存
  const valid = []
  for (const cat of ['原材料', '成品']) {
    for (const row of excelRows[cat]) {
      if (!row.name || !row.code) continue
      if (row.warehouse.includes('合计') || row.warehouse.includes('制表')) continue
      if (row.spec.includes('第') && row.spec.includes('页')) continue
      valid.push({ ...row, cat })
    }
  }
  console.log('\nExcel 全部有效商品行（含零/负库存）:', valid.length)

  // 云端按 batchNo（=ERP存货编码）建索引
  const dbByCode = {}
  const dbByName = {}
  state.inventory.forEach(it => {
    if (it.batchNo) (dbByCode[it.batchNo] = dbByCode[it.batchNo] || []).push(it)
    ;(dbByName[it.name] = dbByName[it.name] || []).push(it)
  })

  const missing = []
  const matched = []
  for (const row of valid) {
    const hitByCode = (dbByCode[row.code] || []).length
    const hitByName = (dbByName[row.name] || []).length
    if (hitByCode > 0) {
      matched.push({ row, how: 'code', qty: dbByCode[row.code][0].quantity })
    } else if (hitByName > 0) {
      matched.push({ row, how: 'name', qty: dbByName[row.name][0].quantity })
    } else {
      missing.push(row)
    }
  }
  console.log('已入库:', matched.length, ' 未入库:', missing.length)
  console.log('\n===== 未入库明细 =====')
  missing.forEach(m => console.log(`  [${m.cat}] 行${m.row} | ${m.code} | ${m.name} | 规格:${m.spec} | 单位:${m.unit} | 现存量:${m.qty}`))

  // 反向：云端有但 Excel 没有的（Excel导入的条目里 batchNo 前缀 ERP- 的数量）
  const excelCodes = new Set(valid.map(v => v.code))
  const excelNames = new Set(valid.map(v => v.name))
  const extra = state.inventory.filter(it => !excelCodes.has(it.batchNo) && !excelNames.has(it.name))
  console.log('\n===== 云端有但 Excel 无的条目（原有/手工录入）:', extra.length, '=====')
  extra.forEach(it => console.log(`  ${it.batchNo || '-'} | ${it.name} | ${it.quantity} ${it.unit} | entryPerson:${it.entryPerson || ''}`))

  await pool.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
