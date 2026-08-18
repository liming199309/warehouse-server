# UptimeRobot 防冷启动配置

> Render 免费 Web Service 15 分钟无活动会进入休眠（冷启动需 30-50 秒）。
> UptimeRobot 每 5 分钟自动 ping 一次你的 URL，让 Render 以为一直有人用，**永久秒开**。

---

## 步骤（5 分钟搞定）

### 1. 注册 UptimeRobot

1. 打开 https://uptimerobot.com
2. 点 **Register for FREE**
3. 填邮箱 + 密码 → 注册
4. 进邮箱点验证链接

---

### 2. 添加监控

1. 登录后 → 顶部 **+ Add New Monitor**
2. 填：
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `牧龙山石斛进销存`（随便起）
   - **URL (or IP)**: 你的 Render URL
     ```
     https://mulongshan-warehouse.onrender.com/api/health
     ```
     > ⚠️ **必须带 `/api/health`**，UptimeRobot 会拿到 200 才算数
   - **Monitoring Interval**: `5 minutes`（免费版最短间隔）
3. 点 **Create Monitor**

---

### 3. 等 5 分钟看效果

UptimeRobot 第一次 ping 大约 5 分钟后。登录 UptimeRobot 控制台能看到：

- ✅ Up: monitor 当前在线
- ⏱ Uptime: 累计在线率
- 📊 Response Time: 响应时间（应该 < 1 秒，因为 Render 没休眠）

---

### 4. 验证防冷启动

测试方法（任选）：

#### 方式 A：用浏览器

1. 现在打开你的应用 URL → 应该秒开（≤ 1 秒）
2. 等 30 分钟不动
3. 再打开 → 仍然秒开 ✅

#### 方式 B：命令行

```bash
# 第一次测
time curl https://你的URL.onrender.com/api/health
# 输出: 0.1 秒

# 等 30 分钟后
time curl https://你的URL.onrender.com/api/health
# 输出: 0.1 秒（不再是 30 秒）
```

---

## 免费额度

UptimeRobot 免费版：
- 50 个 monitor
- 5 分钟最短间隔
- 邮件告警
- ✅ 1 个 monitor + 5 分钟间隔对你完全够用

---

## 备选方案

如果不想用 UptimeRobot（要注册），还有几个等价方案：

| 方案 | 免费额度 | 难度 |
|---|---|---|
| **UptimeRobot** | 50 监控 / 5 分钟 | ⭐ 最推荐 |
| **Kaffeine** | 仅 1 个 monitor | ⭐ 跟 UptimeRobot 类似 |
| **cron-job.org** | 完全无限 | ⭐⭐ 需要写 cron 表达式 |
| 自己写个 curl 循环 | - | ⭐⭐ 找台常开电脑跑 |

---

## 一键脚本（如果不想注册任何平台）

如果你公司有台 24 小时开机的电脑（前台机/服务器），可以自己 ping：

### Windows 计划任务

1. 打开"任务计划程序"
2. 创建基本任务 → 触发器"每天"→ 重复间隔 5 分钟
3. 操作"启动程序"：
   ```
   程序: curl
   参数: https://你的URL.onrender.com/api/health
   ```
4. 启用

### Linux cron

```bash
crontab -e
# 加一行：
*/5 * * * * curl -s https://你的URL.onrender.com/api/health > /dev/null
```

---

## 总结

- **UptimeRobot 注册 + 加 1 个 monitor = 5 分钟**
- **彻底防冷启动 = 服务永远秒开**
- **0 元**

完成！
