// 牧龙山石斛进销存 · 电脑端管理后台
const API = location.origin + '/api'
let TOKEN = localStorage.getItem('mls_token') || ''
let USER = null
let INV = []

// 角色/状态/权限中文
const ROLE_NAME = { admin:'管理员', manager:'管理人员', finance:'财务人员', warehouse:'仓库人员', shipping:'发货人员', sales:'销售人员' }
const ORDER_STATUS_NAME = { pending:'待审核', manager_approved:'管理已审', finance_approved:'财务已审', packed:'已打包待发货', done:'已完成', rejected:'已驳回', stock_short:'库存不足' }
const PERM_LIST = [['user:manage','用户管理'],['order:view','查看订单'],['order:create','申请订单'],['order:audit_manager','管理审核'],['order:audit_finance','财务审核'],['stock:in','入库'],['stock:out','出库'],['stock:return','退库'],['order:pack','备货打包'],['order:ship','发货']]
const TRAIL_ACTION = { create:'创建订单', audit_manager:'管理审核通过', audit_finance:'财务审核通过', reject_manager:'管理驳回', reject_finance:'财务驳回', pack:'备货打包', ship:'发货' }

function hasPerm(p){ return USER && USER.perms && USER.perms.includes(p) }

function api(path, method = 'GET', body) {
  return fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': TOKEN ? 'Bearer ' + TOKEN : ''
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json().then(d => ({ ok: r.ok, status: r.status, data: d })))
}

function getStockStatus(item) {
  const now = new Date()
  const expiry = new Date(String(item.expiryDate).replace(/-/g, '/'))
  const daysLeft = Math.ceil((expiry - now) / 86400000)
  if (isNaN(daysLeft)) return 'normal'
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 90) return 'danger'
  if ((item.quantity || 0) < 20) return 'warning'
  return 'normal'
}
const STATUS_TEXT = { normal: '正常', warning: '低库存', danger: '临期', expired: '已过期' }

// ===== 登录 =====
async function doLogin() {
  const username = document.getElementById('login-user').value.trim()
  const password = document.getElementById('login-pwd').value
  const msg = document.getElementById('login-msg')
  msg.className = 'msg'; msg.textContent = '登录中...'
  const res = await api('/auth/login', 'POST', { username, password })
  if (res.data.success) {
    TOKEN = res.data.token; USER = res.data.user
    localStorage.setItem('mls_token', TOKEN)
    enterApp()
  } else {
    msg.className = 'msg err'; msg.textContent = res.data.msg || '登录失败'
  }
}

function doLogout() {
  TOKEN = ''; USER = null
  localStorage.removeItem('mls_token')
  document.getElementById('app-view').style.display = 'none'
  document.getElementById('login-view').style.display = 'block'
}

function enterApp() {
  document.getElementById('login-view').style.display = 'none'
  document.getElementById('app-view').style.display = 'block'
  document.getElementById('user-name').textContent = (USER.name || USER.username) + '（' + (ROLE_NAME[USER.roleKey] || USER.role) + '）'
  document.getElementById('nav-users').style.display = hasPerm('user:manage') ? '' : 'none'
  document.getElementById('nav-orders').style.display = hasPerm('order:view') ? '' : 'none'
  document.getElementById('btn-new-order').style.display = hasPerm('order:create') ? '' : 'none'
  loadInventory(); loadRecords(); loadStats()
}

// 若已有 token 直接进
if (TOKEN) { api('/auth/me').then(r => { if (r.data.success) { USER = r.data.user; enterApp() } }) }

// ===== 标签页 =====
function switchTab(name, btn) {
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
  document.getElementById('sec-' + name).classList.add('active')
  if (name === 'inv') loadInventory()
  if (name === 'rec') loadRecords()
  if (name === 'stat') loadStats()
  if (name === 'users') loadUsers()
  if (name === 'orders') loadOrders()
}

// ===== 库存 =====
let INV_ALL = [] // 全量库存（不重复请求）

async function loadInventory() {
  const res = await api('/inventory')
  if (!res.data.success) return
  INV_ALL = res.data.inventory
  INV = INV_ALL.slice()
  // 按 商品名 + 入库日期排序，方便看批次
  INV.sort((a, b) => {
    const n = (a.name || '').localeCompare(b.name || '')
    return n !== 0 ? n : (a.inboundDate || '').localeCompare(b.inboundDate || '')
  })
  renderInvTable()
}

function applyInvFilter() {
  const kw = (document.getElementById('inv-search')?.value || '').trim().toLowerCase()
  const cat = document.getElementById('inv-cat')?.value || 'all'
  const comp = document.getElementById('inv-comp')?.value || 'all'
  const st = document.getElementById('inv-st')?.value || 'all'
  let list = INV_ALL.slice()
  if (kw) {
    list = list.filter(it =>
      (it.id || '').toLowerCase().includes(kw) ||
      (it.name || '').toLowerCase().includes(kw) ||
      (it.batchNo || '').toLowerCase().includes(kw) ||
      (it.spec || '').toLowerCase().includes(kw) ||
      (it.supplier || '').toLowerCase().includes(kw)
    )
  }
  if (cat !== 'all') list = list.filter(it => (it.category || '') === cat)
  if (comp !== 'all') list = list.filter(it => (it.company || '') === comp)
  if (st !== 'all') list = list.filter(it => getStockStatus(it) === st)
  list.sort((a, b) => {
    const n = (a.name || '').localeCompare(b.name || '')
    return n !== 0 ? n : (a.inboundDate || '').localeCompare(b.inboundDate || '')
  })
  INV = list
  renderInvTable()
}

function renderInvTable() {
  const tb = document.querySelector('#inv-table tbody')
  tb.innerHTML = ''
  INV.forEach(it => {
    const st = getStockStatus(it)
    const costAmt = ((it.quantity || 0) * (it.purchasePrice || 0)).toFixed(2)
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${it.id}</td><td>${it.name}</td><td>${it.batchNo || '-'}</td><td>${it.spec || ''}</td>
      <td>${it.category || ''}</td><td>${it.company || ''}</td><td>${it.unit || ''}</td>
      <td class="num">${it.quantity} ${it.unit || ''}</td>
      <td class="num">¥${it.purchasePrice || 0}</td>
      <td class="num">¥${it.salePrice || 0}</td>
      <td class="num">¥${costAmt}</td>
      <td>${it.supplier || ''}</td><td>${it.location || ''}</td>
      <td>${it.inboundDate || ''}</td>
      <td class="status-${st}">${STATUS_TEXT[st]}</td>
    </tr>`)
  })
  const total = INV_ALL.length
  const shown = INV.length
  const tip = document.getElementById('inv-count')
  if (tip) {
    tip.textContent = shown === total ? `共 ${total} 个批次` : `命中 ${shown} / 共 ${total} 个批次`
    tip.className = shown === total ? 'count-tip' : 'count-tip filtered'
  }
}

function exportInventory() {
  // 导出当前筛选结果
  const rows = [['商品编号', '商品名称', '生产批号', '规格', '类别', '所属公司仓库', '单位', '数量', '采购单价', '销售单价', '库存成本', '供应商', '库位', '入库日期']]
  INV.forEach(it => rows.push([it.id, it.name, it.batchNo || '', it.spec || '', it.category, it.company, it.unit, it.quantity, it.purchasePrice || 0, it.salePrice || 0, ((it.quantity || 0) * (it.purchasePrice || 0)).toFixed(2), it.supplier, it.location, it.inboundDate || '']))
  const name = (document.getElementById('inv-search')?.value || '').trim() ? '库存导出_已筛选.csv' : '库存导出.csv'
  downloadCSV(name, rows)
}

// ===== 批量上传 =====
function downloadTemplate() {
  const header = ['商品编号', '商品名称', '生产批号', '规格', '备注', '类别', '所属公司仓库', '单位', '生产日期', '有效期', '有效期截止日', '数量', '采购单价', '销售单价', '录入人', '库位', '供应商']
  const example = ['SP011', '铁皮石斛鲜条', 'MLS-20260820', '一级鲜条', '头茬秋条', '原材料', '安徽牧龙山铁皮石斛生物科技有限公司', '公斤', '2026-08-18', '30天', '2026-09-17', '100', '380', '500', '张伟', '冷藏-02', '牧龙山自有种植基地']
  downloadCSV('商品批量上传模板.csv', [header, example])
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim())
    const obj = {}
    headers.forEach((h, idx) => obj[h] = cells[idx] || '')
    rows.push(obj)
  }
  return rows
}

async function uploadCsv() {
  const fileInput = document.getElementById('upload-file')
  const msg = document.getElementById('upload-msg')
  if (!fileInput.files.length) { msg.className = 'msg err'; msg.textContent = '请先选择CSV文件'; return }
  const text = await fileInput.files[0].text()
  const rows = parseCSV(text)
  if (!rows.length) { msg.className = 'msg err'; msg.textContent = 'CSV 没有有效数据行'; return }
  const items = rows.map(r => ({
    id: r['商品编号'], name: r['商品名称'],
    batchNo: r['生产批号'] || '', spec: r['规格'] || '', remark: r['备注'] || '',
    category: r['类别'], company: r['所属公司仓库'], unit: r['单位'],
    productionDate: r['生产日期'], shelfLife: r['有效期'], expiryDate: r['有效期截止日'],
    quantity: r['数量'], purchasePrice: r['采购单价'], salePrice: r['销售单价'],
    entryPerson: r['录入人'],
    location: r['库位'], supplier: r['供应商']
  }))
  msg.className = 'msg'; msg.textContent = '上传中...'
  const res = await api('/inventory/bulk', 'POST', { items, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2) })
  if (res.data.success) {
    msg.className = 'msg ok'
    msg.textContent = `成功：新增 ${res.data.added} 项，更新 ${res.data.updated} 项，共 ${res.data.total} 项`
    loadInventory()
  } else {
    msg.className = 'msg err'; msg.textContent = res.data.msg || '上传失败'
  }
}

// ===== 交易记录 =====
let REC_ALL = []

async function loadRecords() {
  const filter = document.getElementById('rec-filter').value
  const res = await api('/records' + (filter && filter !== 'all' ? '?type=' + filter : ''))
  if (!res.data.success) return
  REC_ALL = res.data.records
  applyRecFilter()
}

function applyRecFilter() {
  const kw = (document.getElementById('rec-search')?.value || '').trim().toLowerCase()
  const inv = document.getElementById('rec-invoice')?.value || 'all'
  let list = REC_ALL.slice()
  if (kw) {
    list = list.filter(r =>
      (r.orderNo || r.id || '').toLowerCase().includes(kw) ||
      (r.itemName || '').toLowerCase().includes(kw) ||
      (r.batchNo || '').toLowerCase().includes(kw) ||
      (r.spec || '').toLowerCase().includes(kw) ||
      (r.operator || '').toLowerCase().includes(kw) ||
      (r.customer || '').toLowerCase().includes(kw) ||
      (r.supplier || '').toLowerCase().includes(kw)
    )
  }
  if (inv === 'yes') list = list.filter(r => !!r.invoiceUrl)
  else if (inv === 'no') list = list.filter(r => !r.invoiceUrl)
  renderRecTable(list)
}

function renderRecTable(list) {
  const tb = document.querySelector('#rec-table tbody')
  tb.innerHTML = ''
  const TYPE = { inbound: ['入库', 'in'], outbound: ['销售', 'out'], return: ['退库', 'ret'] }
  list.forEach(r => {
    const t = TYPE[r.type] || [r.type, '']
    const who = r.type === 'outbound' || r.type === 'return' ? (r.customer || '') : (r.supplier || '')
    const priceLabel = r.priceType === 'sale' ? '销售' : '采购'
    const margin = r.grossMargin != null ? r.grossMargin + '%' : '-'
    const invoiceThumb = r.invoiceUrl ? `<a href="${r.invoiceUrl}" target="_blank"><img src="${r.invoiceUrl}" class="invoice-thumb"/></a>` : '<span style="color:#bbb">无</span>'
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${r.orderNo || r.id}</td>
      <td><span class="tag ${t[1]}">${t[0]}</span></td>
      <td>${r.itemName}</td>
      <td>${r.batchNo || '-'}</td><td>${r.spec || ''}</td>
      <td>${r.company || ''}</td>
      <td class="num">${r.quantity} ${r.unit || ''}</td>
      <td class="num">${priceLabel} ¥${r.price || 0}</td>
      <td class="num">${margin}</td>
      <td class="num">¥${r.totalAmount}</td>
      <td>${r.operator || ''}</td><td>${who}</td><td>${r.timestamp}</td><td>${r.remark || ''}</td>
      <td>${invoiceThumb}</td>
    </tr>`)
  })
  const total = REC_ALL.length
  const shown = list.length
  const tip = document.getElementById('rec-count')
  if (tip) {
    tip.textContent = shown === total ? `共 ${total} 条记录` : `命中 ${shown} / 共 ${total} 条记录`
    tip.className = shown === total ? 'count-tip' : 'count-tip filtered'
  }
}

function exportRecords() {
  // 导出当前筛选结果
  const kw = (document.getElementById('rec-search')?.value || '').trim()
  const rows = [['单号', '类型', '商品', '生产批号', '规格', '所属公司', '数量', '单位', '价格类型', '单价', '毛利率%', '金额', '经办人', '供应商/客户', '时间', '备注', '发票链接']]
  REC_ALL.forEach(x => rows.push([x.orderNo || x.id, x.type, x.itemName, x.batchNo || '', x.spec || '', x.company || '', x.quantity, x.unit, (x.priceType === 'sale' ? '销售' : '采购'), x.price || 0, (x.grossMargin != null ? x.grossMargin : ''), x.totalAmount, x.operator, (x.customer || x.supplier || ''), x.timestamp, x.remark || '', x.invoiceUrl || '']))
  const name = kw ? '交易记录导出_已筛选.csv' : '交易记录导出.csv'
  downloadCSV(name, rows)
}

// ===== 统计 =====
async function loadStats() {
  const range = document.getElementById('stat-range').value
  const res = await api('/stats?range=' + range)
  if (!res.data.success) return
  const s = res.data.summary
  document.getElementById('stat-cards').innerHTML = `
    <div class="card"><div class="k">商品种类</div><div class="v">${s.totalItems}</div></div>
    <div class="card"><div class="k">库存总量</div><div class="v">${s.totalQuantity}</div></div>
    <div class="card"><div class="k">库存总额(元)</div><div class="v">${s.totalAmount}</div></div>
    <div class="card"><div class="k">累计销售(元)</div><div class="v">${s.outboundAmt}</div></div>
  `
  const tb = document.querySelector('#stat-table tbody')
  tb.innerHTML = ''
  const maxAmt = Math.max(1, ...res.data.stats.map(g => g.inboundAmt + g.outboundAmt))
  res.data.stats.forEach(g => {
    const inPct = (g.inboundAmt / maxAmt * 100).toFixed(1)
    const outPct = (g.outboundAmt / maxAmt * 100).toFixed(1)
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${g.key}</td>
      <td class="num">${g.inboundQty}</td><td class="num">${g.inboundAmt.toFixed(2)}</td>
      <td class="num">${g.outboundQty}</td><td class="num">${g.outboundAmt.toFixed(2)}</td>
      <td class="num">${g.returnQty}</td><td class="num">${g.returnAmt.toFixed(2)}</td>
    </tr>
    <tr><td colspan="7">
      <div class="bar-row"><span style="width:48px;">入库</span><div class="bar-wrap"><div class="bar in" style="width:${inPct}%"></div></div><span>${g.inboundAmt.toFixed(0)}</span></div>
      <div class="bar-row"><span style="width:48px;">销售</span><div class="bar-wrap"><div class="bar out" style="width:${outPct}%"></div></div><span>${g.outboundAmt.toFixed(0)}</span></div>
    </td></tr>`)
  })
}

function exportStats() {
  const range = document.getElementById('stat-range').value
  api('/stats?range=' + range).then(r => {
    if (!r.data.success) return
    const rows = [['周期', '入库量', '入库额', '销售量', '销售额', '退库量', '退库额']]
    r.data.stats.forEach(g => rows.push([g.key, g.inboundQty, g.inboundAmt.toFixed(2), g.outboundQty, g.outboundAmt.toFixed(2), g.returnQty, g.returnAmt.toFixed(2)]))
    downloadCSV('统计导出_' + range + '.csv', rows)
  })
}

// ===== 订单 =====
async function loadOrders() {
  const f = document.getElementById('order-filter').value
  const res = await api('/orders' + (f && f !== 'all' ? '?status=' + f : ''))
  if (!res.data.success) return
  const tb = document.querySelector('#order-table tbody')
  tb.innerHTML = ''
  res.data.orders.forEach(o => {
    const items = o.items.map(it => it.itemName + '×' + it.quantity + it.unit).join('、')
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${o.orderNo}</td><td>${o.customer || '-'}</td><td>${items}</td>
      <td class="num">¥${o.totalAmount}</td>
      <td><span class="badge b-${o.status}">${ORDER_STATUS_NAME[o.status] || o.status}</span></td>
      <td>${o.createdByName || o.createdBy}</td><td>${o.createdAt}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openOrderDetail('${o.id}')">详情</button></td>
    </tr>`)
  })
}

function showOrderForm() {
  if (!INV.length) { /* loaded in loadInventory */ }
  document.getElementById('order-items').innerHTML = ''
  addOrderItemRow(); addOrderItemRow()
  document.getElementById('order-customer').value = ''
  document.getElementById('order-note').value = ''
  document.getElementById('order-msg').textContent = ''
  document.getElementById('order-form').style.display = 'block'
}
function hideOrderForm() { document.getElementById('order-form').style.display = 'none' }

function addOrderItemRow() {
  const opts = INV.map(i => `<option value="${i.id}">${i.name}（${i.unit || ''}）</option>`).join('')
  const div = document.createElement('div')
  div.className = 'oi-row'
  div.innerHTML = `<select>${opts}</select><input type="number" min="1" placeholder="数量"><button class="btn btn-ghost btn-sm" onclick="this.parentNode.remove()">删</button>`
  document.getElementById('order-items').appendChild(div)
}

async function submitOrder() {
  const rows = document.querySelectorAll('#order-items .oi-row')
  const items = []
  for (const row of rows) {
    const sel = row.querySelector('select'); const qty = row.querySelector('input').value
    if (sel.value && qty) items.push({ itemId: sel.value, quantity: parseInt(qty) })
  }
  if (!items.length) { document.getElementById('order-msg').textContent = '请至少添加一个商品'; return }
  const res = await api('/orders', 'POST', {
    items, customer: document.getElementById('order-customer').value,
    note: document.getElementById('order-note').value,
    nonce: Date.now().toString(36) + Math.random().toString(36).slice(2)
  })
  if (res.data.success) { hideOrderForm(); loadOrders(); openOrderDetail(res.data.order.id) }
  else document.getElementById('order-msg').textContent = res.data.msg
}

function hideOrderDetail() { document.getElementById('order-detail').style.display = 'none' }

async function openOrderDetail(id) {
  const res = await api('/orders/' + id)
  if (!res.data.success) return
  const o = res.data.order
  const itemsHtml = o.items.map(it => `<div class="oi">${it.itemName} × ${it.quantity} ${it.unit} ｜ ¥${it.unitPrice} = ¥${it.amount}</div>`).join('')
  const trailHtml = (o.trail || []).map(t => `<div class="trail-row"><span class="trail-time">${t.time}</span><b>${t.by}</b>（${ROLE_NAME[t.role] || t.role}）${TRAIL_ACTION[t.action] || t.action}${t.note ? '：' + t.note : ''}</div>`).join('')
  const photosHtml = (o.packPhotos || []).map(p => `<img src="${p}" class="photo-thumb">`).join('') || '<span style="color:#aaa">无</span>'
  let actions = ''
  if (hasPerm('order:audit_manager') && o.status === 'pending') {
    actions += `<button class="btn btn-sm" onclick="orderAudit('${o.id}','manager','pass')">管理审核通过</button> <button class="btn btn-ghost btn-sm" onclick="orderAudit('${o.id}','manager','reject')">驳回</button> `
  }
  if (hasPerm('order:audit_finance') && o.status === 'manager_approved') {
    actions += `<button class="btn btn-sm" onclick="orderAudit('${o.id}','finance','pass')">财务审核通过</button> <button class="btn btn-ghost btn-sm" onclick="orderAudit('${o.id}','finance','reject')">驳回</button> `
  }
  if (hasPerm('order:pack') && (o.status === 'finance_approved' || o.status === 'packed' || o.status === 'stock_short')) {
    actions += `<div class="field" style="margin-top:8px;"><label>上传货好照片</label><input type="file" id="pack-photo" accept="image/*"></div><button class="btn btn-sm" onclick="orderPack('${o.id}')">标记打包完成</button> `
  }
  if (hasPerm('order:ship') && o.status === 'packed') {
    actions += `<div class="field" style="margin-top:8px;"><label>快递单号</label><input id="ship-no" placeholder="如 SF123456"></div><div class="field"><label>发货照片(选填)</label><input type="file" id="ship-photo" accept="image/*"></div><button class="btn btn-sm" onclick="orderShip('${o.id}')">确认发货</button>`
  }
  document.getElementById('order-detail').innerHTML = `
    <div class="detail-head"><h3>订单 ${o.orderNo}</h3><span class="badge b-${o.status}">${ORDER_STATUS_NAME[o.status] || o.status}</span></div>
    <div class="detail-meta">客户：${o.customer || '-'} ｜ 总金额：¥${o.totalAmount} ｜ 创建人：${o.createdByName || o.createdBy} ｜ ${o.createdAt}</div>
    <div class="order-items">${itemsHtml}</div>
    <div class="detail-sub">货好照片：${photosHtml}</div>
    ${o.trackingNo ? '<div class="detail-sub">快递单号：' + o.trackingNo + '</div>' : ''}
    <div class="detail-sub">审核轨迹：</div>
    <div class="trail">${trailHtml}</div>
    <div class="toolbar" id="order-actions" style="margin-top:12px;">${actions || '<span style="color:#aaa">当前角色无可执行操作</span>'}</div>
    <div class="toolbar"><button class="btn btn-ghost btn-sm" onclick="hideOrderDetail()">关闭</button></div>
  `
  document.getElementById('order-detail').style.display = 'block'
}

async function orderAudit(id, step, action) {
  if (action === 'reject' && !confirm('确认驳回该订单？')) return
  const res = await api('/orders/' + id + '/audit', 'POST', { step, action, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2) })
  if (res.data.success) { loadOrders(); openOrderDetail(id) }
  else alert(res.data.msg)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
async function uploadImage(file) {
  const b64 = await fileToBase64(file)
  const r = await api('/upload', 'POST', { filename: file.name, content: b64 })
  return r.data.success ? r.data.url : null
}

async function orderPack(id) {
  const f = document.getElementById('pack-photo').files[0]
  let photos = []
  if (f) {
    const url = await uploadImage(f)
    if (url) photos.push(url); else { alert('照片上传失败'); return }
  }
  const res = await api('/orders/' + id + '/pack', 'POST', { photos, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2) })
  if (res.data.success) { alert('已打包'); loadOrders(); openOrderDetail(id) }
  else alert(res.data.msg)
}

async function orderShip(id) {
  const no = document.getElementById('ship-no').value.trim()
  if (!no) { alert('请填写快递单号'); return }
  const f = document.getElementById('ship-photo').files[0]
  let shipPhoto = ''
  if (f) shipPhoto = await uploadImage(f) || ''
  const res = await api('/orders/' + id + '/ship', 'POST', { trackingNo: no, shipPhoto, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2) })
  if (res.data.success) { alert('已发货'); loadOrders(); openOrderDetail(id) }
  else alert(res.data.msg)
}

// ===== 用户管理 =====
let USERS_ALL = []

async function loadUsers() {
  const res = await api('/users')
  if (!res.data.success) { alert(res.data.msg); return }
  USERS_ALL = res.data.users
  applyUserFilter()
}

function applyUserFilter() {
  const kw = (document.getElementById('user-search')?.value || '').trim().toLowerCase()
  const role = document.getElementById('user-role-filter')?.value || 'all'
  const st = document.getElementById('user-status-filter')?.value || 'all'
  let list = USERS_ALL.slice()
  if (kw) {
    list = list.filter(u =>
      (u.username || '').toLowerCase().includes(kw) ||
      (u.name || '').toLowerCase().includes(kw) ||
      (u.phone || '').toLowerCase().includes(kw) ||
      (u.area || '').toLowerCase().includes(kw)
    )
  }
  if (role !== 'all') list = list.filter(u => (u.roleKey || u.role) === role)
  if (st === 'enabled') list = list.filter(u => u.status !== 'disabled')
  else if (st === 'disabled') list = list.filter(u => u.status === 'disabled')
  renderUserTable(list)
}

function renderUserTable(list) {
  const tb = document.querySelector('#user-table tbody')
  tb.innerHTML = ''
  list.forEach(u => {
    const op = u.status === 'disabled'
      ? `<button class="btn btn-sm" onclick="toggleUser('${u.username}',true)">启用</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="toggleUser('${u.username}',false)">禁用</button>`
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${u.username}</td><td>${u.name}</td><td>${u.role}</td><td>${u.area || '-'}</td>
      <td>${u.phone || '-'}</td>
      <td><span class="badge ${u.status === 'disabled' ? 'b-rejected' : 'b-done'}">${u.status === 'disabled' ? '已禁用' : '正常'}</span></td>
      <td>${op} <button class="btn btn-ghost btn-sm" onclick="showUserForm('${u.username}')">编辑</button> <button class="btn btn-ghost btn-sm" onclick="deleteUser('${u.username}')">删除</button></td>
    </tr>`)
  })
  const total = USERS_ALL.length
  const shown = list.length
  const tip = document.getElementById('user-count')
  if (tip) {
    tip.textContent = shown === total ? `共 ${total} 名员工` : `命中 ${shown} / 共 ${total} 名员工`
    tip.className = shown === total ? 'count-tip' : 'count-tip filtered'
  }
}

function renderPermBox() {
  document.getElementById('u-perm-box').innerHTML = PERM_LIST.map(p => `<label class="perm-item"><input type="checkbox" value="${p[0]}"> ${p[1]}</label>`).join('')
}

async function showUserForm(edit) {
  const rb = document.getElementById('u-role')
  rb.innerHTML = Object.keys(ROLE_NAME).map(k => `<option value="${k}">${ROLE_NAME[k]}</option>`).join('')
  renderPermBox()
  if (edit) {
    const res = await api('/users')
    const u = res.data.users.find(x => x.username === edit)
    if (u) {
      document.getElementById('u-username').value = u.username; document.getElementById('u-username').disabled = true
      document.getElementById('u-name').value = u.name; document.getElementById('u-password').value = ''
      rb.value = u.roleKey; document.getElementById('u-area').value = u.area || ''; document.getElementById('u-phone').value = u.phone || ''
      document.querySelectorAll('#u-perm-box input').forEach(cb => { cb.checked = (u.perms || []).includes(cb.value) })
    }
  } else {
    document.getElementById('u-username').value = ''; document.getElementById('u-username').disabled = false
    document.getElementById('u-name').value = ''; document.getElementById('u-password').value = ''
    rb.value = 'sales'; document.getElementById('u-area').value = ''; document.getElementById('u-phone').value = ''
  }
  document.getElementById('user-form').style.display = 'block'
}
function hideUserForm() { document.getElementById('user-form').style.display = 'none' }

async function saveUser() {
  const username = document.getElementById('u-username').value.trim()
  const name = document.getElementById('u-name').value.trim()
  const password = document.getElementById('u-password').value
  const roleKey = document.getElementById('u-role').value
  const area = document.getElementById('u-area').value.trim()
  const phone = document.getElementById('u-phone').value.trim()
  const perms = [...document.querySelectorAll('#u-perm-box input:checked')].map(cb => cb.value)
  const msg = document.getElementById('u-msg')
  if (!username || !name) { msg.textContent = '账号和姓名必填'; msg.className = 'msg err'; return }
  const isEdit = document.getElementById('u-username').disabled
  let res
  if (isEdit) {
    res = await api('/users/' + username, 'PUT', { name, area, phone, roleKey, perms, password: password || undefined })
  } else {
    if (!password) { msg.textContent = '请设置初始密码'; msg.className = 'msg err'; return }
    res = await api('/users', 'POST', { username, name, password, roleKey, area, phone, perms })
  }
  if (res.data.success) { hideUserForm(); loadUsers() }
  else { msg.textContent = res.data.msg; msg.className = 'msg err' }
}

async function toggleUser(username, enable) {
  const res = await api('/users/' + username + (enable ? '/enable' : '/disable'), 'POST')
  if (res.data.success) loadUsers(); else alert(res.data.msg)
}

async function deleteUser(username) {
  if (!confirm('确认删除该人员？删除后其账号将无法登录。')) return
  const res = await api('/users/' + username, 'DELETE')
  if (res.data.success) loadUsers(); else alert(res.data.msg)
}

// ===== CSV 下载 =====
function downloadCSV(filename, rows) {
  const csv = '﻿' + rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
