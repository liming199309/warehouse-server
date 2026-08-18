# 钉钉微应用部署全流程

> 把牧龙山石斛进销存从"内网用"变成"公司全员在钉钉里点开就用"。

---

## 总体流程

```
本地开发完成
  ↓ 部署到 Render（公网 URL）
  ↓ 钉钉开放平台创建 H5 微应用
  ↓ IT 同事开通企业 + 给权限 + 给你 4 个值
  ↓ 你把 4 个值配到 Render
  ↓ 钉钉审核应用（1-2 天）
  ↓ IT 发布到工作台
  ↓ 员工点开就用
```

**总成本**：0 元（员工内部用，钉钉免费）

**预计耗时**：1-3 天（含审核）

---

## Part 1：后端公网部署（必须先做）

参考 [DEPLOY.md](./DEPLOY.md) 把后端部署到 Render + Neon，拿到一个 `https://xxx.onrender.com` 的 URL。

**这一步必须先做**——钉钉微应用的"应用首页 URL"要填这个，否则钉钉服务器不知道去哪儿拉页面。

---

## Part 2：钉钉开放平台创建 H5 微应用

### 2.1 注册开放平台开发者

1. 打开 https://open-dev.dingtalk.com
2. 点右上角"开发者注册"
3. 填手机号 + 邮箱（跟钉钉账号一致）
4. 完成实名（个人身份证即可）

### 2.2 创建应用

1. 登录后 → **应用开发** → **企业内部应用** → 右上角 **创建应用**
2. 填：
   - **应用名称**：`牧龙山石斛进销存`
   - **应用描述**：`内部使用的进销存管理系统`
   - **应用图标**：随便上传个 logo（不强求，临时也行）
3. 点 **确定创建**

### 2.3 配置应用信息

进入应用详情页，配置以下几项：

#### (1) 基础信息
- **应用首页 URL**：`https://你的Render域名.onrender.com/dingtalk/`（我们等下要做这个页面）
- **PC 端首页 URL**：跟上面一样
- **应用 AgentId、AppKey、AppSecret**：自动生成，**复制保存**（要发给后端）

#### (2) 权限管理
勾选以下权限（必须）：
- ✅ **企业内用户 userid 获取**（用 getuserinfo）
- ✅ **成员信息读**（用 user/get）

#### (3) 安全设置
- **IP 白名单**（可选）：如果你只想让钉钉服务器访问，可以加 `47.96.0.0/16` 等钉钉 IP 段
- 暂时不填也行

#### (4) 版本管理与发布
- 先保存草稿，**最后再发布**

---

## Part 3：让 IT 同事帮忙

把 [NEEDED-FROM-ADMIN.md](./NEEDED-FROM-ADMIN.md) 发给 IT，他需要做这几件事：

### IT 操作清单

1. **登录 oa.dingtalk.com**（超级管理员账号）
2. **公司还没注册企业？** → 创建企业（营业执照审核 1-3 天）
3. **权限管理** → **角色管理** → 把你的开放平台账号（手机号）设为 **应用管理员**
4. **应用管理** → **自建应用** → 创建一个分组（例："业务系统"）
5. 在开放平台 → 你的应用 → **基础信息** → 找到以下 4 个值 → 发给你：
   - CorpID
   - AgentId
   - AppKey
   - AppSecret

---

## Part 4：把 4 个值配到 Render

拿到 IT 给的 4 个值后：

1. Render 控制台 → 你的 Web Service → **Environment** 标签
2. 添加 4 个环境变量：
   - `DINGTALK_CORP_ID` = `ding1234...`
   - `DINGTALK_AGENT_ID` = `1234567890`
   - `DINGTALK_APP_KEY` = `dingxxxx...`
   - `DINGTALK_APP_SECRET` = `xxxxx...`
3. 点 **Save Changes** → 自动重新部署

### 验证后端钉钉接口就绪

部署完成后（30-50 秒）：

```bash
curl -s https://你的域名.onrender.com/api/health
# 应该返回：{"ok":true,"time":...,"db":"postgres"}
```

```bash
# 测钉钉免登接口（缺 code 会报参数错误，说明接口通了）
curl -X POST https://你的域名.onrender.com/api/auth/dingtalk-login \
  -H "Content-Type: application/json" \
  -d '{}'
# 应该返回：{"success":false,"msg":"缺少钉钉 authCode"}
```

✅ 看到上面说明钉钉免登路由就绪。

---

## Part 5：创建钉钉 E 应用前端

我们在 `warehouse-dingtalk/` 目录创建 E 应用。

### 5.1 项目结构

```
warehouse-dingtalk/
├── app.js              # 入口逻辑（dd.getAuthCode 调后端免登）
├── app.json            # 钉钉 E 应用配置
├── app.axml            # 全局布局
├── pages/
│   ├── home/           # 首页（仪表盘）
│   ├── inventory/      # 库存列表
│   ├── inbound/        # 入库
│   ├── outbound/       # 销售出库
│   ├── return/         # 退库
│   ├── detail/         # 详情
│   ├── records/        # 记录
│   └── mine/           # 我的
└── utils/
    └── util.js
```

### 5.2 关键代码

**app.js（核心：免登）**：
```js
App({
  onLaunch() {
    // 1) 拿 corpId（从环境变量或硬编码）
    const corpId = 'ding你的corpId'

    // 2) 钉钉免登
    dd.getAuthCode({ corpId })
      .then(res => {
        // 3) 把 code 发到后端换我方 JWT
        return fetch('https://你的Render域名/api/auth/dingtalk-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: res.code })
        })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.globalData.token = res.token
          this.globalData.userInfo = res.user
          dd.setStorageSync({ key: 'token', data: res.token })
        } else {
          dd.alert({ content: '登录失败：' + res.msg })
        }
      })
  },
  globalData: { token: '', userInfo: null }
})
```

### 5.3 我帮你做

不需要你写代码，**我会在你说"开始"后**自动创建 `warehouse-dingtalk/` 项目并把 7 个页面（首页/库存/入库/出库/退库/详情/记录/我的）全部用钉钉的 axml 语法改写。

**预计 1-2 小时**完成前端骨架。

---

## Part 6：审核 + 发布

### 6.1 提交审核

1. 开放平台 → 你的应用 → **版本管理与发布**
2. 点 **创建新版本** → 填版本号 + 说明
3. 点 **提交审核**
4. 等待 1-2 天（企业内部应用审核很快）

### 6.2 IT 同事帮忙发布

审核通过后：

1. oa.dingtalk.com → **应用管理** → 找到你的应用
2. 点 **发布到工作台**
3. 选择可见范围（默认"全员"或"指定部门"）

### 6.3 员工使用

员工打开钉钉 → **工作台** → 看到"进销存"图标 → 点开 → 自动登录 → 用！

---

## 常见问题

### Q1：审核被拒怎么办？
企业内部应用审核很宽松，常见被拒原因：
- 没勾"用户读取"权限 → 补勾再提交
- 应用首页 URL 填错 → 改成 Render 域名
- 描述不清楚 → 改成"内部使用"+"企业进销存管理"

### Q2：员工点开应用报"无权限"？
说明 IT 还没把你的应用发布到工作台，或者可见范围没包含该员工。

### Q3：钉钉打开很慢？
- 第一次冷启动 30-50 秒（UptimeRobot 解决）
- 钉钉小程序本身要预加载，时间略长

### Q4：能不能让某些员工看不到？
- 发布时选可见范围
- 内部账号的 `status: 'disabled'` 字段设为禁用也能阻止登录

### Q5：数据存在哪里？
- Neon Postgres（云端）
- 跟微信小程序、PC 后台**完全共享**

### Q6：能撤回吗？
- 应用可随时下架
- 钉钉企业可解散（数据还在 Neon，需要手动删）

---

## 总结：完整时间表

| 阶段 | 谁做 | 耗时 | 成本 |
|---|---|---|---|
| Render 部署 | 你/我 | 30-60 分钟 | 0 元 |
| 钉钉开放平台注册 | 你 | 5 分钟 | 0 元 |
| 创建 H5 微应用 | 你 | 10 分钟 | 0 元 |
| IT 开通权限 | IT 同事 | 15 分钟 | 0 元 |
| 拿 4 个值 | IT → 你 | 微信转 | 0 元 |
| 配到 Render | 你/我 | 5 分钟 | 0 元 |
| 钉钉 E 应用前端 | 我 | 1-2 小时 | 0 元 |
| 提交审核 | 你 | 1 分钟 | 0 元 |
| 钉钉审核 | 钉钉 | 1-2 天 | 0 元 |
| 发布到工作台 | IT | 1 分钟 | 0 元 |
| **总计** | | **1-3 天** | **0 元** |

---

## 你现在要做的

1. ✅ 把 [NEEDED-FROM-ADMIN.md](./NEEDED-FROM-ADMIN.md) 发给 IT 同事
2. ✅ IT 在开通权限期间，你去 Render 完成 Part 1 部署
3. ⏳ 等 IT 把 4 个值发你
4. ⏳ 你发我，我配到 Render
5. ⏳ 你说"开始"，我做钉钉 E 应用前端
