# BirdTV

现代化的 IPTV 播放器系统，包含完整的前端播放器、后台管理系统和移动端界面。支持 M3U 播放列表、频道管理、EPG 电子节目单、用户认证等功能。

## ✨ 功能特性

### 📺 播放器
- 支持多种流媒体格式：HLS、DASH、MP4、WebM、TS
- 多种播放器内核：Shaka Player、ArtPlayer、HLS.js、mpegts.js
- 智能播放器选择：根据流媒体类型自动选择最佳播放器
- DRM 支持：Widevine、PlayReady 许可证
- 线路切换：支持多线路快速切换
- 故障转移：播放失败自动切换到备用线路
- 美观的 Luna 主题界面
- 快速加载和响应

### 🎛️ 后台管理
- 完整的用户认证系统（JWT + Redis）
- 频道管理：CRUD、搜索、批量导入、批量操作
- 源配置管理：M3U 源、EPG 源
- EPG 电子节目单：独立管理，多种加载策略
- 用户管理：角色权限、密码管理
- 分组管理：预设分组 + 自定义分组
- UA 管理：全局和频道级 User-Agent 设置
- 系统设置：播放器、缓存、超时等
- 导出管理：M3U 导出、导出记录
- 链接管理：用户专属链接

### 📱 移动端
- 简洁的移动端界面
- 快速搜索频道
- 收藏管理和播放记录
- M3U 导入功能
- 播放器设置

### 🔧 API 服务
- RESTful API 接口
- CORS 支持
- 数据持久化（Redis/JSON 文件）
- 自动缓存机制

## 🚀 快速开始

### 本地部署

#### 1. 环境准备

确保已安装 Node.js (推荐 v18+)：

```bash
node --version
npm --version
```

#### 2. 安装依赖

```bash
cd BirdTV
npm install
```

#### 3. 配置环境变量（可选）

```bash
cp .env.example .env
# 编辑 .env 文件配置
```

#### 4. 启动服务

```bash
# 方式一：使用 npm 命令（推荐）
npm run start:web:local

# 方式二：直接启动
node birdtv.js

# 方式三：使用 PM2（生产环境）
pm2 start birdtv.js --name birdtv
pm2 save
```

#### 5. 访问服务

- **前端播放器**: http://localhost:8771/
- **后台管理**: http://localhost:8771/admin.html
- **移动端**: http://localhost:8771/mobile.html
- **登录页面**: http://localhost:8771/login.html
- **健康检查**: http://localhost:8771/health

**默认账号**: `admin / admin123`（首次登录请修改密码）

## 🐳 Docker 部署

### 镜像信息

- **镜像地址**: `ghcr.io/kob/birdtv:latest`
- **基础镜像**: node:20-alpine
- **包含组件**: BirdTV + Kvrocks (Redis 兼容数据库)

### 使用 Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/birdtv.git
cd birdtv

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，修改关键配置（尤其是 AUTH_JWT_SECRET）

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f birdtv
```

### 使用 Docker 命令

```bash
docker run -d \
  --name birdtv \
  --restart unless-stopped \
  -p 8771:8771 \
  -e AUTH_ENABLED=true \
  -e AUTH_JWT_SECRET=$(openssl rand -hex 32) \
  -e AUTH_DEFAULT_ADMIN=admin \
  -e AUTH_DEFAULT_PASSWORD=admin123 \
  -v birdtv-data:/app/data \
  ghcr.io/kob/birdtv:latest
```

## 📦 部署场景

      <h3 id="ubuntu-服务器">1. Ubuntu 服务器</h3>

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 启动服务（包含 BirdTV + Kvrocks）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f birdtv
docker-compose logs -f kvrocks

# 配置防火墙
sudo ufw allow 8771/tcp
sudo ufw allow 6666/tcp
```

> **说明**: Ubuntu 部署自动包含 Kvrocks Redis 服务，默认端口 6666。BirdTV 会自动连接到本地 Kvrocks 进行数据存储。

### 2. NAS 部署（Synology / QNAP）

**Synology 群晖**：
- 打开 Container Manager
- 创建项目，粘贴 docker-compose.yml 配置
- 点击部署
- 确保端口 8771 和 6666 未被占用

**QNAP 威联通**：
- 打开 Container Station
- 创建应用程序，粘贴 YAML 配置
- 点击创建
- 查看两个容器状态：birdtv 和 birdtv-kvrocks

> **说明**: NAS 部署包含 BirdTV 和 Kvrocks 两个容器，数据分别存储在各自的卷中。

### 3. 软路由部署（OpenWrt / iStoreOS）

```bash
# OpenWrt
opkg update
opkg install docker dockerd docker-compose
/etc/init.d/dockerd start

# 启动 BirdTV + Kvrocks
docker-compose up -d

# 检查容器状态
docker ps

# iStoreOS
# 使用图形界面 Container Station 创建容器
# 确保有足够的内存（建议 512MB 以上）
```

> **说明**: 软路由部署包含完整的 Redis 支持，建议设备内存至少 512MB。Kvrocks 比 Redis 更节省内存，适合嵌入式设备。

### 4. Railway

```bash
npm install -g @railway/cli
railway login
railway init

# 创建 BirdTV + Redis 服务
railway up

# 设置环境变量
railway variables set AUTH_ENABLED=true
railway variables set AUTH_JWT_SECRET=$(openssl rand -hex 32)
railway variables set AUTH_REDIS_HOST=redis
railway variables set AUTH_REDIS_PORT=6379

# 部署
railway up
```

**docker-compose.yml 配置**：
```yaml
version: "3.8"
services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    environment:
      - AUTH_REDIS_HOST=redis
      - AUTH_REDIS_PORT=6379
  redis:
    image: redis:7-alpine
```

### 5. Google IDX

**使用 Docker Compose（推荐）**：
```bash
# 克隆项目
git clone https://github.com/your-repo/birdtv.git
cd birdtv

# 启动 BirdTV + Kvrocks
docker-compose up -d

# 查看日志
docker-compose logs -f

# IDX 会自动创建端口转发
```

**使用 Docker 命令**：
```bash
# 启动 Kvrocks
docker run -d \
  --name kvrocks \
  -p 6666:6666 \
  apache/kvrocks:2.11.0

# 启动 BirdTV
docker run -d \
  --name birdtv \
  -p 8771:8771 \
  -e AUTH_ENABLED=true \
  -e AUTH_JWT_SECRET=secret \
  -e AUTH_REDIS_HOST=host.docker.internal \
  -e AUTH_REDIS_PORT=6666 \
  -v birdtv-data:/app/data \
  ghcr.io/kob/birdtv:latest
```

### 6. Hugging Face Spaces

创建 `docker-compose.yml`：
```yaml
version: "3.8"
services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    ports:
      - "7860:8771"
    environment:
      - HOST=0.0.0.0
      - PORT=8771
      - AUTH_ENABLED=true
      - AUTH_JWT_SECRET=${AUTH_JWT_SECRET}
      - AUTH_REDIS_HOST=redis
      - AUTH_REDIS_PORT=6379
    depends_on:
      - redis
    volumes:
      - data:/app/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  data:
  redis-data:
```

在 Space Settings 中添加环境变量：
- `AUTH_JWT_SECRET`: 随机生成的密钥

### 7. SAP BTP

**创建 Redis 服务**：
```bash
# 创建 Redis 服务实例
cf create-service redis cloud redis-birdtv

# 创建 BirdTV 应用
cf push birdtv \
  --docker-image ghcr.io/kob/birdtv:latest \
  --docker-username <github-username> \
  --docker-password <github-pat> \
  -m 512M \
  -k 1G \
  --no-start
```

**绑定 Redis 服务**：
```bash
# 绑定 Redis 服务
cf bind-service birdtv redis-birdtv

# 设置环境变量
cf set-env birdtv AUTH_REDIS_HOST $(cf service redis-birdtv | grep credentials | jq -r '.hostname')
cf set-env birdtv AUTH_REDIS_PORT $(cf service redis-birdtv | grep credentials | jq -r '.port')
cf set-env birdtv AUTH_ENABLED true
cf set-env birdtv AUTH_JWT_SECRET $(openssl rand -hex 32)

# 重启应用
cf restart birdtv
```

## 📁 项目结构

```
BirdTV/
├── backend/                    # 后端代码
│   ├── controllers/           # API 控制器
│   │   ├── authController.js  # 认证控制器
│   │   ├── channelController.js # 频道控制器
│   │   ├── settingsController.js # 设置控制器
│   │   ├── sourceController.js # 源控制器
│   │   └── exportController.js # 导出控制器
│   ├── middleware/            # 中间件（认证、CORS）
│   ├── services/              # 服务层（存储、Token）
│   └── api-server.js         # API 服务器入口
├── web/                       # 前端代码
│   ├── src/modules/          # 功能模块（20+ JS 模块）
│   ├── assets/               # 静态资源（CSS、图片）
│   ├── index.html            # 主页面
│   ├── admin.html            # 后台管理页面
│   ├── mobile.html           # 移动端页面
│   └── login.html            # 登录页面
├── data/                      # 数据目录（JSON 存储）
├── files/cache/               # 缓存目录
├── birdtv.js                 # 主服务器入口
├── auth.js                   # 认证模块（JWT + bcrypt）
├── Dockerfile                # Docker 构建文件
├── docker-compose.yml        # Docker Compose 配置
├── package.json              # 项目配置
└── .env.example              # 环境变量示例
```

## ⚙️ 环境变量

### 基础配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8771` | 监听端口 |
| `NODE_ENV` | `production` | 运行环境 |

### 认证配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTH_ENABLED` | `true` | 是否启用认证 |
| `AUTH_JWT_SECRET` | `change-me` | JWT 密钥（生产环境必须修改） |
| `AUTH_TOKEN_EXPIRE_DAYS` | `7` | Token 有效期（天） |
| `AUTH_DEFAULT_ADMIN` | `admin` | 默认管理员用户名 |
| `AUTH_DEFAULT_PASSWORD` | `admin123` | 默认管理员密码 |

### Redis 配置（可选）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTH_REDIS_HOST` | - | Redis 主机地址 |
| `AUTH_REDIS_PORT` | `6379` | Redis 端口 |
| `AUTH_REDIS_PASSWORD` | - | Redis 密码 |
| `AUTH_REDIS_DB` | `0` | Redis 数据库编号 |

> **注意**: 不配置 Redis 时，系统使用内存存储（重启后数据丢失）

### 代理配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `M3U_PROXY_TIMEOUT_MS` | `40000` | 代理超时时间（毫秒） |
| `M3U_PROXY_REDIRECT_LIMIT` | `3` | 最大重定向次数 |
| `M3U_PROXY_DEFAULT_UA` | `okhttp/4.3` | 默认 User-Agent |

## 📖 API 文档

### 认证接口

```bash
# 登录
POST /api/auth/login
{ "username": "admin", "password": "admin123" }

# 登出
POST /api/auth/logout
Authorization: Bearer <token>

# 获取用户信息
GET /api/auth/userinfo
Authorization: Bearer <token>
```

### 频道接口

```bash
# 获取频道列表
GET /api/channels

# 搜索频道
GET /api/channels?search=keyword

# 创建频道
POST /api/channels
{ "name": "CCTV-1", "url": "http://...", "streamType": "live" }

# 更新频道
PUT /api/channels/:id

# 删除频道
DELETE /api/channels/:id

# 批量导入
POST /api/channels/batch

# 批量删除
POST /api/channels/batch/delete

# 批量更新
POST /api/channels/batch/update
```

### EPG 接口

```bash
# 获取 EPG 频道列表
GET /api/epg/channels

# 创建 EPG 频道
POST /api/epg/channels

# 更新 EPG 频道
PUT /api/epg/channels/:id

# 删除 EPG 频道
DELETE /api/epg/channels/:id

# 批量设置分组
POST /api/epg/batch-set-group
```

### 源管理接口

```bash
# 获取 M3U 源列表
GET /api/sources/m3u

# 创建 M3U 源
POST /api/sources/m3u
{ "name": "我的源", "url": "http://..." }

# 更新 M3U 源
PUT /api/sources/m3u/:id

# 删除 M3U 源
DELETE /api/sources/m3u/:id

# 获取 EPG 源列表
GET /api/sources/epg

# 创建 EPG 源
POST /api/sources/epg

# 更新 EPG 源
PUT /api/sources/epg/:id

# 删除 EPG 源
DELETE /api/sources/epg/:id
```

### 设置接口

```bash
# 获取设置
GET /api/settings

# 更新设置
PUT /api/settings
{ "defaultPlayer": "shaka", "cacheM3uTtl": 600000 }

# 获取全局 UA
GET /api/settings/ua/global

# 更新全局 UA
PUT /api/settings/ua/global
```

### 导出接口

```bash
# 获取导出记录列表
GET /api/exports

# 创建导出记录
POST /api/exports

# 删除导出记录
DELETE /api/exports/:id
```

### 链接接口

```bash
# 获取链接列表
GET /api/links

# 创建链接
POST /api/links

# 更新链接
PUT /api/links/:id

# 删除链接
DELETE /api/links/:id
```

## 🛠️ 常用命令

### Docker 命令

```bash
# 查看日志
docker logs -f birdtv

# 进入容器
docker exec -it birdtv sh

# 重启容器
docker restart birdtv

# 更新镜像
docker pull ghcr.io/kob/birdtv:latest
docker stop birdtv && docker rm birdtv
# 然后使用新镜像启动容器
```

### 备份与恢复

```bash
# 备份数据
docker run --rm \
  -v birdtv-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/birdtv-backup-$(date +%Y%m%d).tar.gz /data

# 恢复数据
docker run --rm \
  -v birdtv-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/birdtv-backup-20240101.tar.gz -C /
```

## 🔧 故障排查

### 按钮无响应

**症状**: 点击 `index.html` 页面上的任何按钮都没有反应。

**解决方法**:
1. 清除浏览器缓存（Ctrl + Shift + Delete）
2. 硬刷新页面（Ctrl + Shift + R）
3. 访问 `http://localhost:8771/debug.html` 进行诊断

### 页面白屏

**解决方法**:
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签页的错误信息
3. 检查后端服务是否正常运行
4. 查看 Network 标签页确认文件加载状态

### 认证失败

**解决方法**:
1. 清除本地 Token：`localStorage.removeItem('authToken')`
2. 重新登录
3. 检查 `.env` 文件中的认证配置

### 播放失败

**解决方法**:
1. 尝试切换播放器类型（自动 → HLS → Shaka → 原生）
2. 调整代理模式（自动 → 直连 → 代理）
3. 检查源地址是否有效

### 端口被占用

**解决方法**:
```bash
# 查找占用端口的进程
lsof -i :8771  # Mac/Linux
netstat -ano | findstr :8771  # Windows

# 修改 .env 中的端口
PORT=8772
```

### Redis 连接失败

系统会自动降级到文件存储模式，不影响基本功能。
如需使用 Redis，请确保：
```bash
# 安装 Redis
sudo apt install redis-server

# 启动 Redis
sudo systemctl start redis

# 检查状态
redis-cli ping  # 应返回 PONG
```

## 📊 数据模型

### Channel（频道）

```javascript
{
  id: string,           // 唯一标识
  name: string,         // 频道名称
  url: string,          // 播放地址
  group: string,        // 分组
  streamType: string,   // 流类型 (auto/mpd/ts/hls/unknown)
  playerType: string,   // 播放器类型 (auto/shaka/hls/mpegts/native)
  proxyMode: string,    // 代理模式 (auto/proxy/direct)
  userAgent: string,    // User-Agent
  drm: object,          // DRM 配置
  tvgId: string,        // TVG ID
  tvgLogo: string,      // TVG Logo
  sourceId: string,     // 源 ID
  createdAt: string,    // 创建时间
  updatedAt: string     // 更新时间
}
```

### EpgChannel（EPG 频道）

```javascript
{
  id: string,           // 唯一标识
  name: string,         // 频道名称
  group: string,        // 分组
  strategy: string,     // 加载策略 (auto/manual/custom/smart)
  epgUrl: string,       // EPG 源 URL
  epgChannelId: string, // EPG 频道 ID（用于匹配）
  createdAt: string,    // 创建时间
  updatedAt: string     // 更新时间
}
```

### User（用户）

```javascript
{
  id: string,           // 唯一标识
  username: string,     // 用户名
  password: string,     // 加密密码
  role: string,         // 角色 (admin/user)
  createdAt: string,    // 创建时间
  updatedAt: string     // 更新时间
}
```

## 💻 技术栈

### 前端
- **核心**: HTML5, CSS3, JavaScript (ES6+)
- **播放器**: Shaka Player, ArtPlayer, HLS.js, mpegts.js
- **UI 框架**: 原生 JavaScript + Luna 主题
- **状态管理**: 自定义 Store 模式

### 后端
- **运行环境**: Node.js
- **Web 框架**: 原生 HTTP 模块
- **认证**: JWT + bcrypt + Redis
- **数据存储**: JSON 文件 / Redis

### 部署
- **容器**: Docker + Docker Compose
- **进程管理**: PM2
- **反向代理**: Nginx, Caddy

## 🔒 安全建议

1. **修改默认密码**: 生产环境必须修改 `AUTH_DEFAULT_PASSWORD`
2. **使用强密钥**: 生成随机 JWT_SECRET: `openssl rand -hex 32`
3. **启用 HTTPS**: 使用 Nginx 或 Traefik 反向代理
4. **限制访问**: 配置防火墙规则
5. **定期备份**: 设置定时备份数据卷
6. **更新镜像**: 定期拉取最新镜像更新

## 📱 移动端使用

### 访问地址

手机访问：`https://your-domain.com/mobile.html`

### 主要功能

- 简洁界面：大按钮、大字体，适合触屏操作
- 快速搜索：实时搜索频道名称
- 收藏管理：一键收藏喜爱的频道
- 播放记录：自动记录最近播放的频道
- M3U 导入：支持 M3U 链接导入和手动添加
- 播放器设置：支持 HLS、DASH、原生播放器

### 网络要求

- **WiFi**: 最佳体验
- **4G/5G**: 流畅播放（1080p）
- **3G**: 可能卡顿，建议使用稳定模式

### 兼容性

- **推荐浏览器**: Chrome 90+, Safari 14+, Edge 90+, Firefox 88+
- **操作系统**: iOS 14+, Android 8+, Chrome OS

## 📝 开发规范

### Git 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构代码
test: 测试相关
chore: 构建/工具链相关
```

### 代码风格

- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化
- 遵循 JavaScript ES6+ 规范

## 🔗 相关链接

- **GitHub 仓库**: https://github.com/your-repo/birdtv
- **Docker Hub**: https://hub.docker.com/r/kob/birdtv
- **GitHub Container Registry**: https://github.com/kob/birdtv/pkgs/container/birdtv

## 📄 许可证

MIT License

---

**版本**: v3.4.5
**更新日期**: 2026-04-04
