# BirdTV Docker 部署指南

## 镜像信息

- **镜像地址**: `ghcr.io/kob/birdtv:latest`
- **镜像大小**: 约 150MB
- **基础镜像**: node:20-alpine
- **架构支持**: linux/amd64, linux/arm64
- **数据库**: KVRocks（Redis 兼容数据库，默认端口 6666）

## 快速开始

### 使用 Docker Compose (推荐)

```bash
# 1. 克隆项目
git clone https://github.com/kob/birdtv.git
cd birdtv

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，修改关键配置（尤其是 AUTH_JWT_SECRET）

# 3. 启动服务（BirdTV + KVRocks）
docker compose up -d

# 4. 查看日志
docker compose logs -f birdtv
```

### 使用 Docker 命令

```bash
# 1. 启动 KVRocks
docker run -d \
  --name kvrocks \
  --restart unless-stopped \
  -p 6666:6666 \
  -v kvrocks-data:/var/lib/kvrocks \
  apache/kvrocks:2.11.0

# 2. 启动 BirdTV
docker run -d \
  --name birdtv \
  --restart unless-stopped \
  -p 8771:8771 \
  -e AUTH_ENABLED=true \
  -e AUTH_JWT_SECRET=$(openssl rand -hex 32) \
  -e AUTH_DEFAULT_ADMIN=admin \
  -e AUTH_DEFAULT_PASSWORD=admin123 \
  -e AUTH_REDIS_HOST=host.docker.internal \
  -e AUTH_REDIS_PORT=6666 \
  -v birdtv-data:/app/data \
  --link kvrocks:kvrocks \
  ghcr.io/kob/birdtv:latest

# 3. 查看日志
docker logs -f birdtv
docker logs -f kvrocks
```

> **注意**: 单独运行需要确保 KVRocks 先启动并健康。推荐使用 Docker Compose 自动管理依赖关系。

---

## 场景部署指南

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

# 启动服务（BirdTV + KVRocks）
docker compose up -d

# 配置防火墙
sudo ufw allow 8771/tcp
```

> **说明**: Docker Compose 自动启动 BirdTV + KVRocks 两个容器。KVRocks 数据持久化在 Docker Volume 中。

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

---

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
3. 确保端口 8771 和 6666 未被占用
4. 点击"创建"后查看容器状态

> **说明**: NAS 部署默认使用 Docker Volume 持久化 KVRocks 数据。

---

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

> **说明**: 软路由建议使用 `network_mode: host` 省去端口映射开销。内存建议 512MB+。如内存充足（1GB+），可在 compose 中追加 KVRocks 服务实现数据持久化。

---

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

> **说明**: Railway 自动分配 HTTPS 域名。免费套餐 $5/月，512MB 内存。Railway 不支持 KVRocks 侧车，数据使用内存存储。

---

### 5. Google IDX

```bash
# 在 IDX 终端中执行

# 克隆项目并启动
git clone https://github.com/kob/birdtv.git
cd birdtv
cp .env.example .env

# 启动服务（含 KVRocks）
docker compose up -d

# 查看日志
docker compose logs -f birdtv
```

> **说明**: IDX 自动创建端口转发，在 IDE 右上角 "Web Preview" → "Port 8771" 即可访问。

---

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
      - AUTH_REDIS_HOST=kvrocks
      - AUTH_REDIS_PORT=6666
    depends_on:
      - kvrocks
    volumes:
      - data:/app/data

  kvrocks:
    image: apache/kvrocks:2.11.0
    volumes:
      - kvrocks-data:/var/lib/kvrocks

volumes:
  data:
  kvrocks-data:
```

在 Space Settings → Variables and secrets 中添加：
- `AUTH_JWT_SECRET`: 随机密钥（`openssl rand -hex 32`）

提交后自动构建部署，访问 `https://huggingface.co/spaces/your-username/birdtv`。

---

### 7. SAP BTP (Cloud Foundry)

```bash
# 安装 CF CLI
brew install cloudfoundry/tap/cf-cli  # macOS
# 或参考 https://docs.cloudfoundry.org/cf-cli/install-go-cli.html

# 登录
cf login -a https://api.<region>.hana.ondemand.com -u <user> -p <pass> -o <org> -s <space>

# 创建 Redis 服务实例（BTP 提供的 Redis 兼容 KVRocks 协议）
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

---

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

---

## 环境变量说明

详细配置请参考 [.env.example](./.env.example)。

### 基础配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `HOST` | `0.0.0.0` | 监听地址 | 否 |
| `PORT` | `8771` | 监听端口 | 否 |

### 认证配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `AUTH_ENABLED` | `true` | 是否启用认证 | 否 |
| `AUTH_JWT_SECRET` | `change-me-in-production` | JWT 密钥（生产环境必须修改） | 是 |
| `AUTH_TOKEN_EXPIRE_DAYS` | `7` | Token 有效期（天） | 否 |
| `AUTH_DEFAULT_ADMIN` | `admin` | 默认管理员用户名 | 否 |
| `AUTH_DEFAULT_PASSWORD` | `admin123` | 默认管理员密码 | 否 |

### KVRocks / Redis 配置（可选）

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `AUTH_REDIS_HOST` | - | KVRocks/Redis 主机地址 | 否 |
| `AUTH_REDIS_PORT` | `6379` | 端口（KVRocks 默认 6666） | 否 |
| `AUTH_REDIS_PASSWORD` | - | 密码 | 否 |

### 多实例隔离

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `BIRDTV_SYSTEM_ID` | `default` | 系统标识（多实例隔离） | 否 |
| `REDIS_DATA_PREFIX` | `birdtv:storage:` | 数据存储 key 前缀 | 否 |
| `REDIS_PREFIX` | `birdtv` | 认证模块 key 前缀 | 否 |
| `SERVER_ID` | `default` | 服务器标识（日志区分） | 否 |

> **注意**: 不配置 KVRocks/Redis 时，系统使用内存存储（重启后数据丢失）。推荐使用 KVRocks 实现数据持久化。

### 代理配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `M3U_REMOTE_BASE_URL` | - | 远程 M3U 源地址 | 否 |
| `M3U_PROXY_TIMEOUT_MS` | `40000` | 代理请求超时（毫秒） | 否 |
| `M3U_PROXY_REDIRECT_LIMIT` | `3` | 最大重定向次数 | 否 |
| `M3U_PROXY_DEFAULT_UA` | `okhttp/4.3` | 默认 User-Agent | 否 |

### 高级配置（可选）

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `BIRDTV_CACHE_M3U_TTL_MS` | `600000` | M3U 缓存过期（毫秒） | 否 |
| `BIRDTV_CACHE_EPG_TTL_MS` | `3600000` | EPG 缓存过期（毫秒） | 否 |
| `CLOUDFLARE_WORKER_URL` | - | Cloudflare Worker 代理地址 | 否 |
| `BIRDTV_UPSTREAM_PROXY` | - | 上游 HTTP/HTTPS 代理地址 | 否 |

---

## 数据持久化

### Docker Volume 方式（推荐）

```bash
docker volume create birdtv-data
docker volume create birdtv-kvrocks-data
```

### 备份与恢复

```bash
# 备份 BirdTV 数据
docker run --rm \
  -v birdtv-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/birdtv-backup-$(date +%Y%m%d).tar.gz /data

# 备份 KVRocks 数据
docker run --rm \
  -v birdtv-kvrocks-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/kvrocks-backup-$(date +%Y%m%d).tar.gz /data

# 恢复数据
docker run --rm \
  -v birdtv-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/birdtv-backup-20240101.tar.gz -C /
```

---

## 常用命令

```bash
# 查看日志
docker compose logs -f birdtv
docker logs --tail 100 birdtv

# 进入容器
docker exec -it birdtv sh

# 重启
docker compose restart birdtv

# 更新镜像
docker compose pull
docker compose up -d

# 查看运行状态
docker compose ps
```

---

## 端口说明

| 端口 | 协议 | 用途 | 说明 |
|------|------|------|------|
| 8771 | HTTP | Web 服务 | 主服务端口 |
| 6666 | TCP | KVRocks | 数据库端口（仅内部通信） |

---

## 健康检查

```bash
# 检查容器状态
docker compose ps

# 检查服务是否正常
curl http://localhost:8771/health

# 检查 API 端点
curl http://localhost:8771/api/channels
```

---

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker compose logs birdtv

# 检查端口占用
lsof -i :8771

# 检查环境变量
docker compose exec birdtv env
```

### 无法访问服务

```bash
# 检查容器是否运行
docker compose ps

# 检查端口映射
docker port birdtv

# 测试内部访问
docker compose exec birdtv wget -O- http://localhost:8771
```

### 数据丢失问题

```bash
# 检查数据卷
docker volume ls
docker volume inspect birdtv-data birdtv-kvrocks-data
```

---

## 安全建议

1. **修改默认密码**: 生产环境必须修改 `AUTH_DEFAULT_PASSWORD`
2. **使用强密钥**: 生成随机 JWT_SECRET: `openssl rand -hex 32`
3. **启用 HTTPS**: 使用 Nginx 或 Traefik 反向代理
4. **限制访问**: 配置防火墙规则，KVRocks 端口 6666 仅内部通信
5. **定期备份**: 设置定时备份 BirdTV 数据卷和 KVRocks 数据卷

---

## 参考资源

- [GitHub 仓库](https://github.com/kob/birdtv)
- [GitHub Container Registry](https://github.com/kob/birdtv/pkgs/container/birdtv)
- [KVRocks 官方文档](https://kvrocks.apache.org/)

---

**最后更新**: 2026-04-07
