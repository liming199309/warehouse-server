// auth.js - 登录鉴权（Token = base64url(payload).HMAC-SHA256，无外部依赖）
const crypto = require('crypto')
const db = require('./db')
const { verifyPassword } = require('./pwd')
const { DEFAULT_PERMS, ROLES } = require('./roles')

const SECRET = process.env.JWT_SECRET || 'mulongshan-warehouse-secret-2026'
const EXPIRE = 7 * 24 * 3600 * 1000 // 7 天

// 生成一次性会话标记（单设备登录用）
function genSid() { return crypto.randomBytes(16).toString('hex') }

function signToken(user) {
  const payload = {
    username: user.username, name: user.name, role: user.role, roleKey: user.roleKey,
    perms: user.perms, sid: user.sid || '', exp: Date.now() + EXPIRE
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  if (sig !== expected) return null
  let payload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()) } catch { return null }
  if (!payload.exp || payload.exp < Date.now()) return null
  return payload
}

// 每次请求实时查库：离职禁用账号立即失效、权限变更立即生效
// 单设备登录：token 里的 sid 必须与数据库当前 sid 一致，否则判定被其他设备顶下线
function authRequired(req, res, next) {
  const header = req.headers['authorization'] || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  const payload = verifyToken(token)
  if (!payload) return res.status(401).json({ success: false, msg: '登录已过期，请重新登录' })
  const user = db.getState().users.find(u => u.username === payload.username)
  if (!user || user.status === 'disabled') return res.status(403).json({ success: false, msg: '账号已被禁用，请联系管理员' })
  // 单设备校验：新登录会更新 user.sid，旧 token 的 sid 不再匹配 → 视为已被顶下线
  if (user.sid && payload.sid !== user.sid) {
    return res.status(401).json({ success: false, msg: '您的账号已在其他设备登录，请重新登录', kicked: true })
  }
  const roleKey = user.roleKey || 'sales'
  const perms = (user.perms && user.perms.length) ? user.perms : (DEFAULT_PERMS[roleKey] || [])
  req.user = { ...payload, roleKey, name: user.name, role: ROLES[roleKey] ? ROLES[roleKey].name : user.role, perms }
  next()
}

// 权限检查中间件工厂
function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user.perms || !req.user.perms.includes(perm)) return res.status(403).json({ success: false, msg: '无权限：需要「' + perm + '」' })
    next()
  }
}

function login(username, password) {
  const state = db.getState()
  const user = state.users.find(u => u.username === username)
  if (!user || !verifyPassword(password, user.password)) return null
  if (user.status === 'disabled') return null
  const roleKey = user.roleKey || 'sales'
  const perms = (user.perms && user.perms.length) ? user.perms : (DEFAULT_PERMS[roleKey] || [])
  return { username: user.username, name: user.name, role: ROLES[roleKey] ? ROLES[roleKey].name : user.role, roleKey, perms, area: user.area || '' }
}

module.exports = { signToken, verifyToken, authRequired, requirePerm, login, genSid }
