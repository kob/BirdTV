# BirdTV

现代化 IPTV 播放器系统，包含完整的前端播放器、后台管理系统和移动端界面。支持 M3U 播放列表、频道管理、EPG 电子节目单、用户认证等功能。

## 功能特性

### 播放器
- 多种流媒体格式：HLS、DASH、MP4、WebM、TS
- 多播放器内核：Shaka Player、ArtPlayer、HLS.js、mpegts.js
- 智能播放器选择：根据流类型自动选择最佳播放器
- DRM 支持：Widevine、PlayReady 许可证
- 线路切换 & 故障转移
- Luna 主题界面

### 后台管理
- 用户认证（JWT + KVRocks）
- 频道管理：CRUD、搜索、批量导入、批量操作
- 源配置：M3U 源、EPG 源
- EPG 电子节目单：多种加载策略
- 用户管理、分组管理、UA 管理
- 系统设置、导出管理、链接管理

### 移动端
- 简洁触屏界面、快速搜索、收藏管理
- 播放记录、M3U 导入、播放器设置

## 快速开始

BirdTV **必须**配合 KVRocks（Redis 兼容数据库）使用。

### Docker Compose 一键部署（推荐）

```bash
# 1. 创建目录
mkdir birdtv && cd birdtv

# 2. 创建 .env 文件
cat > .env << 'EOF'
AUTH_JWT_SECRET=替换为随机密钥
EOF

# 3. 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/kob/birdtv/main/docker-compose.yml

# 4. 启动
docker compose up -d
```

生成随机密钥：`openssl rand -hex 32`

### 本地部署

**前置依赖**：Node.js v18+、KVRocks v2.x

```bash
# 安装 KVRocks
docker run -d --name kvrocks --restart unless-stopped \
  -p 6666:6666 -v kvrocks-data:/var/lib/kvrocks \
  apache/kvrocks:2.11.0

# 安装 BirdTV
cd BirdTV
npm install
cp .env.example .env
# 编辑 .env，配置 AUTH_REDIS_HOST 和 AUTH_JWT_SECRET
node birdtv.js
```

### 访问服务

| 页面 | 地址 |
|------|------|
| 前端播放器 | http://localhost:8771/ |
| 后台管理 | http://localhost:8771/admin.html |
| 移动端 | http://localhost:8771/mobile.html |
| 登录页 | http://localhost:8771/login.html |
| 健康检查 | http://localhost:8771/health |

**默认账号**：`admin / admin123`（首次登录请修改密码）

## Docker 部署

### 镜像信息

| 项目 | 说明 |
|------|------|
| 镜像 | `ghcr.io/kob/birdtv:latest` |
| 基础镜像 | node:20-alpine |
| 架构 | linux/amd64, linux/arm64 |
| 数据库 | KVRocks 2.11.0（Redis 兼容，Compose 自动启动） |

### Docker Compose（推荐）

```bash
mkdir birdtv && cd birdtv
curl -O https://raw.githubusercontent.com/kob/birdtv/main/docker-compose.yml

# 配置密钥
echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)" > .env

docker compose up -d
docker compose logs -f birdtv
```

### Docker 命令（需自行管理 KVRocks）

```bash
# 1. 启动 KVRocks
docker run -d --name kvrocks --restart unless-stopped \
  -p 6666:6666 -v kvrocks-data:/var/lib/kvrocks \
  apache/kvrocks:2.11.0

# 2. 启动 BirdTV
docker run -d --name birdtv --restart unless-stopped \
  -p 8771:8771 \
  -e AUTH_JWT_SECRET=$(openssl rand -hex 32) \
  -e AUTH_REDIS_HOST=host.docker.internal \
  -e AUTH_REDIS_PORT=6666 \
  -v birdtv-data:/app/data \
  ghcr.io/kob/birdtv:latest
```

## 部署场景

### Ubuntu / Debian

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

mkdir birdtv && cd birdtv
curl -O https://raw.githubusercontent.com/kob/birdtv/main/docker-compose.yml
echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)" > .env

docker compose up -d
sudo ufw allow 8771/tcp
```

#### Nginx 反向代理 + HTTPS

```nginx
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

### NAS 部署

**Synology 群晖 (DSM 7.2+)**：
1. Container Manager → 项目 → 新建
2. 粘贴 `docker-compose.yml` 内容
3. 修改端口和环境变量后部署

**QNAP 威联通**：
1. Container Station → 应用程序 → 创建
2. 粘贴 YAML 配置，确保端口 8771 和 6666 未占用

### 软路由（OpenWrt / iStoreOS）

```bash
ssh root@192.168.1.1
opkg update && opkg install docker dockerd docker-compose
/etc/init.d/dockerd start && /etc/init.d/dockerd enable

mkdir -p /root/birdtv && cd /root/birdtv
cat > docker-compose.yml << 'EOF'
services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    network_mode: host
    depends_on:
      kvrocks:
        condition: service_healthy
    environment:
      - AUTH_ENABLED=true
      - AUTH_JWT_SECRET=请替换为随机密钥
      - AUTH_DEFAULT_ADMIN=admin
      - AUTH_DEFAULT_PASSWORD=admin123
      - AUTH_REDIS_HOST=127.0.0.1
      - AUTH_REDIS_PORT=6666
    volumes:
      - ./data:/app/data

  kvrocks:
    image: apache/kvrocks:2.11.0
    container_name: birdtv-kvrocks
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./kvrocks-data:/var/lib/kvrocks
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6666"]
      interval: 10s
      timeout: 5s
      retries: 5
EOF

docker compose up -d
```

> 软路由建议 `network_mode: host`，内存建议 512MB+。

### Railway

```bash
npm install -g @railway/cli
railway login && railway init

# 创建 Redis 插件（KVRocks 兼容）
railway add --plugin redis

# 使用 Docker 镜像
railway variables set RAILWAY_CONTAINER_IMAGE=ghcr.io/kob/birdtv:latest
railway variables set AUTH_ENABLED=true
railway variables set AUTH_JWT_SECRET=$(openssl rand -hex 32)
railway variables set PORT=8771

railway up
railway domain
```

### Hugging Face Spaces

1. 创建新 Space，SDK 选 **Docker**
2. 在 Space Settings → Variables and secrets 添加 `AUTH_JWT_SECRET`
3. 提交 `docker-compose.yml` 后自动部署

### CloudBase 云开发

1. 创建环境，开启云托管
2. 创建 Redis 实例
3. 创建云托管服务，选择镜像 `ghcr.io/kob/birdtv:latest`
4. 配置环境变量：`AUTH_JWT_SECRET`、`AUTH_REDIS_HOST`、`AUTH_REDIS_PORT`、`PORT=8771`

## 项目结构

```
BirdTV/
├── backend/                    # 后端代码
│   ├── controllers/           # API 控制器
│   ├── middleware/            # 中间件（认证、CORS）
│   └── services/              # 服务层（存储、Token）
├── web/                       # 前端代码
│   ├── src/modules/          # 功能模块
│   └── assets/               # 静态资源
├── birdtv.js                 # 主服务器入口
├── Dockerfile                # Docker 构建文件
├── docker-compose.yml        # Docker Compose 配置
└── .env.example              # 环境变量示例
```

## 环境变量

### 基础配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8771` | 监听端口 |

### 认证配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTH_ENABLED` | `true` | 是否启用认证 |
| `AUTH_JWT_SECRET` | `change-me-in-production` | JWT 密钥（**生产环境必须修改**） |
| `AUTH_TOKEN_EXPIRE_DAYS` | `7` | Token 有效期（天） |
| `AUTH_DEFAULT_ADMIN` | `admin` | 默认管理员用户名 |
| `AUTH_DEFAULT_PASSWORD` | `admin123` | 默认管理员密码 |

### KVRocks 配置（必填）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTH_REDIS_HOST` | - | KVRocks 主机地址 |
| `AUTH_REDIS_PORT` | `6666` | KVRocks 端口 |
| `AUTH_REDIS_PASSWORD` | - | KVRocks 密码（可选） |

> Docker Compose 方式自动管理 KVRocks 连接，无需手动配置。

### 多实例隔离

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BIRDTV_SYSTEM_ID` | `default` | 系统标识（多实例部署时设置不同值） |
| `REDIS_DATA_PREFIX` | `birdtv:storage:` | 数据存储 key 前缀 |
| `REDIS_PREFIX` | `birdtv` | 认证模块 key 前缀 |

### M3U 代理配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `M3U_PROXY_TIMEOUT_MS` | `40000` | 代理请求超时（毫秒） |
| `M3U_PROXY_REDIRECT_LIMIT` | `3` | 最大重定向次数 |
| `M3U_PROXY_DEFAULT_UA` | `okhttp/4.3` | 默认 User-Agent |

### 高级配置（可选）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `CLOUDFLARE_WORKER_URL` | - | Cloudflare Worker 代理地址 |
| `BIRDTV_UPSTREAM_PROXY` | - | 上游 HTTP/HTTPS 代理地址 |

## API 文档

### 认证接口

```bash
POST /api/auth/login          # 登录
POST /api/auth/logout         # 登出
GET  /api/auth/userinfo       # 获取用户信息
```

### 频道接口

```bash
GET    /api/channels              # 获取频道列表
GET    /api/channels?search=keyword  # 搜索频道
POST   /api/channels              # 创建频道
PUT    /api/channels/:id          # 更新频道
DELETE /api/channels/:id          # 删除频道
POST   /api/channels/batch        # 批量导入
POST   /api/channels/batch/delete # 批量删除
POST   /api/channels/batch/update # 批量更新
```

### EPG 接口

```bash
GET    /api/epg/channels       # 获取 EPG 频道列表
POST   /api/epg/channels       # 创建 EPG 频道
PUT    /api/epg/channels/:id   # 更新 EPG 频道
DELETE /api/epg/channels/:id   # 删除 EPG 频道
POST   /api/epg/batch-set-group # 批量设置分组
```

### 源管理接口

```bash
GET    /api/sources/m3u        # 获取 M3U 源列表
POST   /api/sources/m3u        # 创建 M3U 源
PUT    /api/sources/m3u/:id    # 更新 M3U 源
DELETE /api/sources/m3u/:id    # 删除 M3U 源
GET    /api/sources/epg        # 获取 EPG 源列表
POST   /api/sources/epg        # 创建 EPG 源
PUT    /api/sources/epg/:id    # 更新 EPG 源
DELETE /api/sources/epg/:id    # 删除 EPG 源
```

### 设置 & 导出 & 链接接口

```bash
GET  /api/settings             # 获取设置
PUT  /api/settings             # 更新设置
GET  /api/settings/ua/global   # 获取全局 UA
PUT  /api/settings/ua/global   # 更新全局 UA
GET  /api/exports              # 获取导出记录
POST /api/exports              # 创建导出记录
DELETE /api/exports/:id        # 删除导出记录
GET  /api/links                # 获取链接列表
POST /api/links                # 创建链接
PUT  /api/links/:id            # 更新链接
DELETE /api/links/:id          # 删除链接
```

## 常用命令

```bash
# 查看日志
docker compose logs -f birdtv

# 进入容器
docker exec -it birdtv sh

# 重启
docker compose restart birdtv

# 更新镜像
docker compose pull birdtv && docker compose up -d

# 备份数据
docker run --rm -v birdtv-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/birdtv-backup-$(date +%Y%m%d).tar.gz /data
```

## 故障排查

| 问题 | 解决方法 |
|------|----------|
| 按钮无响应 | 清除浏览器缓存，硬刷新（Ctrl+Shift+R） |
| 页面白屏 | F12 查看 Console 错误，检查后端是否运行 |
| 认证失败 | `localStorage.removeItem('authToken')` 后重新登录 |
| 播放失败 | 切换播放器类型或代理模式，检查源地址 |
| HTTPS 播放 HTTP 源失败 | 系统已内置自动 HTTPS 升级；不支持 HTTPS 的源设为"代理"模式 |
| 端口占用 | 修改 `.env` 中的 `PORT` |
| KVRocks 连接失败 | 确认 KVRocks 运行：`redis-cli -p 6666 ping` |
| 数据丢失 | 确保 KVRocks 数据卷正常挂载，使用 `docker compose` 部署 |

## 安全建议

1. **修改默认密码**：生产环境必须修改 `AUTH_DEFAULT_PASSWORD`
2. **使用强密钥**：`openssl rand -hex 32` 生成 JWT_SECRET
3. **启用 HTTPS**：使用 Nginx 反向代理
4. **限制访问**：配置防火墙规则
5. **定期备份**：定时备份数据卷

## 技术栈

- **前端**：HTML5 / CSS3 / JavaScript ES6+ / Shaka Player / HLS.js / mpegts.js
- **后端**：Node.js / JWT + bcrypt / KVRocks（Redis 兼容）
- **部署**：Docker / Docker Compose / PM2 / Nginx

## 许可证

MIT License
