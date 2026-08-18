const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')

// 按日/月/年统计 + 库存总览
router.get('/', auth.authRequired, (req, res) => {
  const { range = 'daily' } = req.query
  const state = db.getState()
  const groups = {}

  state.records.forEach(r => {
    const d = new Date(String(r.timestamp).replace(/-/g, '/'))
    let key
    const p = x => String(x).padStart(2, '0')
    if (range === 'monthly') key = `${d.getFullYear()}-${p(d.getMonth() + 1)}`
    else if (range === 'yearly') key = String(d.getFullYear())
    else key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`

    if (!groups[key]) groups[key] = { key, inboundQty: 0, outboundQty: 0, returnQty: 0, inboundAmt: 0, outboundAmt: 0, returnAmt: 0 }
    const amt = parseFloat(r.totalAmount) || 0
    if (r.type === 'inbound') { groups[key].inboundQty += r.quantity; groups[key].inboundAmt += amt }
    else if (r.type === 'outbound') { groups[key].outboundQty += r.quantity; groups[key].outboundAmt += amt }
    else if (r.type === 'return') { groups[key].returnQty += r.quantity; groups[key].returnAmt += amt }
  })

  const list = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))

  let totalItems = state.inventory.length
  let totalQuantity = 0
  let totalAmount = 0
  state.inventory.forEach(it => {
    totalQuantity += it.quantity || 0
    totalAmount += (it.quantity || 0) * (it.purchasePrice || 0)
  })

  res.json({
    success: true,
    stats: list,
    summary: {
      totalItems,
      totalQuantity,
      totalAmount: totalAmount.toFixed(2),
      inboundQty: list.reduce((s, g) => s + g.inboundQty, 0),
      outboundQty: list.reduce((s, g) => s + g.outboundQty, 0),
      inboundAmt: list.reduce((s, g) => s + g.inboundAmt, 0).toFixed(2),
      outboundAmt: list.reduce((s, g) => s + g.outboundAmt, 0).toFixed(2)
    },
    lastSyncTime: state.meta.lastSyncTime
  })
})

module.exports = router
