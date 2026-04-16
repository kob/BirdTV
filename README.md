# BirdTV

IPTV 管理系统，支持 M3U 流代理、频道管理、EPG 节目单、订阅导出和用户认证。

## 功能特性

- **M3U 流代理** — 代理远程 IPTV 流，支持自定义 UA、重定向跟随、Cloudflare Worker 代理绕过 WAF
- **频道管理** — CRUD、分组、搜索、分页、批量操作，支持多种播放器（Shaka/HLS.js/MPEG-TS/原生）和流类型（DASH/HLS/TS）
- **M3U 源管理** — URL 解析/文件上传、源测试、一键导入频道
- **EPG 节目单** — XMLTV 格式解析、频道-EPG 映射、当前/下一节目查询
- **导出与订阅** — 导出 M3U 文件、短链接订阅（支持过期时间/下载次数/IP 绑定）
- **定时任务** — Cron 表达式调度，自动导入/导出
- **认证系统** — JWT + Redis，角色权限（admin/user/guest），用户管理
- **多实例隔离** — 通过 `BIRDTV_SYSTEM_ID` 前缀实现数据隔离
- **双存储架构** — Redis/KVRocks 优先，JSON 文件自动降级，支持双向同步

## 项目结构

```
BirdTV/
├── server/              # Express API 服务器
│   ├── server.js        # 入口：初始化应用、注册路由
│   ├── middleware/       # 认证中间件
│   └── routes/          # API 路由（auth/channels/sources/exports/epg/scheduler/settings/proxy）
├── backend/             # 业务逻辑层（两种模式共用）
│   ├── auth.js          # 认证核心
│   ├── controllers/     # 控制器（6个）
│   ├── models/          # 数据模型（8个）
│   ├── services/        # 服务（存储/调度/Token）
│   └── managers/        # UA 管理器
├── web-vue/             # Vue 3 前端
│   └── src/
│       ├── api/         # API 封装
│       ├── router/      # 路由（Login/Player/Admin/Mobile）
│       ├── stores/      # Pinia 状态管理
│       └── views/       # 页面组件
├── birdtv.js            # 单文件一体化服务器（合一模式）
└── data/                # JSON 文件数据存储（降级时使用）
```

## 快速开始

### 环境要求

- Node.js >= 20
- KVRocks / Redis（必须）

### Docker 部署（推荐）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，至少修改 AUTH_JWT_SECRET 和 AUTH_REDIS_HOST

# 启动（后端 + KVRocks，前端由后端托管）
docker compose -f docker-compose.separation.yml up --build -d

# 访问 http://localhost:8771
```

前后端独立部署时启用 `standalone` profile：

```bash
docker compose -f docker-compose.separation.yml --profile standalone up --build -d
# 前端: http://localhost:3000  后端: http://localhost:8771
```

### 手动部署

```bash
# 安装后端依赖
cd server && npm install --production && cd ..

# 构建前端
cd web-vue && npm install && npm run build && cd ..

# 配置环境变量
cp .env.example .env
# 编辑 .env

# 启动
export NODE_PATH=./server/node_modules
node server/server.js
```

### 开发模式

```bash
./dev.sh          # 前后端同时启动
./dev.sh server   # 仅后端（nodemon 热重载）
./dev.sh web      # 仅前端（Vite dev server :5173）
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BIRDTV_PORT` | `8771` | 监听端口 |
| `BIRDTV_HOST` | `0.0.0.0` | 监听地址 |
| `AUTH_ENABLED` | `true` | 启用认证 |
| `AUTH_JWT_SECRET` | — | JWT 密钥（**生产环境必须修改**） |
| `AUTH_TOKEN_EXPIRE_DAYS` | `7` | Token 有效期 |
| `AUTH_DEFAULT_ADMIN` | `admin` | 默认管理员用户名 |
| `AUTH_DEFAULT_PASSWORD` | `admin123` | 默认管理员密码 |
| `AUTH_REDIS_HOST` | — | KVRocks/Redis 主机 |
| `AUTH_REDIS_PORT` | `6666` | KVRocks/Redis 端口 |
| `AUTH_REDIS_PASSWORD` | — | KVRocks/Redis 密码 |
| `BIRDTV_SYSTEM_ID` | `default` | 多实例隔离标识 |
| `CLOUDFLARE_WORKER_URL` | — | CF Worker 代理 URL |
| `SERVE_STATIC` | — | 由后端托管前端静态文件 |

完整配置见 `.env.example`。

## API 概览

```
认证     POST /api/auth/login, /api/auth/logout, /api/auth/userinfo, /api/auth/password
用户管理 GET/POST/PUT/DELETE /api/auth/users
频道     GET/POST /api/channels, /api/channels/search, /api/channels/groups
         POST /api/channels/batch, /api/channels/batch/delete, /api/channels/batch/update
源管理   GET/POST /api/sources/m3u, /api/sources/epg
         POST /api/sources/m3u/parse, /api/sources/m3u/upload, /api/sources/m3u/:id/test, /api/sources/m3u/:id/import
导出     POST /api/exports/export, GET /api/exports/download
订阅     POST /api/exports/link, GET /api/exports/links, GET /link/:shortCode
EPG      GET /api/epg/channels, /api/epg/now/:name, /api/epg/now-next/:name
定时任务 GET/POST /api/scheduler/tasks, POST /api/scheduler/tasks/:id/run
设置     GET/PUT /api/settings, GET /api/settings/ua/global
数据同步 POST /api/settings/sync/redis, /api/settings/sync/file
代理     GET /m3u-proxy?url=, /tv-iill?url=
健康检查 GET /health
```

## License

MIT
