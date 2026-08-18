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

// 退库（退货入回库）：回加到指定批次
function doReturn(state, body, req) {
  const lot = state.inventory.find(i => i.id === body.lotId)
  if (!lot) return { success: false, msg: '批次不存在，请重新选择' }
  const qty = parseInt(body.quantity)
  if (!qty || qty <= 0) return { success: false, msg: '退库数量无效' }
  lot.quantity += qty
  lot.lastUpdate = now()
  const orderNo = genOrderNo()
  state.records.unshift({
    id: orderNo, orderNo, type: 'return', itemId: lot.id, itemName: lot.name,
    quantity: qty, unit: lot.unit, price: lot.purchasePrice, priceType: 'purchase',
    totalAmount: (qty * lot.purchasePrice).toFixed(2),
    batchNo: lot.batchNo, spec: lot.spec, grossMargin: null,
    operator: body.operator || req.user.name, customer: body.customer || '',
    remark: (body.remark || '').trim() || '退货入回库',
    invoiceUrl: body.invoiceUrl || '', timestamp: now()
  })
  return { success: true, msg: '退库成功', orderNo, lot }
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

// 同步：更新同步时间（小程序点击“同步”时调用）
router.post('/sync', auth.authRequired, (req, res) => {
  const t = now()
  db.mutate({ fn: (state) => { state.meta.lastSyncTime = t; return { success: true } } })
  res.json({ success: true, time: t })
})

module.exports = router
