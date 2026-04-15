# BirdTV

现代化 IPTV 播放器系统，支持 M3U 播放列表、EPG 电子节目单、用户认证等功能。

## 功能

- **播放器**: HLS/DASH/MP4/TS 多格式，Shaka Player + HLS.js + mpegts.js
- **管理后台**: 频道 CRUD、源配置、EPG 管理、用户管理
- **移动端**: 简洁触屏界面

## 快速部署

### Docker 一键部署（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/kob/birdtv/main/scripts/docker-quick.sh | bash
```

或手动：

```bash
mkdir birdtv && cd birdtv
curl -O https://raw.githubusercontent.com/kob/birdtv/main/docker-compose.yml
echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d
```

### VPS 部署（原生 Node.js）

```bash
# 下载脚本
curl -O https://raw.githubusercontent.com/kob/birdtv/main/scripts/deploy-vps.sh
chmod +x deploy-vps.sh

# 部署（自动安装 Docker + Nginx）
GIT_REPO=https://github.com/kob/birdtv.git DOMAIN=your-domain.com ./deploy-vps.sh
```

### 软路由部署（OpenWrt/iStoreOS）

```bash
ssh root@192.168.1.1
curl -O https://raw.githubusercontent.com/kob/birdtv/main/scripts/deploy-router.sh
chmod +x deploy-router.sh
./deploy-router.sh
```

## 访问地址

| 页面 | 地址 |
|------|------|
| 前端播放器 | http://localhost:8771/ |
| 后台管理 | http://localhost:8771/admin.html |
| 移动端 | http://localhost:8771/mobile.html |
| 默认账号 | admin / admin123 |

## 本地开发

```bash
git clone https://github.com/kob/birdtv.git
cd BirdTV
npm install
cp .env.example .env
# 编辑 .env 配置 KVRocks
node birdtv.js
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8771 | 监听端口 |
| `AUTH_ENABLED` | true | 启用认证 |
| `AUTH_JWT_SECRET` | - | JWT 密钥（必填） |
| `AUTH_REDIS_HOST` | - | KVRocks 地址 |
| `AUTH_REDIS_PORT` | 6666 | KVRocks 端口 |

## 常用命令

```bash
docker compose logs -f     # 查看日志
docker compose restart     # 重启
docker compose pull        # 更新
```

## 项目结构

```
BirdTV/
├── backend/              # 后端 API
├── web/                  # 前端页面
├── scripts/              # 部署脚本
│   ├── deploy-vps.sh     # VPS 原生部署
│   ├── deploy-router.sh  # 软路由 Docker 部署
│   └── docker-quick.sh   # Docker 快速部署
├── birdtv.js             # 主入口
└── docker-compose.yml    # Docker 配置
```

## 技术栈

- Node.js + Express
- Shaka Player / HLS.js / mpegts.js
- Docker / KVRocks

MIT License
