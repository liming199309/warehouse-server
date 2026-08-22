// roles.js - 角色与权限定义（牧龙山石斛进销存）
const ROLES = {
  admin:     { key: 'admin',     name: '管理员',   desc: '全部权限，可管理用户与所有审核' },
  manager:   { key: 'manager',   name: '管理人员', desc: '销售订单·管理审核节点' },
  finance:   { key: 'finance',   name: '财务人员', desc: '销售订单·财务审核节点' },
  warehouse: { key: 'warehouse', name: '仓库人员', desc: '入库 / 退库 / 备货打包上传' },
  shipping:  { key: 'shipping',  name: '发货人员', desc: '打印快递单、上传单号、发货' },
  sales:     { key: 'sales',     name: '销售人员', desc: '申请订单' }
}

// 各角色默认权限（管理员可单独赋予/收回）
const DEFAULT_PERMS = {
  admin:     ['user:manage','order:view','order:create','order:audit_manager','order:audit_finance','stock:in','stock:out','stock:return','order:pack','order:ship','price:view'],
  manager:   ['order:view','order:audit_manager','price:view'],
  finance:   ['order:view','order:audit_finance','price:view'],
  warehouse: ['order:view','stock:in','stock:return','order:pack'],
  shipping:  ['order:view','order:ship'],
  sales:     ['order:view','order:create','stock:out']
}

const PERM_NAMES = {
  'user:manage': '用户管理',
  'order:view': '查看订单',
  'order:create': '申请订单',
  'order:audit_manager': '管理审核',
  'order:audit_finance': '财务审核',
  'stock:in': '入库',
  'stock:out': '出库',
  'stock:return': '退库',
  'order:pack': '备货打包',
  'order:ship': '发货',
  'price:view': '查看价格'
}

// 审批链定义：每条链是一组有序审核人（username），外加抄送人
// 销售链：提交人 → 秦天宇(qty2026) → 赵原野(zyy2026) → 祖冬银(zdy2026)
// 入库/退库/撤销链：提交人 → 黎明(liming2026) → 赵原野(zyy2026) → 祖冬银(zdy2026)
// 所有流程抄送葛静(gj2026)
const APPROVAL_CHAINS = {
  outbound: { name: '销售出库', steps: ['qty2026', 'zyy2026', 'zdy2026'], cc: ['gj2026'] },
  inbound:  { name: '采购入库', steps: ['liming2026', 'zyy2026', 'zdy2026'], cc: ['gj2026'] },
  return:   { name: '退库',     steps: ['liming2026', 'zyy2026', 'zdy2026'], cc: ['gj2026'] },
  revoke:   { name: '撤销',     steps: ['liming2026', 'zyy2026', 'zdy2026'], cc: ['gj2026'] }
}

// 审批状态
const APPROVAL_STATUS = {
  pending:  { key: 'pending',  name: '待审核' },
  approved: { key: 'approved', name: '已通过' },
  rejected: { key: 'rejected', name: '已驳回' }
}

// 订单状态机
const ORDER_STATUS = {
  pending:          { key: 'pending',          name: '待审核',      next: ['manager_approved','rejected'] },
  manager_approved: { key: 'manager_approved', name: '管理已审',    next: ['finance_approved','rejected'] },
  finance_approved: { key: 'finance_approved', name: '财务已审',    next: ['packed','rejected'] },
  packed:           { key: 'packed',           name: '已打包待发货', next: ['done','stock_short'] },
  done:             { key: 'done',             name: '已完成',      next: [] },
  rejected:         { key: 'rejected',         name: '已驳回',      next: [] },
  stock_short:      { key: 'stock_short',      name: '库存不足',    next: ['packed'] }
}

module.exports = { ROLES, DEFAULT_PERMS, PERM_NAMES, ORDER_STATUS, APPROVAL_CHAINS, APPROVAL_STATUS }
