const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')

// 交易记录（可按类型/商品过滤）
router.get('/', auth.authRequired, (req, res) => {
  const { type, itemId } = req.query
  const canViewPrice = !!(req.user.perms && req.user.perms.includes('price:view'))
  const invMap = {}
  db.getState().inventory.forEach(i => { invMap[i.id] = i })
  let records = db.getState().records.map(r => {
    const base = {
      ...r,
      unit: r.unit || (invMap[r.itemId] && invMap[r.itemId].unit) || '',
      company: r.company || (invMap[r.itemId] && invMap[r.itemId].company) || '',
      batchNo: r.batchNo || '',
      spec: r.spec || '',
      invoiceUrl: r.invoiceUrl || ''
    }
    if (canViewPrice) {
      base.price = (r.price != null) ? r.price : 0
      base.priceType = r.priceType || ((r.type === 'outbound' || r.type === 'return') ? 'sale' : 'purchase')
      base.grossMargin = (r.grossMargin != null) ? r.grossMargin : null
      base.totalAmount = r.totalAmount
    } else {
      base.price = null
      base.priceType = r.priceType || ((r.type === 'outbound' || r.type === 'return') ? 'sale' : 'purchase')
      base.grossMargin = null
      base.totalAmount = null
    }
    return base
  })
  if (type && type !== 'all') records = records.filter(r => r.type === type)
  if (itemId) records = records.filter(r => r.itemId === itemId)
  res.json({ success: true, records, lastSyncTime: db.getState().meta.lastSyncTime })
})

module.exports = router
