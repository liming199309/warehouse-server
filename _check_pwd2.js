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

// 中文姓名 -> 拼音首字母（简单映射，覆盖常见姓氏）
const pinyinMap = {
  '吴': 'w', '云': 'y', '海': 'h',
  '赵': 'z', '原': 'y', '野': 'y',
  '秦': 'q', '天': 't', '宇': 'y',
  '张': 'z', '华': 'h', '坤': 'k',
  '余': 'y', '英': 'y',
  '祖': 'z', '冬': 'd', '银': 'y',
  '葛': 'g', '静': 'j',
  '管': 'g', '理': 'l', '员': 'y',
  '测': 'c', '试': 's', '号': 'h',
  '小': 'x',
  '新': 'x', '账': 'z',
  '李': 'l', '秀': 'x', '芳': 'f',
  '王': 'w', '经': 'j',
  '陈': 'c', '发': 'f'
}

function getInitials(name) {
  return name.split('').map(c => pinyinMap[c] || '').join('')
}

pool.query(`SELECT data->'users' as users FROM app_state WHERE id=1`).then(r => {
  const users = r.rows[0].users
  console.log('=== 测试「姓名首字母+123」密码规则 ===\n')
  users.forEach(u => {
    const initials = getInitials(u.name)
    const testPwd = initials + '123'
    const ok = verifyPassword(testPwd, u.password)
    console.log(`${u.username} | ${u.name} | 首字母:${initials} | 密码:${testPwd} | ${ok ? '✅' : '❌'}`)
  })
  
  console.log('\n=== 也试试其他可能的规则 ===')
  // 试试 wyh123 这种格式（用户名去掉数字部分+123）
  users.forEach(u => {
    const base = u.username.replace(/\d+$/, '')
    const testPwd = base + '123'
    const ok = verifyPassword(testPwd, u.password)
    if (ok) console.log(`${u.username} | 密码规则:用户名去数字+123 => ${testPwd} ✅`)
  })
  
  // 试试用户名本身作为密码
  users.forEach(u => {
    const ok = verifyPassword(u.username, u.password)
    if (ok) console.log(`${u.username} | 密码=用户名 ✅`)
  })
  
  pool.end()
}).catch(e => { console.error('ERR', e.message); pool.end() })
