const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_4DdF9rNTpxOf@ep-raspy-star-azse4fmv-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
})
pool.query(`SELECT data->'users' as users FROM app_state WHERE id=1`).then(r => {
  const users = r.rows[0].users
  users.forEach(u => {
    console.log(u.username, '|', u.name, '|', u.roleKey, '|', u.status, '|', (u.password || '').length, 'chars |', (u.password || '').slice(0, 12))
  })
  pool.end()
}).catch(e => { console.error('ERR', e.message); pool.end() })
