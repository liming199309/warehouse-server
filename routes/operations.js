const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')
const { genOrderNo, now } = require('../util')

function genLotId() {
  return 'LOT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
}

// 入库：同一 (商品名 + 批号 + 所属公司) 视为同一批次，累加数量；否则新建批次(lot)
function doInbound(state, body, req) {
  const name = (body.name || '').trim()
  if (!name) return { success: false, msg: '请输入商品名称' }
  const qty = parseInt(body.quantity)
  if (!qty || qty <= 0) return { success: false, msg: '入库数量无效' }
  const purchasePrice = parseFloat(body.purchasePrice) || 0
  const batchNo = (body.batchNo || '').trim()
  const company = body.company || ''
  const category = body.category || '未分类'
  const unit = body.unit || '个'
  const spec = (body.spec || '').trim()
  const remark = (body.remark || '').trim()

  let lot = state.inventory.find(i =>
    i.name === name && (i.batchNo || '') === batchNo && (i.company || '') === company
  )
  if (lot) {
    lot.quantity += qty
    if (purchasePrice) lot.purchasePrice = purchasePrice
    if (spec) lot.spec = spec
    if (remark) lot.remark = remark
    if (body.supplier) lot.supplier = body.supplier
    if (body.location) lot.location = body.location
    if (category && category !== '未分类') lot.category = category
    if (unit) lot.unit = unit
    lot.lastUpdate = now()
  } else {
    lot = {
      id: (body.itemId && !state.inventory.find(i => i.id === body.itemId)) ? body.itemId : genLotId(),
      name, category, company, unit,
      batchNo, spec, remark,
      purchasePrice, salePrice: 0,
      quantity: qty,
      inboundDate: (body.inboundDate || '').slice(0, 10) || now().slice(0, 10),
      productionDate: body.productionDate || '',
      shelfLife: body.shelfLife || '',
      expiryDate: body.expiryDate || '',
      supplier: body.supplier || '',
      location: body.location || '',
      entryPerson: body.entryPerson || req.user.name,
      createTime: now(),
      lastUpdate: now()
    }
    state.inventory.unshift(lot)
  }
  const orderNo = genOrderNo()
  state.records.unshift({
    id: orderNo, orderNo, type: 'inbound', itemId: lot.id, itemName: name,
    quantity: qty, unit, price: purchasePrice, priceType: 'purchase',
    totalAmount: (qty * purchasePrice).toFixed(2),
    batchNo, spec, operator: body.operator || req.user.name,
    supplier: body.supplier || '', remark: remark || '采购入库',
    invoiceUrl: body.invoiceUrl || '', timestamp: now()
  })
  return { success: true, msg: '入库成功', orderNo, lot }
}

// 出库（销售）：必须选定具体批次(lotId)，按批次扣减；毛利率 = (售价 - 该批采购价) / 售价
function doOutbound(state, body, req) {
  const lot = state.inventory.find(i => i.id === body.lotId)
  if (!lot) return { success: false, msg: '批次不存在，请重新选择' }
  const qty = parseInt(body.quantity)
  if (!qty || qty <= 0) return { success: false, msg: '销售数量无效' }
  if (lot.quantity < qty) return { success: false, msg: `库存不足（当前 ${lot.quantity} ${lot.unit}）` }
  const salePrice = parseFloat(body.salePrice) || 0
  lot.quantity -= qty
  lot.lastUpdate = now()
  const grossMargin = (salePrice > 0)
    ? +(((salePrice - lot.purchasePrice) / salePrice) * 100).toFixed(1)
    : null
  const orderNo = genOrderNo()
  state.records.unshift({
    id: orderNo, orderNo, type: 'outbound', itemId: lot.id, itemName: lot.name,
    quantity: qty, unit: lot.unit, price: salePrice, priceType: 'sale',
    totalAmount: (qty * salePrice).toFixed(2),
    batchNo: lot.batchNo, spec: lot.spec, grossMargin,
    operator: body.operator || req.user.name, customer: body.customer || '',
    remark: (body.remark || '').trim() || '销售出库',
    invoiceUrl: body.invoiceUrl || '', timestamp: now()
  })
  return { success: true, msg: '销售出库成功', orderNo, lot }
}

// 退库：分两种类型
// returnType=sales：客户退货，匹配 outbound 订单，库存增加
// returnType=purchase：退给供应商，匹配 inbound 订单，库存扣减
function doReturn(state, body, req) {
  const returnType = body.returnType || 'sales'
  if (returnType !== 'sales' && returnType !== 'purchase') {
    return { success: false, msg: '退库类型无效' }
  }
  const orderNo = (body.orderNo || '').trim()
  if (!orderNo) return { success: false, msg: '请选择要匹配的原始订单' }
  const order = state.records.find(r => r.orderNo === orderNo && r.type === (returnType === 'sales' ? 'outbound' : 'inbound'))
  if (!order) return { success: false, msg: '未找到匹配的订单' }

  const lot = state.inventory.find(i => i.id === order.itemId)
  if (!lot) return { success: false, msg: '对应批次不存在' }

  const qty = parseInt(body.quantity)
  if (!qty || qty <= 0) return { success: false, msg: '退库数量无效' }

  const reason = (body.reason || '').trim()
  if (!reason) return { success: false, msg: '请填写退库理由' }

  // 计算该订单已退数量（同类型、同原始订单）
  const returnedQty = state.records
    .filter(r => r.type === 'return' && r.returnType === returnType && r.originalOrderNo === orderNo)
    .reduce((sum, r) => sum + parseInt(r.quantity || 0), 0)
  const maxQty = order.quantity - returnedQty
  if (qty > maxQty) return { success: false, msg: `最多可退 ${maxQty} ${order.unit}（已退 ${returnedQty}）` }

  if (returnType === 'sales') {
    lot.quantity += qty
  } else {
    if (lot.quantity < qty) return { success: false, msg: `库存不足，无法退给供应商（当前 ${lot.quantity} ${lot.unit}）` }
    lot.quantity -= qty
  }
  lot.lastUpdate = now()

  const price = parseFloat(order.price) || (returnType === 'sales' ? lot.purchasePrice : 0)
  const newOrderNo = genOrderNo()
  const remarkExtra = (body.remark || '').trim()
  state.records.unshift({
    id: newOrderNo, orderNo: newOrderNo, type: 'return', returnType,
    originalOrderNo: orderNo,
    itemId: lot.id, itemName: lot.name,
    quantity: qty, unit: lot.unit, price, priceType: returnType === 'sales' ? 'sale' : 'purchase',
    totalAmount: (qty * price).toFixed(2),
    batchNo: lot.batchNo, spec: lot.spec, grossMargin: null,
    operator: body.operator || req.user.name,
    customer: returnType === 'sales' ? (order.customer || '') : '',
    supplier: returnType === 'purchase' ? (order.supplier || '') : '',
    reason, remark: reason + (remarkExtra ? ' | ' + remarkExtra : ''),
    invoiceUrl: body.invoiceUrl || '', timestamp: now()
  })
  return { success: true, msg: '退库成功', orderNo: newOrderNo, lot }
}

router.post('/inbound', auth.authRequired, async (req, res) => {
  try { res.json(await db.mutate({ nonce: req.body.nonce, fn: (s) => doInbound(s, req.body, req) })) }
  catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

router.post('/outbound', auth.authRequired, async (req, res) => {
  try { res.json(await db.mutate({ nonce: req.body.nonce, fn: (s) => doOutbound(s, req.body, req) })) }
  catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

router.post('/return', auth.authRequired, async (req, res) => {
  try { res.json(await db.mutate({ nonce: req.body.nonce, fn: (s) => doReturn(s, req.body, req) })) }
  catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

// 查询可匹配的历史订单（退库用）
// type=outbound | inbound；keyword 匹配商品名/批号/公司
router.get('/orders', auth.authRequired, (req, res) => {
  const type = req.query.type
  const keyword = (req.query.keyword || '').trim().toLowerCase()
  const name = (req.query.name || '').trim().toLowerCase()
  if (type !== 'outbound' && type !== 'inbound') {
    return res.status(400).json({ success: false, msg: 'type 必须是 outbound 或 inbound' })
  }
  let records = db.getState().records.filter(r => r.type === type)
  // 同订单号可能对应多条（理论上不应出现），按订单号去重取最新
  const seen = new Map()
  records.forEach(r => {
    const existing = seen.get(r.orderNo)
    if (!existing || r.timestamp > existing.timestamp) seen.set(r.orderNo, r)
  })
  records = Array.from(seen.values())
  if (name || keyword) {
    const kw = name || keyword
    records = records.filter(r =>
      (r.itemName || '').toLowerCase().includes(kw) ||
      (r.batchNo || '').toLowerCase().includes(kw) ||
      (r.customer || '').toLowerCase().includes(kw) ||
      (r.supplier || '').toLowerCase().includes(kw)
    )
  }
  // 计算每个订单已退数量
  const state = db.getState()
  records.forEach(r => {
    const rt = type === 'outbound' ? 'sales' : 'purchase'
    r.returnedQty = state.records
      .filter(x => x.type === 'return' && x.returnType === rt && x.originalOrderNo === r.orderNo)
      .reduce((sum, x) => sum + parseInt(x.quantity || 0), 0)
    r.returnableQty = Math.max(0, r.quantity - r.returnedQty)
  })
  records.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  res.json({ success: true, orders: records })
})

// 同步：更新同步时间（小程序点击“同步”时调用）
router.post('/sync', auth.authRequired, (req, res) => {
  const t = now()
  db.mutate({ fn: (state) => { state.meta.lastSyncTime = t; return { success: true } } })
  res.json({ success: true, time: t })
})

module.exports = router