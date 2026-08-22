// approvals.js - 流程审批链引擎 + 站内消息中心
// 四条链：销售(outbound) / 入库(inbound) / 退库(return) / 撤销(revoke)
// 链定义在 roles.js APPROVAL_CHAINS，所有流程抄送葛静(gj2026)
// 模式：先审后动 —— 提交申请不动库存，三级审核全通过后自动执行库存变动
const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../auth')
const { APPROVAL_CHAINS } = require('../roles')
const { now } = require('../util')
const ops = require('./operations')

function genId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
}

// ===== 站内消息 =====
function pushMessage(state, to, msg) {
  if (!to) return
  state.messages.unshift({
    id: genId('MSG'),
    to: to.username || to,
    title: msg.title,
    content: msg.content,
    type: msg.type, // audit 待审核 / cc 抄送 / result 结果
    approvalId: msg.approvalId || '',
    read: false,
    createdAt: now()
  })
}

function pushMany(state, users, msg) {
  users.forEach(u => pushMessage(state, u, msg))
}

// 用户名数组 → {username, name} 数组（从 users 表取姓名，取不到用账号兜底）
function resolveUsers(state, usernames) {
  return (usernames || []).map(un => {
    const u = state.users.find(x => x.username === un)
    return { username: un, name: u ? u.name : un }
  })
}

// 生成流程摘要（消息和列表展示用）
function makeSummary(type, payload) {
  const p = payload || {}
  if (type === 'revoke') {
    const rt = p.returnType === 'sales' ? '销售退回' : (p.returnType === 'purchase' ? '采购退货' : '')
    return `撤销订单 ${p.orderNo || ''}${rt ? '（' + rt + '）' : ''} 数量 ${p.quantity || 0}`
  }
  const name = p.name || p.itemName || ''
  const qty = p.quantity || 0
  const unit = p.unit || ''
  let extra = ''
  if (type === 'outbound') extra = p.customer ? `，客户：${p.customer}` : ''
  if (type === 'inbound') extra = p.supplier ? `，供应商：${p.supplier}` : ''
  if (type === 'return') extra = p.reason ? `，理由：${p.reason}` : ''
  return `${name} × ${qty}${unit ? ' ' + unit : ''}${extra}`
}

// ===== 撤销执行：反向回滚原订单 =====
function doRevoke(state, approval) {
  const orderNo = (approval.payload.orderNo || '').trim()
  const record = state.records.find(r => r.orderNo === orderNo)
  if (!record) return { success: false, msg: '原订单不存在' }
  if (record.revoked) return { success: false, msg: '该订单已被撤销过' }
  const lot = state.inventory.find(i => i.id === record.itemId)
  if (!lot) return { success: false, msg: '原订单对应批次不存在' }
  const qty = parseInt(record.quantity) || 0

  if (record.type === 'outbound') {
    // 销售出库撤销：库存加回
    lot.quantity += qty
  } else if (record.type === 'inbound') {
    // 采购入库撤销：库存扣回
    if (lot.quantity < qty) return { success: false, msg: `库存不足，无法撤销入库（当前 ${lot.quantity} ${lot.unit}，需扣回 ${qty}）` }
    lot.quantity -= qty
  } else if (record.type === 'return') {
    if (record.returnType === 'sales') {
      // 销售退回撤销：当时加了库存，现在扣回
      if (lot.quantity < qty) return { success: false, msg: `库存不足，无法撤销退库（当前 ${lot.quantity} ${lot.unit}，需扣回 ${qty}）` }
      lot.quantity -= qty
    } else {
      // 采购退货撤销：当时扣了库存，现在加回
      lot.quantity += qty
    }
  } else {
    return { success: false, msg: '不支持撤销该类型订单' }
  }
  lot.lastUpdate = now()
  record.revoked = true
  record.revokedAt = now()
  record.revokedBy = approval.submitterName
  return { success: true, msg: '撤销执行成功' }
}

// 审批全部通过后执行实际业务（以提交人身份）
function executeApproval(state, approval) {
  const fakeReq = { user: { name: approval.submitterName } }
  if (approval.type === 'outbound') return ops.doOutbound(state, approval.payload, fakeReq)
  if (approval.type === 'inbound') return ops.doInbound(state, approval.payload, fakeReq)
  if (approval.type === 'return') return ops.doReturn(state, approval.payload, fakeReq)
  if (approval.type === 'revoke') return doRevoke(state, approval)
  return { success: false, msg: '未知流程类型' }
}

// ===== 提交审批申请 =====
// body: { type: 'outbound'|'inbound'|'return'|'revoke', payload: {...原操作数据}, reason }
router.post('/', auth.authRequired, async (req, res) => {
  const { type, payload, reason } = req.body
  const chain = APPROVAL_CHAINS[type]
  if (!chain) return res.status(400).json({ success: false, msg: '流程类型无效' })
  if (!payload || typeof payload !== 'object') return res.status(400).json({ success: false, msg: '缺少操作数据' })

  const permMap = { outbound: 'stock:out', inbound: 'stock:in', return: 'stock:return', revoke: null }
  const needPerm = permMap[type]
  if (needPerm && !(req.user.perms || []).includes(needPerm)) {
    return res.status(403).json({ success: false, msg: `无权限提交${chain.name}申请（需要 ${needPerm}）` })
  }

  try {
    const result = await db.mutate({
      nonce: req.body.nonce,
      fn: (state) => {
        // 撤销类的前置校验
        if (type === 'revoke') {
          const orderNo = (payload.orderNo || '').trim()
          if (!orderNo) return { success: false, msg: '请选择要撤销的订单' }
          if (!(reason || '').trim()) return { success: false, msg: '请填写撤销理由' }
          const record = state.records.find(r => r.orderNo === orderNo)
          if (!record) return { success: false, msg: '原订单不存在' }
          if (record.revoked) return { success: false, msg: '该订单已被撤销过' }
          if (record.type !== 'outbound' && record.type !== 'inbound' && record.type !== 'return') {
            return { success: false, msg: '只能撤销销售/入库/退库订单' }
          }
          // 非管理员只能撤销自己经手的单
          const isAdmin = (req.user.perms || []).includes('user:manage')
          if (!isAdmin && record.operator !== req.user.name) {
            return { success: false, msg: '只能撤销自己经手的订单（如需撤销他人订单请联系管理员提交）' }
          }
          // 不允许同一单有进行中的撤销申请
          const dupRunning = state.approvals.find(a =>
            a.type === 'revoke' && a.payload.orderNo === orderNo && a.status === 'pending')
          if (dupRunning) return { success: false, msg: '该订单已有进行中的撤销申请' }
        }
        // 同类型不允许提交人重复提交同一批次（出库场景：同 lotId 且进行中）
        if (type === 'outbound' && payload.lotId) {
          const dupRunning = state.approvals.find(a =>
            a.type === 'outbound' && a.submitter === req.user.username &&
            a.payload.lotId === payload.lotId && a.status === 'pending')
          if (dupRunning) return { success: false, msg: '该批次已有进行中的出库申请，请等待审核完成后再提交' }
        }

        const steps = resolveUsers(state, chain.steps)
        const ccUsers = resolveUsers(state, chain.cc)
        const approval = {
          id: genId('AP'),
          type,
          typeName: chain.name,
          status: 'pending',
          step: 0,
          steps: steps.map(s => ({ ...s, status: 'pending' })),
          cc: ccUsers.map(c => c.username),
          submitter: req.user.username,
          submitterName: req.user.name,
          payload: { ...payload, reason: (reason || '').trim() },
          summary: makeSummary(type, payload),
          execResult: null,
          orderNo: '', // 执行成功后回填实际单号
          createdAt: now(),
          updatedAt: now(),
          auditLog: []
        }
        state.approvals.unshift(approval)

        // 推消息：第一级审核人 + 抄送
        const first = steps[0]
        pushMessage(state, first, {
          type: 'audit',
          approvalId: approval.id,
          title: `【${chain.name}】待您审核（一级）`,
          content: `${req.user.name} 提交了${chain.name}申请：${approval.summary}`
        })
        pushMany(state, ccUsers, {
          type: 'cc',
          approvalId: approval.id,
          title: `【${chain.name}】流程抄送`,
          content: `${req.user.name} 提交了${chain.name}申请：${approval.summary}，已进入审批流程`
        })
        return { success: true, msg: '申请已提交，等待审核', approval }
      }
    })
    res.json(result)
  } catch (e) { res.status(e.duplicate ? 409 : 400).json({ success: false, msg: e.message }) }
})

// ===== 审批列表 =====
// scope: todo=待我审核 | mine=我提交的 | cc=抄送我的 | all=全部
router.get('/', auth.authRequired, (req, res) => {
  const scope = req.query.scope || 'all'
  const me = req.user.username
  const state = db.getState()
  let list = state.approvals
  if (scope === 'todo') {
    list = list.filter(a => a.status === 'pending' && a.steps[a.step] && a.steps[a.step].username === me)
  } else if (scope === 'mine') {
    list = list.filter(a => a.submitter === me)
  } else if (scope === 'cc') {
    list = list.filter(a => (a.cc || []).includes(me))
  }
  const canViewPrice = !!(req.user.perms || []).includes('price:view')
  list = list.slice(0, 200).map(a => {
    const item = { ...a, payload: { ...a.payload } }
    if (!canViewPrice) {
      if ('price' in item.payload) item.payload.price = null
      if ('salePrice' in item.payload) item.payload.salePrice = null
      if ('purchasePrice' in item.payload) item.payload.purchasePrice = null
    }
    return item
  })
  res.json({ success: true, approvals: list, unreadTodo: state.approvals.filter(a => a.status === 'pending' && a.steps[a.step] && a.steps[a.step].username === me).length })
})

// ===== 审批详情 =====
router.get('/:id', auth.authRequired, (req, res) => {
  const a = db.getState().approvals.find(x => x.id === req.params.id)
  if (!a) return res.status(404).json({ success: false, msg: '流程不存在' })
  res.json({ success: true, approval: a })
})

// ===== 审核通过 =====
router.post('/:id/approve', auth.authRequired, async (req, res) => {
  try {
    const result = await db.mutate({
      fn: (state) => {
        const a = state.approvals.find(x => x.id === req.params.id)
        if (!a) return { success: false, msg: '流程不存在' }
        if (a.status !== 'pending') return { success: false, msg: '该流程已结束' }
        const cur = a.steps[a.step]
        if (!cur) return { success: false, msg: '流程状态异常' }
        if (cur.username !== req.user.username) {
          return { success: false, msg: `当前应由「${cur.name}」审核，您无权操作` }
        }
        const chain = APPROVAL_CHAINS[a.type]
        const stepNames = ['一级', '二级', '三级']
        cur.status = 'approved'
        cur.actionAt = now()
        cur.comment = (req.body.comment || '').trim()
        a.auditLog.push({
          step: a.step, stepName: stepNames[a.step] || `第${a.step + 1}级`,
          username: req.user.username, name: req.user.name,
          action: 'approved', comment: cur.comment, at: now()
        })
        a.updatedAt = now()

        const ccUsers = resolveUsers(state, a.cc)

        if (a.step >= a.steps.length - 1) {
          // 最后一级通过 → 执行业务
          const exec = executeApproval(state, a)
          a.execResult = exec
          if (exec.success) {
            a.status = 'approved'
            a.orderNo = exec.orderNo || a.orderNo
            pushMessage(state, a.submitter, {
              type: 'result',
              approvalId: a.id,
              title: `【${a.typeName}】申请已全部通过`,
              content: `您提交的${a.typeName}申请（${a.summary}）已通过三级审核并执行成功，单号 ${exec.orderNo || '-'}`
            })
            pushMany(state, ccUsers, {
              type: 'cc',
              approvalId: a.id,
              title: `【${a.typeName}】流程已完成`,
              content: `${a.submitterName} 的${a.typeName}申请（${a.summary}）已通过全部审核并执行`
            })
            return { success: true, msg: '审核通过，流程已完成并执行', approval: a }
          } else {
            a.status = 'failed'
            pushMessage(state, a.submitter, {
              type: 'result',
              approvalId: a.id,
              title: `【${a.typeName}】审核通过但执行失败`,
              content: `您的申请（${a.summary}）已通过审核，但执行失败：${exec.msg}。请联系管理员处理。`
            })
            pushMany(state, ccUsers, {
              type: 'cc',
              approvalId: a.id,
              title: `【${a.typeName}】执行失败提醒`,
              content: `${a.submitterName} 的${a.typeName}申请（${a.summary}）已通过审核但执行失败：${exec.msg}`
            })
            return { success: true, msg: '审核通过，但执行失败：' + exec.msg, approval: a }
          }
        } else {
          // 进入下一级
          a.step += 1
          const next = a.steps[a.step]
          pushMessage(state, next, {
            type: 'audit',
            approvalId: a.id,
            title: `【${a.typeName}】待您审核（${stepNames[a.step]}）`,
            content: `${a.submitterName} 的${a.typeName}申请：${a.summary}（${stepNames[a.step - 1]} ${req.user.name} 已通过）`
          })
          pushMany(state, ccUsers, {
            type: 'cc',
            approvalId: a.id,
            title: `【${a.typeName}】审批进展`,
            content: `${stepNames[a.step - 1]}审核人 ${req.user.name} 已通过「${a.summary}」，流转至${stepNames[a.step]}审核人 ${next.name}`
          })
          return { success: true, msg: `已通过，流转至${stepNames[a.step]}审核`, approval: a }
        }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// ===== 驳回 =====
router.post('/:id/reject', auth.authRequired, async (req, res) => {
  const comment = (req.body.comment || '').trim()
  try {
    const result = await db.mutate({
      fn: (state) => {
        const a = state.approvals.find(x => x.id === req.params.id)
        if (!a) return { success: false, msg: '流程不存在' }
        if (a.status !== 'pending') return { success: false, msg: '该流程已结束' }
        const cur = a.steps[a.step]
        if (!cur) return { success: false, msg: '流程状态异常' }
        if (cur.username !== req.user.username) {
          return { success: false, msg: `当前应由「${cur.name}」审核，您无权操作` }
        }
        const stepNames = ['一级', '二级', '三级']
        cur.status = 'rejected'
        cur.actionAt = now()
        cur.comment = comment
        a.status = 'rejected'
        a.updatedAt = now()
        a.auditLog.push({
          step: a.step, stepName: stepNames[a.step] || `第${a.step + 1}级`,
          username: req.user.username, name: req.user.name,
          action: 'rejected', comment, at: now()
        })
        const ccUsers = resolveUsers(state, a.cc)
        pushMessage(state, a.submitter, {
          type: 'result',
          approvalId: a.id,
          title: `【${a.typeName}】申请被驳回`,
          content: `您提交的${a.typeName}申请（${a.summary}）被${stepNames[a.step]}审核人 ${req.user.name} 驳回${comment ? '，理由：' + comment : ''}`
        })
        pushMany(state, ccUsers, {
          type: 'cc',
          approvalId: a.id,
          title: `【${a.typeName}】流程被驳回`,
          content: `${a.submitterName} 的${a.typeName}申请（${a.summary}）被 ${req.user.name} 驳回${comment ? '，理由：' + comment : ''}`
        })
        return { success: true, msg: '已驳回', approval: a }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// ===== 撤回自己提交的申请（审核人未处理前） =====
router.post('/:id/cancel', auth.authRequired, async (req, res) => {
  try {
    const result = await db.mutate({
      fn: (state) => {
        const a = state.approvals.find(x => x.id === req.params.id)
        if (!a) return { success: false, msg: '流程不存在' }
        if (a.status !== 'pending') return { success: false, msg: '该流程已结束，无法撤回' }
        if (a.submitter !== req.user.username && !(req.user.perms || []).includes('user:manage')) {
          return { success: false, msg: '只能撤回自己提交的申请' }
        }
        // 已有任何一级审过就不能撤（只能等驳回）
        const audited = a.auditLog.length > 0
        if (audited) return { success: false, msg: '已有审核记录，无法撤回（请联系审核人驳回）' }
        a.status = 'cancelled'
        a.updatedAt = now()
        const ccUsers = resolveUsers(state, a.cc)
        const cur = a.steps[a.step]
        if (cur) pushMessage(state, cur, {
          type: 'cc', approvalId: a.id,
          title: `【${a.typeName}】申请人已撤回`,
          content: `${a.submitterName} 撤回了${a.typeName}申请：${a.summary}`
        })
        pushMany(state, ccUsers, {
          type: 'cc', approvalId: a.id,
          title: `【${a.typeName}】申请人已撤回`,
          content: `${a.submitterName} 撤回了${a.typeName}申请：${a.summary}`
        })
        return { success: true, msg: '已撤回', approval: a }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

module.exports = router

// ===== 站内消息接口 =====
const msgRouter = express.Router()

// 我的消息列表
msgRouter.get('/', auth.authRequired, (req, res) => {
  const me = req.user.username
  const state = db.getState()
  const list = state.messages.filter(m => m.to === me).slice(0, 100)
  const unread = state.messages.filter(m => m.to === me && !m.read).length
  res.json({ success: true, messages: list, unread })
})

// 未读数（小程序 tabBar 红点用）
msgRouter.get('/unread-count', auth.authRequired, (req, res) => {
  const me = req.user.username
  const unread = db.getState().messages.filter(m => m.to === me && !m.read).length
  const todo = db.getState().approvals.filter(a =>
    a.status === 'pending' && a.steps[a.step] && a.steps[a.step].username === me).length
  res.json({ success: true, unread, todo })
})

// 全部已读
msgRouter.post('/read-all', auth.authRequired, async (req, res) => {
  try {
    const result = await db.mutate({
      fn: (state) => {
        let n = 0
        state.messages.forEach(m => { if (m.to === req.user.username && !m.read) { m.read = true; n++ } })
        return { success: true, count: n }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

// 单条已读
msgRouter.post('/:id/read', auth.authRequired, async (req, res) => {
  try {
    const result = await db.mutate({
      fn: (state) => {
        const m = state.messages.find(x => x.id === req.params.id && x.to === req.user.username)
        if (!m) return { success: false, msg: '消息不存在' }
        m.read = true
        return { success: true }
      }
    })
    res.json(result)
  } catch (e) { res.status(400).json({ success: false, msg: e.message }) }
})

module.exports.messagesRouter = msgRouter
