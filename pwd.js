// pwd.js - 密码哈希（Node 内置 crypto，无外部依赖）
const crypto = require('crypto')

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  const a = Buffer.from(h, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

module.exports = { hashPassword, verifyPassword }
