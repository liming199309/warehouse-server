// users.js - 人员管理（仅管理员）：列表/新增/编辑/禁用(离职)/启用/删除
const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')
const { ROLES, DEFAULT_PERMS } = require('../roles')
const { hashPassword } = require('../pwd')
const { now } = require('../util')

function safeUser(u) {
  if (!u) return null
  const { password, ...rest } = u
  return rest
}

// 列表（仅管理员）
router.get('/', auth.authRequired, auth.requirePerm('user:manage'), (req, res) => {
  const users = db.getState().users.map(safeUser)
  res.json({ success: true, users })
})

// 创建（管理员）
router.post('/', auth.authRequired, auth.requirePerm('user:manage'), async (req, res) => {
  const { username, name, password, roleKey, area, phone, perms } = req.body
  if (!username || !name || !password) return res.status(400).json({ success: false, msg: '账号/姓名/密码必填' })
  if (!ROLES[roleKey]) return res.status(400).json({ success: false, msg: '角色无效' })
  try {
    const result = await db.mutate({
      fn: (state) => {
        if (state.users.find(u => u.username === username)) return { success: false, msg: '该账号已存在' }
        const user = {
          username, name, password: hashPassword(password),
          roleKey, role: ROLES[roleKey].name,
          perms: (perms && perms.length) ? perms : (DEFAULT_PERMS[roleKey] || {}),
          area: area || '', phone: phone || '',
          status: 'active', createdAt: now(), createdBy: req.user.username
        }
        state.users.push(user)
        return { success: true, user: safeUser(user) }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// 更新（管理员）：姓名/区域/角色/权限/密码(可选)
router.put('/:username', auth.authRequired, auth.requirePerm('user:manage'), async (req, res) => {
  const { name, area, phone, roleKey, perms, password } = req.body
  try {
    const result = await db.mutate({
      fn: (state) => {
        const u = state.users.find(x => x.username === req.params.username)
        if (!u) return { success: false, msg: '用户不存在' }
        if (name) u.name = name
        if (area !== undefined) u.area = area
        if (phone !== undefined) u.phone = phone
        if (roleKey && ROLES[roleKey]) { u.roleKey = roleKey; u.role = ROLES[roleKey].name }
        if (perms && perms.length) u.perms = perms
        if (password) u.password = hashPassword(password)
        return { success: true, user: safeUser(u) }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// 禁用（离职）：禁止登录
router.post('/:username/disable', auth.authRequired, auth.requirePerm('user:manage'), async (req, res) => {
  if (req.params.username === req.user.username) return res.status(400).json({ success: false, msg: '不能禁用自己' })
  try {
    const result = await db.mutate({
      fn: (state) => {
        const u = state.users.find(x => x.username === req.params.username)
        if (!u) return { success: false, msg: '用户不存在' }
        u.status = 'disabled'; u.disabledAt = now()
        return { success: true, user: safeUser(u) }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// 启用
router.post('/:username/enable', auth.authRequired, auth.requirePerm('user:manage'), async (req, res) => {
  try {
    const result = await db.mutate({
      fn: (state) => {
        const u = state.users.find(x => x.username === req.params.username)
        if (!u) return { success: false, msg: '用户不存在' }
        u.status = 'active'; u.disabledAt = ''
        return { success: true, user: safeUser(u) }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// 删除（彻底移除，禁止登录）
router.delete('/:username', auth.authRequired, auth.requirePerm('user:manage'), async (req, res) => {
  if (req.params.username === req.user.username) return res.status(400).json({ success: false, msg: '不能删除自己' })
  try {
    const result = await db.mutate({
      fn: (state) => {
        const i = state.users.findIndex(x => x.username === req.params.username)
        if (i < 0) return { success: false, msg: '用户不存在' }
        const [removed] = state.users.splice(i, 1)
        return { success: true, removed: safeUser(removed) }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

module.exports = router
