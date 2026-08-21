const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')
const { genOrderNo, now } = require('../util')

function genLotId() {
  return 'LOT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
}

// 是否有价格查看权限
function hasPrice(req) {
  return !!(req.user.perms && req.user.perms.includes('price:view'))
}

// 价格脱敏：无权限时将价格相关字段置 null（前端据此隐藏）
function maskPrices(item, canView) {
  if (canView) return item
  return {
    ...item,
    purchasePrice: null,
    salePrice: null,
    costAmount: null,
    price: null
  }
}

// 批次列表（可按商品名模糊筛选，出库选批用；只返回有库存的批次，按入库时间升序=先进先出）
router.get('/lots', auth.authRequired, (req, res) => {
  const name = (req.query.name || '').trim().toLowerCase()
  let lots = db.getState().inventory.filter(i => i.quantity > 0)
  if (name) lots = lots.filter(i => (i.name || '').toLowerCase().includes(name))
  // 二级排序键 lastUpdate（精确到秒）+ createTime；同日入库也能区分先后
  lots.sort((a, b) => {
    const d = (a.inboundDate || '').localeCompare(b.inboundDate || '')
    if (d !== 0) return d
    const t = (a.lastUpdate || a.createTime || '').localeCompare(b.lastUpdate || b.createTime || '')
    return t !== 0 ? t : (a.createTime || '').localeCompare(b.createTime || '')
  })
  const canView = hasPrice(req)
  res.json({ success: true, lots: lots.map(l => maskPrices(l, canView)) })
})

// 库存列表
router.get('/', auth.authRequired, (req, res) => {
  const canView = hasPrice(req)
  res.json({ success: true, inventory: db.getState().inventory.map(i => maskPrices(i, canView)) })
})

// 单个批次
router.get('/:id', auth.authRequired, (req, res) => {
  const item = db.getState().inventory.find(i => i.id === req.params.id)
  if (!item) return res.status(404).json({ success: false, msg: '批次不存在' })
  const canView = hasPrice(req)
  res.json({ success: true, item: maskPrices(item, canView) })
})

// 新增批次（带一笔入库流水）
router.post('/', auth.authRequired, async (req, res) => {
  const body = req.body
  if (!body.name) return res.status(400).json({ success: false, msg: '商品名称必填' })
  try {
    const result = await db.mutate({
      nonce: body.nonce,
      fn: (state) => {
        const id = (body.itemId && !state.inventory.find(i => i.id === body.itemId)) ? body.itemId : genLotId()
        const item = {
          id, name: body.name, category: body.category || '未分类', company: body.company || '',
          unit: body.unit || '个', batchNo: body.batchNo || '', spec: body.spec || '', remark: body.remark || '',
          purchasePrice: parseFloat(body.purchasePrice) || 0, salePrice: parseFloat(body.salePrice) || 0,
          quantity: parseInt(body.quantity) || 0,
          inboundDate: (body.inboundDate || '').slice(0, 10) || now().slice(0, 10),
          productionDate: body.productionDate || '', shelfLife: body.shelfLife || '', expiryDate: body.expiryDate || '',
          supplier: body.supplier || '', location: body.location || '', entryPerson: body.entryPerson || req.user.name,
          createTime: now(), lastUpdate: now()
        }
        state.inventory.unshift(item)
        state.records.unshift({
          id: genOrderNo(), orderNo: genOrderNo(), type: 'inbound', itemId: id, itemName: item.name,
          quantity: item.quantity, unit: item.unit, price: item.purchasePrice, priceType: 'purchase',
          totalAmount: (item.quantity * item.purchasePrice).toFixed(2),
          batchNo: item.batchNo, spec: item.spec, operator: item.entryPerson, supplier: item.supplier,
          remark: '新增商品', invoiceUrl: '', timestamp: now()
        })
        return { success: true, item }
      }
    })
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

// 批量新增/更新（电脑后台一次性上传批次）
router.post('/bulk', auth.authRequired, async (req, res) => {
  let items = req.body.items
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, msg: '没有有效的数据' })
  try {
    const result = await db.mutate({
      nonce: req.body.nonce,
      fn: (state) => {
        let added = 0, updated = 0
        items.forEach(raw => {
          if (!raw.name) return
          const batchNo = raw.batchNo || ''
          const company = raw.company || ''
          const exist = state.inventory.find(i =>
            i.name === raw.name && (i.batchNo || '') === batchNo && (i.company || '') === company
          )
          const qty = parseInt(raw.quantity) || 0
          const price = parseFloat(raw.purchasePrice) || 0
          const targetId = exist ? exist.id : genLotId()
          if (exist) {
            exist.quantity += qty
            if (price) exist.purchasePrice = price
            if (raw.supplier) exist.supplier = raw.supplier
            if (raw.location) exist.location = raw.location
            if (raw.company) exist.company = raw.company
            if (raw.category) exist.category = raw.category
            if (raw.spec) exist.spec = raw.spec
            exist.lastUpdate = now()
            updated++
          } else {
            state.inventory.unshift({
              id: targetId, name: raw.name, category: raw.category || '未分类', company,
              unit: raw.unit || '个', batchNo, spec: raw.spec || '', remark: raw.remark || '',
              purchasePrice: price, salePrice: 0, quantity: qty,
              inboundDate: (raw.inboundDate || '').slice(0, 10) || now().slice(0, 10),
              productionDate: raw.productionDate || '', shelfLife: raw.shelfLife || '', expiryDate: raw.expiryDate || '',
              supplier: raw.supplier || '', location: raw.location || '', entryPerson: raw.entryPerson || req.user.name,
              createTime: now(), lastUpdate: now()
            })
            added++
          }
          state.records.unshift({
            id: genOrderNo(), orderNo: genOrderNo(), type: 'inbound', itemId: targetId,
            itemName: raw.name, quantity: qty, unit: raw.unit || '', price, priceType: 'purchase',
            totalAmount: (qty * price).toFixed(2), batchNo, spec: raw.spec || '',
            operator: raw.entryPerson || req.user.name, supplier: raw.supplier || '', remark: '批量录入', invoiceUrl: '', timestamp: now()
          })
        })
        return { success: true, added, updated, total: items.length }
      }
    })
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

module.exports = router
