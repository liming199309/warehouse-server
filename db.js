// db.js - Neon Postgres 适配版（保持原 JSON 内存模型，业务代码 0 改动）
// 策略：把整个 state 序列化为 JSONB，存到 app_state 单行表里。
// 读：启动时一次性 load 到内存 state。
// 写：mutate 后整体 UPDATE 一次（带行锁保证并发安全）。
// 这样上层所有同步调用（getState/withLock/mutate）保持兼容，route 文件无需改动。

const fs = require('fs')
const path = require('path')
const { hashPassword } = require('./pwd')
const { buildSeed } = require('./seed')
const { DEFAULT_PERMS, ROLES } = require('./roles')

const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'store.json')
const TMP_FILE = path.join(DATA_DIR, 'store.tmp.json')

// 内存中保留 state 的旧接口
let state = null
let pgClient = null
let usePg = false

// 判断走 PG 还是本地 JSON
function shouldUsePg() {
  return !!process.env.DATABASE_URL
}

async function initPg() {
  if (!shouldUsePg()) return
  const { Pool } = require('pg')
  pgClient = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Neon 等云 PG 强制 SSL
    max: 5,                             // 连接池大小（足够 4 个并发请求 + 1 个写锁）
    idleTimeoutMillis: 30 * 1000,       // 30s 空闲后释放
    connectionTimeoutMillis: 10 * 1000, // 连不上 10s 超时
    statement_timeout: 20 * 1000,       // 单条 SQL 20s 超时
    keepAlive: true                     // 防止被中间网络设备掐断
  })
  // 关键：先做一次实测，确认真连得通（避免后端 listen 后第一次请求才触发 cold start）
  const c = await pgClient.connect()
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    await c.query('SELECT 1')
  } finally {
    c.release()
  }
  usePg = true
  console.log('[DB] 已连接 Postgres（连接池模式）')
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

// 本地文件落盘（仅当不用 PG 时）
function persistLocal(data) {
  ensureDir()
  const payload = JSON.stringify(data, null, 2)
  let lastErr
  for (let i = 0; i < 4; i++) {
    try {
      const fd = fs.openSync(DATA_FILE, 'w')
      try {
        fs.writeSync(fd, payload)
        try { fs.fsyncSync(fd) } catch (e) { /* 忽略 */ }
      } finally {
        fs.closeSync(fd)
      }
      return
    } catch (e) {
      lastErr = e
      if (i < 3) {
        const sleepMs = 60 * (i + 1)
        const until = Date.now() + sleepMs
        while (Date.now() < until) {}
      }
    }
  }
  throw new Error('数据持久化失败：' + (lastErr && lastErr.message))
}

// Postgres 落盘（行锁防并发）
async function persistPg(data) {
  const sql = `UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1`
  await pgClient.query(sql, [JSON.stringify(data)])
}

function persist(data) {
  if (usePg) {
    // 已迁移到 mutate/withLock 异步路径（见下方）—— 这里保留兼容但走异步
    persistPg(data).catch(e => { console.error('[DB] PG 写入失败:', e.message) })
  } else {
    persistLocal(data)
  }
}

function mkUser(username, name, pwd, roleKey, area, phone) {
  return {
    username, name, password: hashPassword(pwd),
    roleKey, role: ROLES[roleKey] ? ROLES[roleKey].name : roleKey,
    perms: DEFAULT_PERMS[roleKey] || [],
    area: area || '', phone: phone || '',
    status: 'active', createdAt: '', createdBy: 'system'
  }
}

function buildSeedData() {
  const { inventory, records } = buildSeed()
  return {
    inventory,
    records,
    orders: [],
    users: [
      mkUser('admin', '管理员', 'admin123', 'admin', '总部', ''),
      mkUser('zhangwei', '张伟', '123456', 'warehouse', '成品仓-01', '13800000001'),
      mkUser('lixiufang', '李秀芳', '123456', 'sales', '电商销售组', '13800000002'),
      mkUser('wangjingli', '王经理', '123456', 'manager', '总部管理', '13800000003'),
      mkUser('caiwu', '赵财务', '123456', 'finance', '财务部', '13800000004'),
      mkUser('fahuo', '陈发货', '123456', 'shipping', '发货组', '13800000005')
    ],
    meta: { lastSyncTime: '', nonceSeen: {} }
  }
}

function seedLocal() {
  const data = buildSeedData()
  persistLocal(data)
  return data
}

async function seedPg() {
  const data = buildSeedData()
  await pgClient.query(
    `INSERT INTO app_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(data)]
  )
  return data
}

function normalize(state) {
  const oldRoleMap = { '管理员': 'admin', '仓管员': 'warehouse', '销售员': 'sales' }
  const CATEGORY_MAP = { '鲜品': '原材料', '干品': '成品', '粉剂': '成品', '包装材料': '包材' }
  const CATEGORY_SET = ['原材料', '成品', '包材']
  state.users = (state.users || []).map(u => {
    if (!u.roleKey) u.roleKey = oldRoleMap[u.role] || 'sales'
    if (!ROLES[u.roleKey]) u.roleKey = 'sales'
    u.role = ROLES[u.roleKey].name
    if (!u.perms || !u.perms.length) u.perms = DEFAULT_PERMS[u.roleKey] || []
    if (!u.status) u.status = 'active'
    if (u.area === undefined) u.area = ''
    if (u.phone === undefined) u.phone = ''
    return u
  })
  if (!state.orders) state.orders = []
  if (!state.meta) state.meta = {}
  if (!state.meta.nonceSeen) state.meta.nonceSeen = {}
  if (!state.records) state.records = []
  if (!state.inventory) state.inventory = []
  const today = new Date().toISOString().slice(0, 10)
  state.inventory = state.inventory.map(it => {
    let cat = it.category
    if (cat && CATEGORY_MAP[cat]) cat = CATEGORY_MAP[cat]
    if (!cat || !CATEGORY_SET.includes(cat)) cat = '成品'
    let comp = it.company
    if (!comp) comp = '安徽牧龙山铁皮石斛生物科技有限公司'
    const purchasePrice = (it.purchasePrice != null) ? it.purchasePrice : (parseFloat(it.unitPrice) || 0)
    return {
      ...it,
      category: cat,
      company: comp,
      batchNo: it.batchNo || '',
      spec: it.spec || '',
      remark: it.remark || '',
      purchasePrice: purchasePrice,
      salePrice: (it.salePrice != null) ? it.salePrice : 0,
      inboundDate: it.inboundDate || (it.createTime || '').slice(0, 10) || (it.productionDate || '') || today
    }
  })
  state.records = (state.records || []).map(r => {
    const price = (r.price != null) ? r.price : (parseFloat(r.unitPrice) || 0)
    return {
      ...r,
      price: price,
      priceType: r.priceType || ((r.type === 'outbound' || r.type === 'return') ? 'sale' : 'purchase'),
      batchNo: r.batchNo || '',
      spec: r.spec || '',
      grossMargin: (r.grossMargin != null) ? r.grossMargin : null,
      invoiceUrl: r.invoiceUrl || ''
    }
  })
  return state
}

function loadLocal() {
  ensureDir()
  if (!fs.existsSync(DATA_FILE)) return seedLocal()
  try {
    const state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return normalize(state)
  } catch (e) {
    console.error('[DB] 数据文件损坏，已重新初始化:', e.message)
    return seedLocal()
  }
}

async function loadPg() {
  const r = await pgClient.query('SELECT data FROM app_state WHERE id = 1')
  if (r.rows.length === 0 || !r.rows[0].data) {
    return await seedPg()
  }
  return normalize(r.rows[0].data)
}

// 启动时调用：决定是走 PG 还是本地
async function bootstrap() {
  if (shouldUsePg()) {
    await initPg()
    state = await loadPg()
    console.log('[DB] 数据已从 Postgres 加载：', {
      inventory: state.inventory.length,
      records: state.records.length,
      users: state.users.length
    })
  } else {
    state = loadLocal()
    console.log('[DB] 数据已从本地 JSON 加载：', {
      inventory: state.inventory.length,
      records: state.records.length,
      users: state.users.length
    })
  }
}

// 串行写锁（Promise 链）
let lockChain = Promise.resolve()
function withLock(fn) {
  const result = lockChain.then(() => fn())
  lockChain = result.then(() => {}, () => {})
  return result
}

function getState() { return state }
function save() { persist(state) }

function pruneNonces(state) {
  const cutoff = Date.now() - 24 * 3600 * 1000
  const seen = state.meta.nonceSeen
  for (const k in seen) if (seen[k] < cutoff) delete seen[k]
}

// mutate 兼容：PG 模式下保证写完才返回
function mutate({ nonce, fn }) {
  if (usePg) {
    return withLock(async () => {
      if (nonce) {
        if (state.meta.nonceSeen[nonce]) {
          const e = new Error('请勿重复提交（系统已自动忽略重复操作）')
          e.duplicate = true
          throw e
        }
      }
      const out = fn(state)
      if (nonce && out && out.success !== false) {
        state.meta.nonceSeen[nonce] = Date.now()
        pruneNonces(state)
      }
      // 写库：等完成才返回上层
      await persistPg(state)
      return out
    })
  } else {
    return withLock(() => {
      if (nonce) {
        if (state.meta.nonceSeen[nonce]) {
          const e = new Error('请勿重复提交（系统已自动忽略重复操作）')
          e.duplicate = true
          throw e
        }
      }
      const out = fn(state)
      if (nonce && out && out.success !== false) {
        state.meta.nonceSeen[nonce] = Date.now()
        pruneNonces(state)
      }
      persistLocal(state)
      return out
    })
  }
}

module.exports = { getState, save, withLock, mutate, hashPassword, bootstrap, isPg: () => usePg }
