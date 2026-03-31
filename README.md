w# BirdTV

现代化的 IPTV 播放器 + 完整后台管理系统，支持 M3U 播放列表、频道管理、用户认证等功能。

## 功能特性

### 播放器
- 📺 支持多种流媒体格式（HLS、DASH、MP4、WebM）
- 🎵 M3U/M3U8 播放列表导入
- 🔄 智能线路切换和故障转移
- 🎨 美观的 Luna 主题界面
- ⚡ 快速加载和响应
- 📱 响应式设计（支持移动端）

### 后台管理
- 🔐 完整的用户认证系统（JWT + Redis）
- 📋 频道管理（CRUD、搜索、批量导入）
- 📡 源配置管理（M3U 源、EPG 源）
- 👥 用户管理（角色权限、密码管理）
- ⚙️ 系统设置（播放器、缓存、超时等）
- 📊 仪表盘统计

### API 服务
- 🔒 RESTful API 接口
- 🌐 CORS 支持
- 💾 数据持久化（Redis/文件）
- 🔄 自动缓存机制

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **播放器**: Shaka Player, HLS.js, Video.js
- **代理服务**: Node.js HTTP/HTTPS 代理

## 快速开始

### 1. 环境准备

确保已安装 Node.js (推荐 v18+)：

```bash
node --version
npm --version
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量（可选）

```bash
cp .env.example .env
# 编辑 .env 文件配置 Redis、JWT 密钥等
```

### 4. 启动服务

```bash
# 方式一：使用 npm 命令（推荐）
npm run start:web:local

# 方式二：直接启动
node birdtv.js

# 方式三：使用 PM2（生产环境）
pm2 start birdtv.js --name birdtv
```

### 5. 访问服务

- **登录页面**: http://localhost:8771/login.html
- **管理后台**: http://localhost:8771/admin.html
- **前端播放器**: http://localhost:8771/
- **健康检查**: http://localhost:8771/health

**默认账号**: `admin / [首次登录请修改密码]`

## 项目结构

```
BirdTV/
├── web/                      # 前端源码
│   ├── index.html           # 前端播放器
│   ├── admin.html           # 后台管理页面
│   ├── login.html           # 登录页面
│   ├── app.js               # 播放器主逻辑
│   ├── src/
│   │   └── modules/         # 功能模块（20+ JS 模块）
│   └── assets/              # 静态资源（CSS、图片）
├── backend/                 # 后端代码
│   ├── controllers/         # API 控制器
│   ├── models/              # 数据模型
│   ├── routes/              # API 路由
│   ├── middleware/          # 中间件（认证、CORS）
│   └── services/            # 服务层（存储）
├── birdtv.js               # 统一服务入口（代理+API）
├── auth.js                 # 认证模块（JWT + bcrypt）
├── data/                   # 数据目录（JSON 存储）
├── files/cache/            # 缓存目录
└── package.json            # 项目配置
```

## 环境变量

创建 `.env` 文件配置系统参数：

```bash
# 基本配置
BIRDTV_PORT=8771
BIRDTV_HOST=0.0.0.0
BIRDTV_TIMEOUT_MS=40000

# 认证配置
AUTH_ENABLED=true
AUTH_JWT_SECRET=请修改为随机密钥-生产环境必须修改
AUTH_TOKEN_EXPIRE_DAYS=7
AUTH_DEFAULT_ADMIN=admin
AUTH_DEFAULT_PASSWORD=请修改默认密码

# Redis 配置（可选，未配置时使用文件存储）
AUTH_REDIS_HOST=localhost
AUTH_REDIS_PORT=6379
AUTH_REDIS_PASSWORD=
AUTH_REDIS_DB=0

# 缓存配置
BIRDTV_CACHE_M3U_TTL_MS=600000
BIRDTV_CACHE_EPG_TTL_MS=1800000

# 代理配置
BIRDTV_REMOTE_BASE_URL=https://example.com/playlist.m3u
BIRDTV_DEFAULT_UA=okhttp/4.3
```

## 使用说明

### 1. 登录系统

访问 http://localhost:8771/login.html，使用默认账号登录：
- 用户名：`admin`
- 密码：`admin123`（首次登录请立即修改）

### 2. 后台管理

#### 频道管理
- 添加频道：点击"添加频道"，填写名称和 URL
- 编辑频道：点击编辑按钮修改信息
- 删除频道：点击删除按钮确认删除
- 搜索频道：在搜索框输入关键词

#### 源配置
- M3U 源：配置 M3U 播放列表地址
- EPG 源：配置电子节目单地址
- 测试源：点击测试按钮检查可用性

#### 用户管理
- 添加用户：创建新用户并分配角色
- 修改密码：为用户重置密码
- 删除用户：移除用户账户

#### 系统设置
- 默认播放器：Shaka/ArtPlayer/HLS.js/原生
- 缓存时间：M3U 和 EPG 的缓存时长
- 播放模式：自动/原画/稳定模式

### 3. 前端播放器

访问 http://localhost:8771/ 即可观看已配置的频道。

## API 文档

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
```

### 源管理接口

```bash
# 获取 M3U 源列表
GET /api/sources/m3u

# 创建 M3U 源
POST /api/sources/m3u
{ "name": "我的源", "url": "http://..." }

# 删除源
DELETE /api/sources/m3u/:id
```

### 设置接口

```bash
# 获取设置
GET /api/settings

# 更新设置
PUT /api/settings
{ "defaultPlayer": "shaka", "cacheM3uTtl": 600000 }
```

## 常见问题

### 1. 无法登录

- 检查服务是否启动：`curl http://localhost:8771/health`
- 检查默认账号密码是否正确
- 查看日志：`pm2 logs birdtv` 或 `tail -f birdtv.log`

### 2. 播放失败

- 检查频道 URL 是否有效
- 尝试切换播放器类型
- 检查网络连接和防火墙

### 3. Redis 连接失败

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

### 4. 端口被占用

修改 `.env` 中的端口：
```bash
BIRDTV_PORT=8772
```

### 5. 权限不足

确保使用管理员账号登录，普通用户无法访问用户管理和系统设置页面。

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **播放器**: Shaka Player, ArtPlayer, HLS.js
- **构建工具**: Vite
- **后端**: Node.js (原生 HTTP 服务器)
- **认证**: JWT + bcrypt
- **存储**: Redis (可选) / JSON 文件
- **代码规范**: ESLint, Prettier

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关链接

- [API 检查清单](./API_CHECKLIST.md)
- [开发指南](./DEVELOPMENT.md)
- [架构说明](./ARCHITECTURE.md)
