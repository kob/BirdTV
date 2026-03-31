# BirdTV 部署总览

## 🎯 推荐部署方案

**SAP BAS（开发） + CloudStudio（生产） + Cloudflare（CDN）**

```
┌─────────────────┐
│   SAP BAS       │ ← 开发环境
│  (Code + Test)  │
└────────┬────────┘
         │ git push
         ↓
┌─────────────────┐
│  CloudStudio    │ ← 生产环境（静态托管 + 云函数）
│  (Backend)      │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│   Cloudflare    │ ← CDN 加速 + 全球分发
│  (CDN/Workers)  │
└────────┬────────┘
         │
         ↓
    🌍 全球用户
```

## 📋 快速开始

### 1. SAP BAS 开发环境

参考：[BAS_SETUP.md](./BAS_SETUP.md)

```bash
# 在 BAS 中
git clone <repo>
cd BirdTV
npm install
npm run start:web:local
```

### 2. CloudStudio 生产部署

参考：[CLOUDSTUDIO_DEPLOY.md](./CLOUDSTUDIO_DEPLOY.md)

```bash
# 一键部署脚本
bash deploy.sh

# 或手动部署
npm install -g @cloudbase/cli
tcb login
tcb deploy
```

### 3. Cloudflare CDN 加速

使用 `cloudflare-worker.js` 启用 CDN：

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

## 📁 项目文件说明

### 核心文件

| 文件 | 说明 |
|------|------|
| `birdtv.js` | 后端服务（代理 + API） |
| `web/index.html` | 桌面端播放器页面 |
| `web/mobile.html` | 手机端简洁版页面 |
| `auth.js` | 认证模块 |
| `backend/` | 后端控制器和服务 |

### 配置文件

| 文件 | 说明 |
|------|------|
| `.env` | 环境变量（生产环境需手动配置） |
| `cloudbaserc.json` | CloudStudio 部署配置 |
| `cloudflare-worker.js` | Cloudflare Worker 代码 |


### VS Code 配置

| 文件 | 说明 |
|------|------|
| `.vscode/launch.json` | 调试配置（BAS 开发使用） |

### 文档

| 文件 | 说明 |
|------|------|
| `BAS_SETUP.md` | SAP BAS 开发环境配置 |
| `CLOUDSTUDIO_DEPLOY.md` | CloudStudio 部署详细指南 |
| `DEPLOYMENT_OVERVIEW.md` | 本文件（部署总览） |
| `MOBILE_GUIDE.md` | 手机端使用指南 |
| `TROUBLESHOOTING.md` | 问题排查指南 |

## 🌐 访问地址

部署完成后：

| 访问类型 | 地址 |
|----------|------|
| 用户入口 | `https://xxx.tcb.qcloud.la` |
| 手机端 | `https://xxx.tcb.qcloud.la/mobile.html` |
| 调试页面 | `https://xxx.tcb.qcloud.la/debug.html` |
| 管理后台 | `https://xxx.tcb.qcloud.la/admin.html` |
| 登录页面 | `https://xxx.tcb.qcloud.la/login.html` |
| API 接口 | `https://xxx.tcb.qcloud.la/api/*` |

## 🔧 环境变量

生产环境必需配置：

```env
NODE_ENV=production
PORT=8771
M3U_PROXY_STATIC_ROOT=web
```

可选配置（在 CloudStudio 控制台设置）：

```env
REDIS_URL=redis://xxx
JWT_SECRET=your-secret-key
# ... 其他配置
```

## 🔐 安全配置

### 1. 启用 M3U Proxy 鉴权

在管理后台设置：
- 系统设置 → M3U Proxy 鉴权 → 开启

### 2. 配置 JWT Secret

在 `.env` 或 CloudStudio 环境变量中设置：
```env
JWT_SECRET=your-strong-random-secret-key
```

### 3. Cloudflare 安全规则

- 启用防火墙规则
- 配置访问速率限制
- 开启 Bot 保护

## 📊 监控和日志

### CloudStudio

- 云日志：实时查看后端运行日志
- 云函数监控：CPU、内存使用情况
- 请求统计：API 调用统计

### Cloudflare

- Analytics：流量分析
- Cache：缓存命中率
- Security：安全事件

## 🚨 故障排查

### 常见问题

1. **部署后无法访问**
   - 检查 CloudStudio 服务状态
   - 查看云日志排查错误

2. **M3U 代理返回 502**
   - 检查上游源地址
   - 验证 UA 配置
   - 查看后端日志

3. **Cloudflare 缓存不更新**
   - 清除 Cloudflare 缓存
   - 检查 Worker 配置

4. **HTTPS 页面无法播放 HTTP 源**
   - 项目已实现自动 HTTPS 升级
   - 检查后端日志确认升级流程

### 调试模式

```bash
# 在 BAS 中启动调试模式
npm run start:web:local

# 使用 VS Code 调试器
# 按 F5 选择配置启动
```

## 📚 技术支持

- [CloudStudio 文档](https://docs.cloudbase.net/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [SAP BAS 文档](https://developers.sap.com/topics/business-application-studio.html)

## 🔄 更新部署

代码修改后重新部署：

```bash
# 1. BAS 中提交代码
git add .
git commit -m "update"
git push

# 2. 部署到 CloudStudio
bash deploy.sh

# 3. 更新 Cloudflare Worker（如需）
wrangler deploy
```

## 📞 联系支持

如有问题，请提供：
1. 错误截图或日志
2. 部署环境（BAS/CloudStudio 版本）
3. 复现步骤
