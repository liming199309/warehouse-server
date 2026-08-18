# 需要 IT 同事给我的 4 个值

> 同事在钉钉后台开权限完成后，请把这 4 个值复制发我，我配到 Render 环境变量里就能用了。

---

## 值 1：DINGTALK_CORP_ID（企业 ID）

**含义**：你公司的钉钉企业唯一标识

**在哪找**：
- oa.dingtalk.com → 右上角"企业信息" → **CorpID（企业 ID）**

**长什么样**：
```
ding1234567890abcdef1234
```

---

## 值 2：DINGTALK_AGENT_ID（应用 AgentId）

**含义**：你这个微应用的 ID（一个企业可建多个应用，区分用）

**在哪找**：
- open-dev.dingtalk.com → 我的应用 → 找到刚创建的"H5 微应用"
- 左侧菜单 → **基础信息** → **AgentId**

**长什么样**：
```
1234567890
```
（纯数字）

---

## 值 3：DINGTALK_APP_KEY（原 AppId）

**含义**：应用的"身份证号"，用来调钉钉 API

**在哪找**：
- open-dev.dingtalk.com → 我的应用 → 你的应用 → **基础信息**
- 找 **AppKey**（旧版叫 AppId）字段

**长什么样****：
```
dingxxxxxxxxxxxxxxx
```

---

## 值 4：DINGTALK_APP_SECRET（应用密钥）

**含义**：应用的"密码"，跟 AppKey 配对使用

**在哪找**：
- 同一个页面 → **AppSecret** 字段
- 默认隐藏 → 点"查看"或"复制"
- ⚠️ **只显示一次**，复制后请立即保存

**长什么样**：
```
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 复选清单

让同事做完权限开通后，**对照下面打勾**，然后把这 4 个值发给我：

- [ ] 步骤 1：公司注册钉钉企业完成（oa.dingtalk.com 可登录）
- [ ] 步骤 2：把我（开放平台账号）设为"应用管理员"
- [ ] 步骤 3：在开放平台创建了"H5 微应用"
- [ ] 步骤 4：拿到上面 4 个值
- [ ] 步骤 5：把 4 个值发我

---

## 给我时的格式

最方便我用这个格式发：

```
DINGTALK_CORP_ID=ding1234567890abcdef1234
DINGTALK_AGENT_ID=1234567890
DINGTALK_APP_KEY=dingxxxxxxxxxxxxxxx
DINGTALK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ AppSecret 是机密，**别截图发群**，直接微信私聊发我

---

## 我拿到后会做的事

1. 在 Render 后台把这 4 个值填到 Environment Variables
2. 钉钉后端 `/api/auth/dingtalk-login` 就能用了
3. 配置应用首页 URL = `https://你的Render域名/`
4. 提交应用审核
5. 审核通过后同事帮忙发布到工作台
6. 员工打开钉钉 → 工作台 → 进销存 → 自动登录

---

## 还需要一项操作（在我把环境变量配好后）

**请同事帮忙做最后一步**：在开放平台 → 你的应用 → **权限管理** → 勾选以下权限：
- ✅ **企业内用户 userid 获取**
- ✅ **成员信息读**

不勾的话，钉钉 getuserinfo 接口会返回 60011 权限不足。
