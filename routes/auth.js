const express = require('express')
const router = express.Router()
const auth = require('../auth')
const db = require('../db')
const { DEFAULT_PERMS, ROLES } = require('../roles')

// ===== 账号密码登录（兼容老用法） =====
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ success: false, msg: '请输入账号和密码' })
  try {
    const user = auth.login(username, password)
    if (!user) return res.status(401).json({ success: false, msg: '账号或密码错误' })
    // 多设备登录：不再生成 sid 顶掉旧设备，允许多台设备同时登录同一账号
    const token = auth.signToken(user)
    res.json({ success: true, token, user })
  } catch (e) {
    console.error('[login] 异常：', e)
    // 数据库断连时给出友好提示（不暴露 SQL 细节）
    const msg = (e && e.message) || ''
    if (/Connection terminated|ECONNRESET|ETIMEDOUT|ENOTFOUND|connection terminated/i.test(msg)) {
      return res.status(503).json({ success: false, msg: '数据库连接断开，请稍后重试（系统正在自动重连）' })
    }
    res.status(500).json({ success: false, msg: '登录失败：' + msg })
  }
})

// ===== 钉钉企业免登 =====
// 流程：
//   1) 钉钉 E 应用前端 dd.getAuthCode({ corpId }) 拿到一次性 code
//   2) 前端把 code 发到本接口
//   3) 本接口用 AppSecret 调钉钉 gettoken → getuserinfo → user/get
//   4) 拿到钉钉 userid / name / mobile / dept
//   5) 内部 user 表用钉钉 userid 当 username，找不到则按规则自动创建
//   6) 签发我方 JWT 返回前端
router.post('/dingtalk-login', async (req, res) => {
  const { code } = req.body || {}
  if (!code) return res.status(400).json({ success: false, msg: '缺少钉钉 authCode' })

  // 检查钉钉配置
  const corpId = process.env.DINGTALK_CORP_ID
  const agentId = process.env.DINGTALK_AGENT_ID
  const appKey = process.env.DINGTALK_APP_KEY  // 新版开放平台用 AppKey（旧版用 AppId）
  const appSecret = process.env.DINGTALK_APP_SECRET
  if (!corpId || !agentId || !appKey || !appSecret) {
    return res.status(500).json({ success: false, msg: '服务端未配置钉钉应用信息（DINGTALK_CORP_ID / AGENT_ID / APP_KEY / APP_SECRET）' })
  }

  try {
    // 1) 拿 access_token（钉钉 2025-09 新版 API：POST + JSON body）
    const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey, appSecret })
    })
    const tokenJson = await tokenRes.json()
    if (!tokenJson.accessToken) {
      return res.status(502).json({ success: false, msg: '钉钉 gettoken 失败：' + (tokenJson.errmsg || JSON.stringify(tokenJson)) })
    }
    const accessToken = tokenJson.accessToken

    // 2) 用 code 换 userid
    const userInfoRes = await fetch(`https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
    const userInfoJson = await userInfoRes.json()
    if (!userInfoJson.result || !userInfoJson.result.userid) {
      return res.status(502).json({ success: false, msg: '钉钉 getuserinfo 失败：' + (userInfoJson.errmsg || JSON.stringify(userInfoJson)) })
    }
    const { userid, unionid } = userInfoJson.result

    // 3) 拿用户详细信息
    const userDetailRes = await fetch(`https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${encodeURIComponent(accessToken)}&userid=${encodeURIComponent(userid)}`)
    const userDetailJson = await userDetailRes.json()
    if (!userDetailJson.result) {
      return res.status(502).json({ success: false, msg: '钉钉 user/get 失败：' + (userDetailJson.errmsg || JSON.stringify(userDetailJson)) })
    }
    const dt = userDetailJson.result
    const dtName = dt.name || userid
    const dtMobile = dt.mobile || ''
    const dtDept = (dt.dept_id_list && dt.dept_id_list[0]) ? String(dt.dept_id_list[0]) : ''

    // 4) 在内部 user 表中按 userid 查
    const state = db.getState()
    let user = state.users.find(u => u.username === userid)
    let isNew = false
    if (!user) {
      // 自动创建内部账号（默认角色 sales / 仓库人员，按 dept 简单映射）
      isNew = true
      const roleKey = mapDingTalkDeptToRole(dtDept)
      const newUser = {
        username: userid,
        name: dtName,
        password: '',  // 钉钉用户不需要密码
        dingtalkUnionid: unionid || '',
        dingtalkMobile: dtMobile,
        roleKey,
        role: ROLES[roleKey] ? ROLES[roleKey].name : roleKey,
        perms: DEFAULT_PERMS[roleKey] || [],
        area: dtDept || '钉钉导入',
        phone: dtMobile,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: 'dingtalk-auto'
      }
      // mutate 写入（保持并发安全）
      db.mutate({ fn: (s) => { s.users.push(newUser); return { success: true } } })
      user = newUser
    } else if (user.status === 'disabled') {
      return res.status(403).json({ success: false, msg: '账号已被禁用，请联系管理员' })
    } else {
      // 已有账号：更新钉钉信息（姓名/手机可能变更）
      if (dtName && user.name !== dtName) user.name = dtName
      if (dtMobile && user.phone !== dtMobile) user.phone = dtMobile
    }

    // 5) 签发 JWT（多设备登录：不再顶掉旧设备）
    const tokenUser = {
      username: user.username,
      name: user.name,
      role: user.role,
      roleKey: user.roleKey,
      perms: user.perms,
      area: user.area || ''
    }
    const token = auth.signToken(tokenUser)
    res.json({ success: true, token, user: tokenUser, isNew, source: 'dingtalk' })
  } catch (e) {
    console.error('[dingtalk-login] 异常：', e)
    res.status(500).json({ success: false, msg: '钉钉免登失败：' + e.message })
  }
})

// 钉钉部门 ID → 内部角色 简单映射
function mapDingTalkDeptToRole(deptId) {
  // 默认给仓库人员（保守权限，员工内部用都合适）
  // 你可以在 oa.dingtalk.com 给部门改名后改这里
  return 'warehouse'
}

// ===== 获取当前登录用户 =====
router.get('/me', auth.authRequired, (req, res) => {
  res.json({ success: true, user: req.user })
})

module.exports = router
