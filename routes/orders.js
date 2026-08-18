// orders.js - 订单审核工作流（销售申请→管理审→财务审→仓库备货→发货）
const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')
const { ORDER_STATUS } = require('../roles')
const { genOrderNo, now } = require('../util')

function visibleOrders(state, user) {
  let list = state.orders
  if (user.roleKey === 'sales') list = list.filter(o => o.createdBy === user.username)
  return list
}

// 列表（按角色可见范围 + 状态筛选）
router.get('/', auth.authRequired, auth.requirePerm('order:view'), (req, res) => {
  const state = db.getState()
  let list = visibleOrders(state, req.user)
  const status = req.query.status
  if (status && status !== 'all') list = list.filter(o => o.status === status)
  list = list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ success: true, orders: list, statusDef: ORDER_STATUS })
})

// 详情
router.get('/:id', auth.authRequired, auth.requirePerm('order:view'), (req, res) => {
  const order = db.getState().orders.find(o => o.id === req.params.id)
  if (!order) return res.status(404).json({ success: false, msg: '订单不存在' })
  res.json({ success: true, order })
})

// 创建（销售申请订单/出库）
router.post('/', auth.authRequired, auth.requirePerm('order:create'), async (req, res) => {
  const { items, customer, note, nonce } = req.body
  if (!items || !items.length) return res.status(400).json({ success: false, msg: '请选择商品' })
  try {
    const result = await db.mutate({
      nonce,
      fn: (state) => {
        const orderItems = []
        for (const it of items) {
          const inv = state.inventory.find(i => i.id === it.itemId)
          if (!inv) return { success: false, msg: '商品不存在: ' + it.itemId }
          const qty = parseInt(it.quantity)
          if (!qty || qty <= 0) return { success: false, msg: '数量无效: ' + (inv.name || it.itemId) }
          orderItems.push({ itemId: inv.id, itemName: inv.name, unit: inv.unit, quantity: qty, unitPrice: inv.unitPrice, amount: (qty * inv.unitPrice).toFixed(2) })
        }
        const total = orderItems.reduce((s, x) => s + parseFloat(x.amount), 0).toFixed(2)
        const id = genOrderNo()
        const order = {
          id, orderNo: id, items: orderItems, customer: customer || '', note: note || '',
          totalAmount: total, status: 'pending', createdBy: req.user.username, createdByName: req.user.name,
          createdAt: now(),
          trail: [{ action: 'create', by: req.user.name, role: req.user.roleKey, time: now(), note: note || '' }]
        }
        state.orders.unshift(order)
        return { success: true, order }
      }
    })
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

// 审核（管理/财务）
router.post('/:id/audit', auth.authRequired, async (req, res) => {
  const step = req.body.step // 'manager' | 'finance'
  if (step === 'manager' && !req.user.perms.includes('order:audit_manager')) return res.status(403).json({ success: false, msg: '无管理审核权限' })
  if (step === 'finance' && !req.user.perms.includes('order:audit_finance')) return res.status(403).json({ success: false, msg: '无财务审核权限' })
  const action = req.body.action // 'pass' | 'reject'
  const note = req.body.note || ''
  try {
    const result = await db.mutate({
      nonce: req.body.nonce,
      fn: (state) => {
        const order = state.orders.find(o => o.id === req.params.id)
        if (!order) return { success: false, msg: '订单不存在' }
        const expected = step === 'manager' ? 'pending' : 'manager_approved'
        if (order.status !== expected) return { success: false, msg: `当前状态「${ORDER_STATUS[order.status].name}」不能进行${step === 'manager' ? '管理' : '财务'}审核` }
        if (action === 'reject') {
          order.status = 'rejected'
          order.trail.push({ action: 'reject_' + step, by: req.user.name, role: req.user.roleKey, time: now(), note })
        } else {
          order.status = step === 'manager' ? 'manager_approved' : 'finance_approved'
          order.trail.push({ action: 'audit_' + step, by: req.user.name, role: req.user.roleKey, time: now(), note })
        }
        return { success: true, order }
      }
    })
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

// 备货打包（仓库，上传货好照片）
router.post('/:id/pack', auth.authRequired, auth.requirePerm('order:pack'), async (req, res) => {
  const { photos, note } = req.body
  try {
    const result = await db.mutate({
      nonce: req.body.nonce,
      fn: (state) => {
        const order = state.orders.find(o => o.id === req.params.id)
        if (!order) return { success: false, msg: '订单不存在' }
        if (order.status !== 'finance_approved' && order.status !== 'packed' && order.status !== 'stock_short') return { success: false, msg: '当前状态不可备货' }
        order.status = 'packed'
        order.packPhotos = (order.packPhotos || []).concat(photos || [])
        order.trail.push({ action: 'pack', by: req.user.name, role: req.user.roleKey, time: now(), note: note || '' })
        return { success: true, order }
      }
    })
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

// 发货（发货人员，上传快递单号+照片），实际扣库存并写销售流水
router.post('/:id/ship', auth.authRequired, auth.requirePerm('order:ship'), async (req, res) => {
  const { trackingNo, shipPhoto, note } = req.body
  if (!trackingNo) return res.status(400).json({ success: false, msg: '请填写快递单号' })
  try {
    const result = await db.mutate({
      nonce: req.body.nonce,
      fn: (state) => {
        const order = state.orders.find(o => o.id === req.params.id)
        if (!order) return { success: false, msg: '订单不存在' }
        if (order.status !== 'packed') return { success: false, msg: '请先完成备货打包' }
        // 先校验库存是否充足（原子内）
        for (const it of order.items) {
          const inv = state.inventory.find(i => i.id === it.itemId)
          if (!inv || inv.quantity < it.quantity) return { success: false, msg: `库存不足：${it.itemName}（需 ${it.quantity}${it.unit}，现有 ${inv ? inv.quantity : 0}${inv ? inv.unit : ''}）` }
        }
        // 扣库存 + 写销售流水
        for (const it of order.items) {
          const inv = state.inventory.find(i => i.id === it.itemId)
          inv.quantity -= it.quantity
          inv.lastUpdate = now()
          state.records.unshift({
            id: genOrderNo(), orderNo: order.orderNo, type: 'outbound',
            itemId: inv.id, itemName: inv.name, quantity: it.quantity, unit: inv.unit,
            unitPrice: inv.unitPrice, totalAmount: (it.quantity * inv.unitPrice).toFixed(2),
            operator: req.user.name, customer: order.customer, remark: '订单发货-' + order.orderNo, timestamp: now()
          })
        }
        order.status = 'done'
        order.trackingNo = trackingNo
        if (shipPhoto) order.shipPhoto = shipPhoto
        order.trail.push({ action: 'ship', by: req.user.name, role: req.user.roleKey, time: now(), note: note || ('快递单号:' + trackingNo) })
        return { success: true, order }
      }
    })
    if (!result.success) return res.status(409).json(result)
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

module.exports = router
