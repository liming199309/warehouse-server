const { Pool } = require('pg')
const crypto = require('crypto')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_4DdF9rNTpxOf@ep-raspy-star-azse4fmv-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
})

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  const a = Buffer.from(h, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const tests = [
  ['admin', 'admin123'],
  ['admin', '123456'],
  ['mls001', 'mls1234'],
  ['mls001', '123456'],
  ['wyh2026', '123456'],
  ['wyh2026', 'wyh123'],
  ['zyy2026', '123456'],
  ['qty2026', '123456'],
  ['zhk2026', '123456'],
  ['csh2026', '123456']
]

pool.query(`SELECT data->'users' as users FROM app_state WHERE id=1`).then(r => {
  const users = r.rows[0].users
  tests.forEach(([u, p]) => {
    const user = users.find(x => x.username === u)
    if (!user) { console.log(u, '/', p, '=> 用户不存在'); return }
    const ok = verifyPassword(p, user.password)
    console.log(u, '/', p, '=>', ok ? '✅ 通过' : '❌ 失败', '| name:', user.name)
  })
  pool.end()
}).catch(e => { console.error('ERR', e.message); pool.end() })
