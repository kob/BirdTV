# BirdTV CloudStudio 部署指南

## 📋 部署前准备

### 1. 本地测试

在 SAP BAS 中先本地验证项目运行正常：

```bash
cd /workspace/BirdTV

# 安装依赖
npm install

# 启动开发服务器（前端 + 后端）
npm run start:web:local

# 访问 http://localhost:8771 验证功能
```

**测试项目功能：**
- [ ] 前端页面加载正常
- [ ] 登录功能正常
- [ ] M3U 源导入成功
- [ ] 频道播放正常
- [ ] 后端管理功能正常
- [ ] API 接口响应正常

### 2. 环境变量配置

检查 `.env` 文件，确保生产环境配置正确：

```env
# 必填项
NODE_ENV=production
PORT=8771
M3U_PROXY_STATIC_ROOT=web

# 可选项（按需配置）
REDIS_URL=redis://xxx
JWT_SECRET=your-secret-key
# ... 其他配置
```

## 🚀 CloudStudio 部署步骤

### 方法 1：通过 IDE 部署（推荐）

1. **连接 CloudStudio**
   - 点击 IDE 右上角 **Integration** → **CloudStudio**
   - 完成授权登录

2. **初始化项目**
   ```bash
   cd /workspace/BirdTV

   # 安装 CloudStudio CLI（如果未安装）
   npm install -g @cloudbase/cli

   # 登录 CloudStudio
   tcb login
   ```

3. **部署**
   ```bash
   # 部署整个项目（静态文件 + 后端服务）
   tcb deploy
   ```

4. **获取访问地址**
   - 部署成功后，CloudStudio 会分配一个临时域名
   - 格式：`https://xxx.tcb.qcloud.la`

### 方法 2：通过 Web 控制台部署

1. 登录 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 创建新环境或选择现有环境
3. 上传项目文件（排除 `node_modules`）
4. 配置环境变量
5. 启动服务

## 🌐 Cloudflare CDN 加速配置

部署完成后，启用 Cloudflare 加速：

### 1. 域名接入 Cloudflare

- 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 添加域名
- 将域名 DNS 指向 CloudStudio 分配的域名（CNAME 记录）
- DNS 记录选择 **橙色云朵**（Proxied）

### 2. 部署 Cloudflare Worker

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 Worker
wrangler init birdtv-worker

# 将 cloudflare-worker.js 内容复制到 wrangler.toml 对应的 worker 文件
# 修改 BACKEND_URL 为你的 CloudStudio 域名

# 部署 Worker
wrangler deploy
```

### 3. 绑定自定义域名

在 Cloudflare Worker 设置中：
- 添加自定义域名：`tv.yourdomain.com`
- Worker 会自动处理所有请求并代理到 CloudStudio

## 📊 监控和日志

### CloudStudio 控制台

- **云日志**：查看后端服务运行日志
- **云函数监控**：CPU、内存使用情况
- **请求统计**：API 调用次数和耗时

### Cloudflare Analytics

- **流量统计**：全球访问分布
- **缓存命中率**：缓存效果
- **安全事件**：攻击拦截记录

## 🔧 常见问题

### Q: 部署后无法访问？

A: 检查以下项：
1. CloudStudio 服务是否启动成功
2. 环境变量是否正确配置
3. 端口 8771 是否开放
4. 查看 CloudStudio 日志排查错误

### Q: M3U 代理返回 502？

A: 可能原因：
1. 上游源地址不可达
2. 代理 UA 配置错误
3. 跨域问题（已通过 CORS 解决）

### Q: Cloudflare 缓存不更新？

A: 手动清除缓存：
1. Cloudflare Dashboard → Caching → Configuration → Purge Everything
2. 或使用 Worker API 清除缓存

### Q: HTTPS 页面无法播放 HTTP 源？

A: 项目已实现自动 HTTPS 升级逻辑：
1. 自动尝试 `http://` → `https://` 升级
2. 失败后自动回退到代理模式
3. 无需手动配置

## 📝 项目文件说明

| 文件/目录 | 说明 |
|-----------|------|
| `web/` | 前端静态文件（HTML/CSS/JS） |
| `birdtv.js` | 后端服务（代理 + API） |
| `backend/` | 后端控制器和业务逻辑 |
| `auth.js` | 认证模块 |
| `data/` | 数据文件（频道、源、设置） |
| `cloudbaserc.json` | CloudStudio 部署配置 |
| `cloudflare-worker.js` | Cloudflare Worker 代码 |

## 🔐 安全建议

1. **启用 M3U Proxy 鉴权**（后端管理 → 系统设置）
2. 配置强 JWT Secret
3. 启用 Cloudflare 防火墙规则
4. 定期更新依赖包
5. 启用 HTTPS（Cloudflare 自动提供）

## 📞 技术支持

- CloudStudio 文档：https://docs.cloudbase.net/
- Cloudflare Workers 文档：https://developers.cloudflare.com/workers/
