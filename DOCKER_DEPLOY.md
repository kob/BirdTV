# BirdTV Docker 部署指南

## 镜像信息

- **镜像地址**: `ghcr.io/kob/birdtv:latest`
- **镜像大小**: 约 150MB
- **基础镜像**: node:20-alpine
- **包含组件**: BirdTV + Kvrocks (Redis 兼容数据库)

## 快速开始

### 使用 Docker Compose (推荐)

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
# 1. 启动 Kvrocks (Redis 兼容数据库)
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
  -e AUTH_JWT_SECRET=your-secret-key \
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

> **注意**: 单独运行需要确保 Kvrocks 先启动并健康。推荐使用 Docker Compose 自动管理依赖关系。

---

## 场景部署指南

### 1. Ubuntu 服务器部署

#### 1.1 使用 Docker Compose (推荐)

```bash
# 安装 Docker 和 Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 克隆项目
git clone https://github.com/your-repo/birdtv.git
cd birdtv

# 配置环境变量
cat > .env << EOF
HOST=0.0.0.0
PORT=8771
AUTH_ENABLED=true
AUTH_JWT_SECRET=$(openssl rand -hex 32)
AUTH_TOKEN_EXPIRE_DAYS=7
AUTH_DEFAULT_ADMIN=admin
AUTH_DEFAULT_PASSWORD=$(openssl rand -base64 12)
EOF

# 启动服务
docker-compose up -d

# 配置防火墙
sudo ufw allow 8771/tcp
sudo ufw enable

# 设置开机自启
systemctl enable docker
```

#### 1.2 使用 Docker 命令

```bash
# 1. 拉取镜像
docker pull ghcr.io/kob/birdtv:latest
docker pull apache/kvrocks:2.11.0

# 2. 创建数据卷
docker volume create birdtv-data
docker volume create kvrocks-data

# 3. 启动 Kvrocks
docker run -d \
  --name kvrocks \
  --restart unless-stopped \
  -p 6666:6666 \
  -v kvrocks-data:/var/lib/kvrocks \
  apache/kvrocks:2.11.0

# 4. 运行 BirdTV 容器
docker run -d \
  --name birdtv \
  --restart unless-stopped \
  -p 8771:8771 \
  -e AUTH_ENABLED=true \
  -e AUTH_JWT_SECRET=$(openssl rand -hex 32) \
  -e AUTH_DEFAULT_ADMIN=admin \
  -e AUTH_DEFAULT_PASSWORD=$(openssl rand -base64 12) \
  -e AUTH_REDIS_HOST=host.docker.internal \
  -e AUTH_REDIS_PORT=6666 \
  -v birdtv-data:/app/data \
  --link kvrocks:kvrocks \
  ghcr.io/kob/birdtv:latest

# 5. 查看运行状态
docker ps
docker logs -f birdtv
```

#### 1.3 使用 Nginx 反向代理 (推荐)

```nginx
# /etc/nginx/sites-available/birdtv
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8771;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}

# 启用配置
sudo ln -s /etc/nginx/sites-available/birdtv /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 配置 HTTPS (使用 Let's Encrypt)
sudo certbot --nginx -d your-domain.com
```

---

### 2. NAS 部署 (Synology / QNAP)

#### 2.1 Synology 群晖部署

**使用 Container Manager (推荐)**:

1. 打开 Container Manager (Docker 套件)
2. 在"项目"中点击"新建"
3. 选择"创建 docker-compose.yml"
4. 输入项目名称: `birdtv`
5. 粘贴以下配置:

```yaml
version: "3.8"

services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    ports:
      - "8771:8771"
    environment:
      - HOST=0.0.0.0
      - PORT=8771
      - NODE_ENV=production
      - AUTH_ENABLED=true
      - AUTH_JWT_SECRET=your-secret-key-change-me
      - AUTH_TOKEN_EXPIRE_DAYS=7
      - AUTH_DEFAULT_ADMIN=admin
      - AUTH_DEFAULT_PASSWORD=admin123
    volumes:
      - ./data:/app/data
```

6. 点击"下一步"完成部署
7. 访问 `http://nas-ip:8771`

**使用 SSH 命令行**:

```bash
# SSH 连接到群晖
ssh admin@nas-ip

# 切换到 Docker 目录
cd /volume1/docker

# 创建项目目录
mkdir -p birdtv/data
cd birdtv

# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: "3.8"

services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    ports:
      - "8771:8771"
    environment:
      - HOST=0.0.0.0
      - PORT=8771
      - NODE_ENV=production
      - AUTH_ENABLED=true
      - AUTH_JWT_SECRET=$(openssl rand -hex 32)
      - AUTH_DEFAULT_ADMIN=admin
      - AUTH_DEFAULT_PASSWORD=$(openssl rand -base64 12)
    volumes:
      - ./data:/app/data
EOF

# 启动服务
docker-compose up -d
```

#### 2.2 QNAP 威联通部署

**使用 Container Station**:

1. 打开 Container Station
2. 点击"创建" → "应用程序"
3. 输入名称: `birdtv`
4. 粘贴 YAML 配置 (同上)
5. 点击"创建"

**使用命令行**:

```bash
# SSH 连接到 QNAP
ssh admin@nas-ip

# 进入容器目录
cd /share/CACHEDEV1_DATA/Container

# 创建项目
mkdir -p birdtv/data
cd birdtv

# 创建并启动
docker-compose up -d
```

---

### 3. 软路由部署 (OpenWrt / iStoreOS)

#### 3.1 OpenWrt 部署

**前提条件**: 软路由需要支持 Docker (推荐 4GB+ 内存)

```bash
# SSH 连接到软路由
ssh root@192.168.1.1

# 安装 Docker (如果未安装)
opkg update
opkg install docker dockerd docker-compose

# 启动 Docker 服务
/etc/init.d/dockerd start
/etc/init.d/dockerd enable

# 创建项目目录
mkdir -p /root/birdtv/data
cd /root/birdtv

# 创建配置文件
cat > docker-compose.yml << 'EOF'
version: "3.8"

services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    network_mode: host
    environment:
      - HOST=0.0.0.0
      - PORT=8771
      - NODE_ENV=production
      - AUTH_ENABLED=true
      - AUTH_JWT_SECRET=$(openssl rand -hex 32)
      - AUTH_DEFAULT_ADMIN=admin
      - AUTH_DEFAULT_PASSWORD=admin123
    volumes:
      - ./data:/app/data
EOF

# 启动服务
docker-compose up -d

# 配置防火墙 (如果使用 bridge 模式)
# iptables -I INPUT -p tcp --dport 8771 -j ACCEPT
# iptables -I FORWARD -p tcp --dport 8771 -j ACCEPT
```

**访问**: `http://192.168.1.1:8771`

#### 3.2 iStoreOS 部署

1. 登录 iStoreOS 管理界面
2. 进入"容器" → "Docker"
3. 点击"镜像仓库"，输入 `ghcr.io/kob/birdtv:latest` 并拉取
4. 点击"容器" → "创建容器"
5. 配置如下:
   - 名称: `birdtv`
   - 端口映射: `8771:8771`
   - 环境变量:
     - `HOST=0.0.0.0`
     - `AUTH_ENABLED=true`
     - `AUTH_JWT_SECRET=your-secret`
     - `AUTH_DEFAULT_ADMIN=admin`
     - `AUTH_DEFAULT_PASSWORD=admin123`
   - 存储卷: `/root/birdtv/data:/app/data`
   - 自动启动: 开启
6. 点击"创建"并启动

---

### 4. Railway 部署

Railway 是一个支持 Docker 镜像的云平台。

#### 4.1 方法一: 使用 Docker 镜像 (推荐)

```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 创建项目
railway init
railway add

# 创建服务
railway up

# 配置服务
railway variables set AUTH_ENABLED=true
railway variables set AUTH_JWT_SECRET=$(openssl rand -hex 32)
railway variables set AUTH_DEFAULT_ADMIN=admin
railway variables set AUTH_DEFAULT_PASSWORD=$(openssl rand -base64 12)
railway variables set PORT=8771

# 设置镜像源
railway variables set RAILWAY_CONTAINER_IMAGE=ghcr.io/kob/birdtv:latest

# 部署
railway up

# 获取域名
railway domain
```

#### 4.2 方法二: 使用 GitHub 连接

1. 登录 [Railway](https://railway.app/)
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的 BirdTV 仓库
4. Railway 会自动检测 Dockerfile 并构建
5. 配置环境变量:
   - `AUTH_ENABLED=true`
   - `AUTH_JWT_SECRET=your-secret-key`
   - `AUTH_DEFAULT_ADMIN=admin`
   - `AUTH_DEFAULT_PASSWORD=admin123`
   - `PORT=8771`
6. 点击 "Deploy"

**注意事项**:
- Railway 会自动分配 HTTPS 域名
- 免费套餐: $5/月，512MB 内存
- 付费套餐: 推荐 $10/月，1GB 内存

---

### 5. IDX 部署

Google IDX 是基于云的 AI 开发环境。

#### 5.1 IDX Docker 部署

```bash
# 在 IDX 终端中执行

# 拉取镜像
docker pull ghcr.io/kob/birdtv:latest

# 运行容器
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

# 查看运行状态
docker ps
docker logs -f birdtv
```

#### 5.2 访问 IDX 服务

1. 在 IDX 终端运行:
   ```bash
   # 获取 IDX 预览 URL
   echo "访问端口预览: https://idx-preview-url/"
   ```

2. 在 IDX 界面中:
   - 点击右上角 "Web Preview"
   - 选择 "Port 8771"
   - 自动打开新标签页访问

#### 5.3 IDX 后台运行

```bash
# 1. 启动 Kvrocks
nohup docker run -d \
  --name kvrocks \
  -p 6666:6666 \
  -v kvrocks-data:/var/lib/kvrocks \
  apache/kvrocks:2.11.0 > kvrocks.log 2>&1 &

# 2. 启动 BirdTV
nohup docker run -d \
  --name birdtv \
  -p 8771:8771 \
  -e AUTH_ENABLED=true \
  -e AUTH_JWT_SECRET=secret \
  -e AUTH_REDIS_HOST=host.docker.internal \
  -e AUTH_REDIS_PORT=6666 \
  -v birdtv-data:/app/data \
  --link kvrocks:kvrocks \
  ghcr.io/kob/birdtv:latest > birdtv.log 2>&1 &

# 3. 监控日志
tail -f birdtv.log
tail -f kvrocks.log
```

---

### 6. Hugging Face Spaces 部署

#### 6.1 创建 Spaces

1. 访问 [Hugging Face Spaces](https://huggingface.co/spaces)
2. 点击 "Create new Space"
3. 配置:
   - Space name: `birdtv`
   - License: MIT
   - SDK: Docker
   - Public/Private: 根据需求选择

#### 6.2 创建 docker-compose.yml

在 Space 仓库中创建 `docker-compose.yml`:

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

#### 6.3 配置 Secrets

在 Space 设置中添加 Secrets:
- `AUTH_JWT_SECRET=your-secret-key-here` (随机生成)
- `AUTH_ENABLED=true` (可选，默认为 true)
- `AUTH_DEFAULT_ADMIN=admin` (可选)
- `AUTH_DEFAULT_PASSWORD=admin123` (可选)

#### 6.4 创建 README.md

```markdown
---
title: BirdTV
emoji: 📺
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
license: mit
---

# BirdTV IPTV Player

Docker-based IPTV player with M3U support and admin management.
```

#### 6.5 部署

提交代码后，Hugging Face 会自动构建并部署。

**访问**: `https://huggingface.co/spaces/your-username/birdtv`

---

### 7. SAP BTP 部署

SAP Business Technology Platform 支持 Cloud Foundry 和 Kyma (Kubernetes)。

#### 7.1 SAP BTP Cloud Foundry 部署

**前提条件**:
- SAP BTP 账户
- Cloud Foundry CLI

```bash
# 安装 Cloud Foundry CLI
# macOS
brew install cloudfoundry/tap/cf-cli

# Linux
wget -q -O - https://packages.cloudfoundry.org/debian/cli.cloudfoundry.org.key | sudo apt-key add -
echo "deb https://packages.cloudfoundry.org/debian stable main" | sudo tee /etc/apt/sources.list.d/cloudfoundry-cli.list
sudo apt-get update && sudo apt-get install cf8-cli

# 登录 SAP BTP
cf login -a https://api.<region>.hana.ondemand.com \
  -u <username> \
  -p <password> \
  -o <org> \
  -s <space>

# 创建 Redis 服务实例
cf create-service redis cloud redis-birdtv

# 推送应用
cf push birdtv \
  --docker-image ghcr.io/kob/birdtv:latest \
  --docker-username <github-username> \
  --docker-password <github-pat> \
  -m 512M \
  -k 1G \
  --random-route \
  --no-start

# 绑定 Redis 服务
cf bind-service birdtv redis-birdtv

# 配置环境变量
cf set-env birdtv AUTH_ENABLED true
cf set-env birdtv AUTH_JWT_SECRET your-secret-key
cf set-env birdtv AUTH_REDIS_HOST $(cf service redis-birdtv | grep credentials | jq -r '.hostname')
cf set-env birdtv AUTH_REDIS_PORT $(cf service redis-birdtv | grep credentials | jq -r '.port')
cf set-env birdtv AUTH_DEFAULT_ADMIN admin
cf set-env birdtv AUTH_DEFAULT_PASSWORD admin123
cf set-env birdtv PORT 8080

# 重启应用
cf restage birdtv

# 查看日志
cf logs birdtv --recent
```

#### 7.2 创建 manifest.yml (可选)

```yaml
applications:
  - name: birdtv
    instances: 1
    memory: 512M
    disk_quota: 1G
    docker:
      image: ghcr.io/kob/birdtv:latest
      username: ((github-username))
      password: ((github-pat))
    env:
      AUTH_ENABLED: true
      AUTH_JWT_SECRET: ((auth-jwt-secret))
      AUTH_DEFAULT_ADMIN: admin
      AUTH_DEFAULT_PASSWORD: ((admin-password))
      PORT: 8080
    health-check-type: port
    timeout: 180
```

**使用 manifest 部署**:

```bash
# 创建变量文件
cat > vars.yml << EOF
github-username: your-username
github-pat: your-github-pat
auth-jwt-secret: $(openssl rand -hex 32)
admin-password: $(openssl rand -base64 12)
EOF

# 部署
cf push -f manifest.yml --vars-file vars.yml
```

#### 7.3 访问应用

部署成功后，CF 会自动分配路由:
```
https://birdtv-<random-string>.apps.<region>.hana.ondemand.com
```

---

## 环境变量说明

### 基础配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `HOST` | `0.0.0.0` | 监听地址 | 否 |
| `PORT` | `8771` | 监听端口 | 否 |
| `NODE_ENV` | `production` | 运行环境 | 否 |

### 认证配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `AUTH_ENABLED` | `true` | 是否启用认证 | 否 |
| `AUTH_JWT_SECRET` | `change-me` | JWT 密钥 (生产环境必须修改) | 是 |
| `AUTH_TOKEN_EXPIRE_DAYS` | `7` | Token 有效期 (天) | 否 |
| `AUTH_DEFAULT_ADMIN` | `admin` | 默认管理员用户名 | 否 |
| `AUTH_DEFAULT_PASSWORD` | `admin123` | 默认管理员密码 | 否 |

### Redis 配置 (可选)

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `AUTH_REDIS_HOST` | - | Redis 主机地址 | 否 |
| `AUTH_REDIS_PORT` | `6379` | Redis 端口 | 否 |
| `AUTH_REDIS_PASSWORD` | - | Redis 密码 | 否 |
| `AUTH_REDIS_DB` | `0` | Redis 数据库编号 | 否 |

> **注意**: 不配置 Redis 时，系统使用内存存储 (重启后数据丢失)

### 代理配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `M3U_PROXY_TIMEOUT_MS` | `40000` | 代理超时时间 (毫秒) | 否 |
| `M3U_PROXY_REDIRECT_LIMIT` | `3` | 最大重定向次数 | 否 |
| `M3U_PROXY_DEFAULT_UA` | `okhttp/4.3` | 默认 User-Agent | 否 |

---

## 数据持久化

### Docker Volume 方式 (推荐)

```bash
docker volume create birdtv-data

docker run -d \
  --name birdtv \
  -v birdtv-data:/app/data \
  ghcr.io/kob/birdtv:latest
```

### Bind Mount 方式

```bash
docker run -d \
  --name birdtv \
  -v /path/to/local/data:/app/data \
  ghcr.io/kob/birdtv:latest
```

### 备份数据

```bash
# 备份到本地
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

---

## 常用命令

### 查看日志

```bash
# 实时日志
docker logs -f birdtv

# 最近 100 行
docker logs --tail 100 birdtv

# 带时间戳
docker logs -t birdtv
```

### 进入容器

```bash
# 进入容器 Shell
docker exec -it birdtv sh

# 执行命令
docker exec birdtv node -v
docker exec birdtv ls -la /app/data
```

### 重启容器

```bash
# 重启
docker restart birdtv

# 停止
docker stop birdtv

# 启动
docker start birdtv
```

### 更新镜像

```bash
# 拉取最新镜像
docker pull ghcr.io/kob/birdtv:latest

# 停止并删除旧容器
docker stop birdtv
docker rm birdtv

# 使用新镜像启动
docker run -d \
  --name birdtv \
  --restart unless-stopped \
  -p 8771:8771 \
  -e AUTH_ENABLED=true \
  -e AUTH_JWT_SECRET=your-secret \
  -v birdtv-data:/app/data \
  ghcr.io/kob/birdtv:latest
```

---

## 健康检查

```bash
# 检查容器状态
docker ps | grep birdtv

# 检查服务是否正常
curl http://localhost:8771

# 检查 API 端点
curl http://localhost:8771/api/health
curl http://localhost:8771/api/channels
```

---

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker logs birdtv

# 检查端口占用
netstat -tuln | grep 8771
lsof -i :8771

# 检查环境变量
docker inspect birdtv | grep -A 20 Env
```

### 无法访问服务

```bash
# 检查容器是否运行
docker ps

# 检查端口映射
docker port birdtv

# 检查防火墙
sudo ufw status
sudo iptables -L -n

# 测试内部访问
docker exec birdtv wget -O- http://localhost:8771
```

### 数据丢失问题

```bash
# 检查数据卷
docker volume ls
docker volume inspect birdtv-data

# 检查数据目录权限
docker exec birdtv ls -la /app/data
```

---

## 性能优化

### 资源限制

```bash
docker run -d \
  --name birdtv \
  --restart unless-stopped \
  --memory="512m" \
  --memory-swap="1g" \
  --cpus="1.0" \
  -p 8771:8771 \
  -v birdtv-data:/app/data \
  ghcr.io/kob/birdtv:latest
```

### 使用 Redis 缓存

```yaml
# docker-compose.yml
services:
  birdtv:
    image: ghcr.io/kob/birdtv:latest
    depends_on:
      - redis
    environment:
      - AUTH_REDIS_HOST=redis
      - AUTH_REDIS_PORT=6379
  
  redis:
    image: redis:alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
```

---

## 安全建议

1. **修改默认密码**: 生产环境必须修改 `AUTH_DEFAULT_PASSWORD`
2. **使用强密钥**: 生成随机 JWT_SECRET: `openssl rand -hex 32`
3. **启用 HTTPS**: 使用 Nginx 或 Traefik 反向代理
4. **限制访问**: 配置防火墙规则
5. **定期备份**: 设置定时备份数据卷
6. **更新镜像**: 定期拉取最新镜像更新

---

## 端口说明

| 端口 | 协议 | 用途 | 说明 |
|------|------|------|------|
| 8771 | HTTP | Web 服务 | 主服务端口 |
| 6666 | TCP | Redis | Kvrocks 数据库端口 (仅内部通信) |

---

## 网络配置

### Bridge 模式 (默认)

```bash
docker run -d \
  --name birdtv \
  -p 8771:8771 \
  ghcr.io/kob/birdtv:latest
```

### Host 模式 (性能更好)

```bash
docker run -d \
  --name birdtv \
  --network host \
  ghcr.io/kob/birdtv:latest
```

### 自定义网络

```bash
# 创建网络
docker network create birdtv-net

# 启动容器
docker run -d \
  --name birdtv \
  --network birdtv-net \
  -p 8771:8771 \
  ghcr.io/kob/birdtv:latest
```

---

## 常见问题

### Q: 如何获取 JWT Secret?

```bash
openssl rand -hex 32
```

### Q: 如何重置管理员密码?

```bash
# 方法1: 环境变量
docker stop birdtv
docker run -d \
  --name birdtv \
  -e AUTH_DEFAULT_PASSWORD=newpassword \
  ghcr.io/kob/birdtv:latest

# 方法2: 直接修改配置文件
docker exec -it birdtv sh
vi /app/data/settings.json
```

### Q: 如何导出数据?

```bash
# 复制数据到本地
docker cp birdtv:/app/data ./data-backup

# 或使用 API
curl http://localhost:8771/api/export/all -o backup.json
```

### Q: 如何批量导入频道?

```bash
# 使用 API
curl -X POST http://localhost:8771/api/sources/m3u \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url":"https://example.com/playlist.m3u"}'
```

---

## 参考资源

- [GitHub 仓库](https://github.com/your-repo/birdtv)
- [Docker Hub](https://hub.docker.com/r/kob/birdtv)
- [GitHub Container Registry](https://github.com/kob/birdtv/pkgs/container/birdtv)
- [项目文档](./README.md)

---

## 许可证

MIT License

---

**最后更新**: 2026-04-04
