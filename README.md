# BirdTV

现代化的 IPTV 播放器系统，包含完整的前端播放器、后台管理系统和移动端界面。支持 M3U 播放列表、频道管理、EPG 电子节目单、用户认证等功能。

> **快速开始**：查看 [QUICK_START.md](./QUICK_START.md) 了解一键部署方案（PM2/Systemd/守护脚本）
>
> **服务稳定性**：查看 [SERVICE_STABILITY_SOLUTION.md](./SERVICE_STABILITY_SOLUTION.md) 解决服务自动停止问题
>
> **WAF 代理**：查看 [CLOUDFLARE_WAF_SOLUTION.md](./CLOUDFLARE_WAF_SOLUTION.md) 解决 Cloudflare 拦截问题

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
# 方式一：使用 PM2（生产环境推荐）
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 可选：开机自启

# 方式二：使用 npm 命令
npm run start:web:local

# 方式三：直接启动
node birdtv.js

# 方式四：使用启动脚本
bash start.sh start
```

> **推荐**：生产环境使用 PM2，支持自动重启、日志管理、内存监控。详见 [QUICK_START.md](./QUICK_START.md)

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
- **架构支持**: linux/amd64, linux/arm64

### 使用 Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/kob/birdtv.git
cd birdtv

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，修改关键配置（尤其是 AUTH_JWT_SECRET）
vim .env

# 3. 启动服务（包含 BirdTV + Kvrocks）
docker compose up -d

# 4. 查看日志
docker compose logs -f birdtv
```

### 使用 Docker 命令（不依赖 Kvrocks）

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

> **注意**: 不挂载 Kvrocks 时，系统使用内存存储，重启后数据丢失。推荐使用 Docker Compose（内含 Kvrocks 容器实现持久化）。

## 📦 部署场景

### 1. Ubuntu / Debian 服务器

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 克隆项目
git clone https://github.com/kob/birdtv.git
cd birdtv

# 配置环境变量
cp .env.example .env
# 修改 AUTH_JWT_SECRET 为随机密钥
sed -i "s/change-me-in-production/$(openssl rand -hex 32)/" .env

# 启动服务
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f birdtv

# 配置防火墙
sudo ufw allow 8771/tcp
```

> **说明**: Docker Compose 自动启动 BirdTV + Kvrocks 两个容器。Kvrocks 是 Redis 兼容数据库，数据持久化在 Docker Volume 中。

#### Nginx 反向代理 + HTTPS

```nginx
# /etc/nginx/sites-available/birdtv
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8771;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/birdtv /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

### 2. NAS 部署（Synology / QNAP）

**Synology 群晖 (DSM 7.2+)**：
1. 打开 Container Manager → 项目
2. 点击"新建"，选择"创建 docker-compose.yml"
3. 项目名称填 `birdtv`
4. 粘贴项目中的 `docker-compose.yml` 内容
5. 根据需要修改端口映射和环境变量
6. 点击"完成"部署
7. 访问 `http://nas-ip:8771`

**QNAP 威联通 (QuTS hero)**：
1. 打开 Container Station → 应用程序
2. 点击"创建"，粘贴 YAML 配置
3. 确保端口 8771 未被占用
4. 点击"创建"后查看容器状态

> **说明**: NAS 部署默认使用 Docker Volume 持久化数据。如需使用内建 Redis/Kvrocks，在 docker-compose.yml 中取消对应服务的注释。

### 3. 软路由部署（OpenWrt / iStoreOS）

```bash
# SSH 连接到路由器
ssh root@192.168.1.1

# 安装 Docker（需要 entware 或 opkg 源支持）
opkg update
opkg install docker dockerd docker-compose
/etc/init.d/dockerd start && /etc/init.d/dockerd enable

# 创建工作目录
mkdir -p /root/birdtv && cd /root/birdtv

# 创建 docker-compose.yml（单容器模式，节省内存）
cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    network_mode: host
    environment:
      - AUTH_ENABLED=true
      - AUTH_JWT_SECRET=请替换为随机密钥
      - AUTH_DEFAULT_ADMIN=admin
      - AUTH_DEFAULT_PASSWORD=admin123
    volumes:
      - ./data:/app/data
EOF

# 启动
docker compose up -d
```

> **说明**: 软路由建议使用 `network_mode: host` 省去端口映射开销。内存建议 512MB+。如内存充足（1GB+），可在 compose 中追加 Kvrocks 服务实现数据持久化。

### 4. Railway

```bash
npm install -g @railway/cli
railway login
railway init

# 创建 BirdTV 服务（从 Dockerfile 构建）
railway up

# 或直接使用 Docker 镜像
railway variables set RAILWAY_CONTAINER_IMAGE=ghcr.io/kob/birdtv:latest

# 设置环境变量
railway variables set AUTH_ENABLED=true
railway variables set AUTH_JWT_SECRET=$(openssl rand -hex 32)
railway variables set PORT=8771

# 部署
railway up

# 获取公网域名
railway domain
```

> **说明**: Railway 自动分配 HTTPS 域名。免费套餐 $5/月，512MB 内存。Railway 不支持 Redis 侧车，数据使用内存存储。

### 5. Google IDX

```bash
# 在 IDX 终端中执行

# 克隆项目并启动
git clone https://github.com/kob/birdtv.git
cd birdtv
cp .env.example .env

# 启动服务（含 Kvrocks）
docker compose up -d

# 查看日志
docker compose logs -f birdtv
```

> **说明**: IDX 自动创建端口转发，在 IDE 右上角 "Web Preview" → "Port 8771" 即可访问。

### 6. Hugging Face Spaces

1. 访问 [Hugging Face Spaces](https://huggingface.co/new-space)，创建新 Space
2. SDK 选择 **Docker**，Space 名称填 `birdtv`

在仓库中创建 `docker-compose.yml`：

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

在 Space Settings → Variables and secrets 中添加：
- `AUTH_JWT_SECRET`: 随机密钥（`openssl rand -hex 32`）

提交后自动构建部署，访问 `https://huggingface.co/spaces/your-username/birdtv`。

### 7. SAP BTP (Cloud Foundry)

```bash
# 安装 CF CLI
brew install cloudfoundry/tap/cf-cli  # macOS
# 或参考 https://docs.cloudfoundry.org/cf-cli/install-go-cli.html

# 登录
cf login -a https://api.<region>.hana.ondemand.com -u <user> -p <pass> -o <org> -s <space>

# 创建 Redis 服务实例
cf create-service redis cloud redis-birdtv

# 推送应用
cf push birdtv \
  --docker-image ghcr.io/kob/birdtv:latest \
  --docker-username <github-user> \
  --docker-password <github-pat> \
  -m 512M -k 1G \
  --no-start

# 绑定 Redis
cf bind-service birdtv redis-birdtv

# 设置环境变量
cf set-env birdtv AUTH_ENABLED true
cf set-env birdtv AUTH_JWT_SECRET $(openssl rand -hex 32)
cf set-env birdtv AUTH_REDIS_HOST $(cf env birdtv | grep VCAP_SERVICES -A5 | jq -r '.redis[0].credentials.hostname')
cf set-env birdtv AUTH_REDIS_PORT $(cf env birdtv | grep VCAP_SERVICES -A5 | jq -r '.redis[0].credentials.port')
cf set-env birdtv PORT 8080

# 启动
cf restage birdtv

# 查看日志
cf logs birdtv --recent
```

> **说明**: BTP 自动分配 HTTPS 路由。端口必须设为 `8080`（CF 默认暴露端口）。

### 8. CloudBase 云开发

1. 登录 [腾讯云 CloudBase](https://console.cloud.tencent.com/tcb)，创建环境
2. 在环境设置中开启 **云托管**
3. 上传 Docker 镜像到腾讯云容器镜像服务 (TCR)
4. 创建云托管服务，选择镜像 `ghcr.io/kob/birdtv:latest`
5. 设置环境变量：
   - `AUTH_ENABLED=true`
   - `AUTH_JWT_SECRET=<随机密钥>`
   - `PORT=8771`
6. 部署后 CloudBase 自动分配 HTTPS 域名

## 📁 项目结构

```
BirdTV/
├── backend/                    # 后端代码
│   ├── controllers/           # API 控制器
│   ├── middleware/            # 中间件（认证、CORS）
│   ├── services/              # 服务层（存储、Token）
│   └── api-server.js         # API 服务器入口
├── web/                       # 前端代码
│   ├── src/modules/          # 功能模块（20+ JS 模块）
│   ├── assets/               # 静态资源（CSS、图片）
│   └── *.html                # 各页面
├── data/                      # 数据目录（JSON 存储）
├── birdtv.js                 # 主服务器入口
├── auth.js                   # 认证模块（JWT + bcrypt）
├── Dockerfile                # Docker 构建文件
├── docker-compose.yml        # Docker Compose 配置
├── ecosystem.config.js       # PM2 配置
├── daemon.sh                 # 守护进程脚本
├── diagnose.sh               # 诊断工具
├── deploy-service.sh         # 一键部署脚本
├── start.sh                  # 启动脚本
├── cloudflare-worker-unified.js  # Cloudflare Worker 代理
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
| `LOG_LEVEL` | `info` | 日志级别 |

### 认证配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTH_ENABLED` | `true` | 是否启用认证 |
| `AUTH_JWT_SECRET` | `change-me-in-production` | JWT 密钥（生产环境必须修改） |
| `AUTH_TOKEN_EXPIRE_DAYS` | `7` | Token 有效期（天） |
| `AUTH_DEFAULT_ADMIN` | `admin` | 默认管理员用户名 |
| `AUTH_DEFAULT_PASSWORD` | `admin123` | 默认管理员密码 |
| `SECRET_KEY` | `birdtv-secret-key-2024` | Token 签名密钥（非 JWT 模式） |

### Redis 配置（可选）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTH_REDIS_HOST` | - | Redis 主机地址 |
| `AUTH_REDIS_PORT` | `6379` | Redis 端口 |
| `AUTH_REDIS_PASSWORD` | - | Redis 密码 |
| `AUTH_REDIS_DB` | `0` | Redis 数据库编号 |

> **注意**: 不配置 Redis 时，系统使用内存存储（重启后数据丢失）

### Redis 数据隔离（多实例部署）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `REDIS_DATA_PREFIX` | `birdtv:storage:` | 数据存储 key 前缀 |
| `REDIS_PREFIX` | `birdtv` | 认证模块 key 前缀 |
| `BIRDTV_SYSTEM_ID` | `default` | 系统标识（与 REDIS_PREFIX 组合隔离认证数据） |
| `SERVER_ID` | `default` | 服务器标识（用于日志区分） |

> **多实例示例**: 两台服务器共享同一 Redis 时，分别设置 `REDIS_DATA_PREFIX=birdtv:storage:svr1:` 和 `REDIS_DATA_PREFIX=birdtv:storage:svr2:`

### 静态资源与数据目录

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BIRDTV_STATIC_ROOT` | `./web` | 前端静态文件根目录 |
| `BIRDTV_DATA_DIR` | `./data` | 数据存储目录 |
| `BIRDTV_CACHE_ROOT` | `./files/cache` | 缓存文件目录 |

### 代理配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BIRDTV_TIMEOUT_MS` | `40000` | 代理请求超时时间（毫秒） |
| `BIRDTV_REDIRECT_LIMIT` | `3` | 最大重定向跟随次数 |
| `BIRDTV_DEFAULT_UA` | `okhttp/4.3` | 默认 User-Agent |
| `BIRDTV_REMOTE_BASE_URL` | - | 远程 M3U 源地址 |

### 缓存配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BIRDTV_CACHE_M3U_TTL_MS` | `600000` | M3U 缓存过期时间（毫秒） |
| `BIRDTV_CACHE_EPG_TTL_MS` | `3600000` | EPG 缓存过期时间（毫秒） |

### 安全配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BIRDTV_ALLOWED_HOSTS` | - | 代理目标主机白名单（逗号分隔，留空不限制） |
| `BIRDTV_UPSTREAM_PROXY` | - | 上游 HTTP/HTTPS 代理地址 |

### API 服务器配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `API_SERVER_PORT` | `8771` | API 服务器端口（通常与主服务共用） |
| `API_CORS_ORIGIN` | `*` | CORS 允许的源（逗号分隔） |

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

### HTTPS 页面播放 HTTP 源失败（混合内容）

**症状**: 在 HTTPS 部署的站点上，播放 HTTP 的直播源（尤其是 MPD/DASH）时加载失败。

**说明**: 系统已内置 HTTP→HTTPS 自动升级机制。当检测到页面为 HTTPS 且源地址为 HTTP 时，会自动将源地址升级为 HTTPS 尝试直连播放，失败则回退到代理模式。此机制覆盖所有代理模式（直连/自动/代理）下的 DASH/MPD 源，以及非直连模式下的其他流类型。

**解决方法**:
1. 确认源站是否支持 HTTPS 访问（系统会自动尝试）
2. 如源站不支持 HTTPS，将代理模式设为"代理"以走同源代理
3. 检查浏览器控制台的 `dash-https-upgrade` 诊断日志了解升级过程

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

### 服务频繁自动停止（SAP BAS 等环境）

**症状**: 服务运行一段时间后自动退出。

**解决方法**:
1. 使用 PM2 进程管理器（推荐）：
```bash
pm2 start ecosystem.config.js
pm2 save
```
2. 或使用 Systemd 服务：
```bash
sudo cp birdtv.service /etc/systemd/system/
sudo systemctl enable --now birdtv
```
3. 或使用守护脚本：
```bash
bash daemon.sh start
```
4. 运行诊断工具定位问题：
```bash
bash diagnose.sh
```
> **详见**: [SERVICE_STABILITY_SOLUTION.md](./SERVICE_STABILITY_SOLUTION.md)

### Cloudflare WAF 拦截导致 403/520 错误

**症状**: 部分请求返回 403 或 520 错误。

**解决方法**:
1. 配置 Cloudflare Worker 作为代理：
```bash
# 编辑 .env 文件
CLOUDFLARE_WORKER_URL=https://your-worker.workers.dev

# 重启服务
pm2 restart birdtv
```
2. 部署 Worker 脚本：使用 `cloudflare-worker-unified.js`
> **详见**: [CLOUDFLARE_WAF_SOLUTION.md](./CLOUDFLARE_WAF_SOLUTION.md)

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

**版本**: v3.5.0
**更新日期**: 2026-04-05
