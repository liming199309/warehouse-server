// seed.js - 初始演示数据（首次启动写入，可被后台批量覆盖）
// 安徽牧龙山铁皮石斛生物科技开发有限公司 - 进销存
// 模型：库存「一批次一行(lot)」，同一商品不同批号 = 多行
// 品类：原材料 / 成品 / 包材；所属公司仓库见 COMPANY 常量

const { genOrderNo, now } = require('./util')

const COMPANY = {
  MULONGSHAN: '安徽牧龙山铁皮石斛生物科技有限公司',
  HUXIAOXIAN: '安徽斛小鲜健康科技有限公司',
  HUOSHAN: '安徽霍山霍金石斛开发有限公司',
  JIANGMEN: '江门市斛小鲜陈皮健康产业有限公司'
}

function lot(id, name, category, company, unit, batchNo, spec, purchasePrice, quantity, extra = {}) {
  return {
    id, name, category, company, unit, batchNo, spec,
    remark: extra.remark || '',
    purchasePrice, salePrice: extra.salePrice || 0,
    quantity,
    inboundDate: extra.inboundDate || '2026-08-16',
    productionDate: extra.productionDate || '',
    shelfLife: extra.shelfLife || '',
    expiryDate: extra.expiryDate || '',
    supplier: extra.supplier || '',
    location: extra.location || '',
    entryPerson: extra.entryPerson || '系统',
    createTime: extra.createTime || '2026-08-16 08:00:00',
    lastUpdate: extra.lastUpdate || now()
  }
}

function buildInventory() {
  return [
    lot('SP001', '铁皮石斛鲜条', '原材料', COMPANY.MULONGSHAN, '公斤', 'MLS-20260801', '一级鲜条', 380, 60, { supplier: '牧龙山自有种植基地', location: '冷藏-01', inboundDate: '2026-08-16' }),
    lot('SP001-2', '铁皮石斛鲜条', '原材料', COMPANY.MULONGSHAN, '公斤', 'MLS-20260720', '二级鲜条', 360, 25, { supplier: '牧龙山自有种植基地', location: '冷藏-01', inboundDate: '2026-07-20' }),
    lot('SP002', '铁皮石斛枫斗（特级）', '成品', COMPANY.MULONGSHAN, '克', 'FT-20260801', '特级', 12, 4600, { supplier: '加工车间自产', location: '成品-01-01' }),
    lot('SP003', '铁皮石斛花（干花）', '成品', COMPANY.MULONGSHAN, '克', 'HH-20260709', '一级干花', 6.5, 3200, { supplier: '霍山石斛合作社', location: '成品-01-02' }),
    lot('SP004', '铁皮石斛超微粉', '成品', COMPANY.HUXIAOXIAN, '克', 'FC-20260729', '超微粉', 3.8, 5600, { supplier: '加工车间自产', location: '成品-02-01' }),
    lot('SP005', '铁皮石斛干条', '原材料', COMPANY.MULONGSHAN, '公斤', 'GT-20260714', '干条', 980, 120, { supplier: '大别山农户直供', location: '原料-01-01' }),
    lot('SP006', '石斛礼盒（精装）', '包材', COMPANY.HUXIAOXIAN, '个', 'LH-20260619', '精装礼盒', 18.5, 260, { supplier: '合肥包装材料厂', location: '包材-01-01' }),
    lot('SP007', '玻璃瓶（50g装）', '包材', COMPANY.HUXIAOXIAN, '个', 'BP-20260520', '50g装', 1.2, 1800, { supplier: '合肥包装材料厂', location: '包材-01-02' }),
    lot('SP008', '铝箔自封袋', '包材', COMPANY.JIANGMEN, '包', 'AF-20260604', '自封袋', 28, 45, { supplier: '合肥包装材料厂', location: '包材-01-03' }),
    lot('SP009', '石斛切片（干切）', '成品', COMPANY.HUOSHAN, '克', 'QP-20260724', '干切', 4.2, 1800, { supplier: '加工车间自产', location: '成品-02-02' }),
    lot('SP010', '石斛盆景（观赏苗）', '成品', COMPANY.HUOSHAN, '盆', 'PZ-20260808', '观赏苗', 128, 36, { supplier: '牧龙山自有种植基地', location: '温室-01' })
  ]
}

function rec(type, lotObj, qty, price, opts = {}) {
  const margin = (type === 'outbound' && lotObj && price > 0)
    ? +(((price - lotObj.purchasePrice) / price) * 100).toFixed(1)
    : null
  return {
    id: genOrderNo(), orderNo: genOrderNo(), type,
    itemId: lotObj.id, itemName: lotObj.name,
    quantity: qty, unit: lotObj.unit,
    price, priceType: type === 'outbound' ? 'sale' : 'purchase',
    totalAmount: (qty * price).toFixed(2),
    batchNo: lotObj.batchNo, spec: lotObj.spec,
    operator: opts.operator || '张伟',
    supplier: opts.supplier || lotObj.supplier || '',
    customer: opts.customer || '',
    remark: opts.remark || (type === 'inbound' ? '采购入库' : type === 'outbound' ? '销售出库' : '退货入回库'),
    grossMargin: margin,
    invoiceUrl: opts.invoiceUrl || '',
    timestamp: opts.timestamp || now()
  }
}

function buildRecords(inv) {
  const byId = {}
  inv.forEach(l => { byId[l.id] = l })
  return [
    rec('outbound', byId['SP002'], 500, 18, { operator: '张伟', customer: '上海同仁堂', timestamp: '2026-08-18 09:30:00', remark: '销售出库' }),
    rec('inbound', byId['SP001'], 60, 380, { operator: '张伟', supplier: '牧龙山自有种植基地', timestamp: '2026-08-18 07:45:00', remark: '基地采收入库' }),
    rec('outbound', byId['SP004'], 800, 6, { operator: '李秀芳', customer: '京东旗舰店', timestamp: '2026-08-18 14:20:00', remark: '电商销售发货' }),
    rec('outbound', byId['SP006'], 30, 28, { operator: '李秀芳', customer: '企事业单位团购', timestamp: '2026-08-17 10:15:00', remark: '中秋团购订单' }),
    rec('inbound', byId['SP003'], 1500, 6.5, { operator: '王建国', supplier: '霍山石斛合作社', timestamp: '2026-08-17 16:40:00', remark: '采购入库' }),
    rec('return', byId['SP004'], 50, 6, { operator: '张伟', customer: '零售散客', timestamp: '2026-08-16 11:25:00', remark: '客户退货入回库' }),
    rec('outbound', byId['SP009'], 400, 9, { operator: '李秀芳', customer: '合肥国大药房', timestamp: '2026-08-16 15:10:00', remark: '药店补货' }),
    rec('outbound', byId['SP005'], 10, 1300, { operator: '王建国', customer: '经销商-南京王总', timestamp: '2026-08-15 09:45:00', remark: '经销商批发' }),
    rec('inbound', byId['SP007'], 500, 1.2, { operator: '张伟', supplier: '合肥包装材料厂', timestamp: '2026-08-14 13:30:00', remark: '包材采购' }),
    rec('outbound', byId['SP010'], 5, 198, { operator: '李秀芳', customer: '零售散客', timestamp: '2026-08-14 16:05:00', remark: '门店零售' }),
    rec('outbound', byId['SP003'], 300, 11, { operator: '张伟', customer: '天猫直营店', timestamp: '2026-08-13 10:40:00', remark: '电商销售发货' }),
    rec('inbound', byId['SP005'], 25, 980, { operator: '王建国', supplier: '大别山农户直供', timestamp: '2026-08-12 08:50:00', remark: '原料采购入库' })
  ]
}

function buildSeed() {
  const inventory = buildInventory()
  const records = buildRecords(inventory)
  return { inventory, records }
}

module.exports = { buildSeed }
