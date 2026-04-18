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

### 开发模式（Vite HMR 热更新）

```bash
./dev.sh
# 后端 API: http://localhost:8771
# 前端开发: http://localhost:5173（自动代理 API）
```

### 生产构建

```bash
./build.sh        # 构建前端到 web/dist/
node birdtv.js    # 自动检测并使用 web/dist/
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
├── backend/              # 后端 API（认证、频道、源、设置等）
├── web/                  # 前端页面（Vite MPA）
│   ├── src/              # JS/CSS 源码
│   │   ├── modules/      # 播放器模块（ES Module）
│   │   └── admin/        # 管理后台模块
│   ├── index.html        # 播放器页面
│   ├── admin.html        # 管理后台
│   ├── login.html        # 登录页
│   ├── mobile.html       # 移动端
│   ├── vite.config.js    # Vite 配置
│   └── dist/             # 构建输出（gitignore）
├── scripts/              # 部署脚本
├── birdtv.js             # 主入口
├── dev.sh                # 开发模式启动
├── build.sh              # 前端构建
└── docker-compose.yml    # Docker 配置
```

## 技术栈

- Node.js（原生 HTTP Server）
- Vite（前端构建 + HMR）
- Shaka Player / HLS.js / mpegts.js
- Docker / KVRocks

MIT License
