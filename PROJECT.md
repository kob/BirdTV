# BirdTV 项目文档

## 项目概述

BirdTV 是一个现代化的 IPTV 播放器系统，包含完整的前端播放器和后台管理系统。支持 M3U 播放列表、频道管理、EPG 电子节目单、用户认证等功能。

## 项目结构

```
BirdTV/
├── backend/                    # 后端代码
│   ├── config/                # 配置文件
│   │   └── redisConfig.js     # Redis 配置
│   ├── controllers/           # 控制器
│   │   ├── authController.js  # 认证控制器
│   │   ├── channelController.js # 频道控制器
│   │   ├── epgController.js   # EPG 控制器
│   │   ├── exportController.js # 导出控制器
│   │   ├── settingsController.js # 设置控制器
│   │   └── sourceController.js # 源控制器
│   ├── managers/              # 管理器
│   │   └── uaManager.js       # UA 管理器
│   ├── middleware/            # 中间件
│   │   ├── auth.js           # 认证中间件
│   │   ├── cors.js           # CORS 中间件
│   │   └── error.js          # 错误处理中间件
│   ├── models/                # 数据模型
│   │   ├── Channel.js        # 频道模型
│   │   ├── EpgChannel.js     # EPG 频道模型
│   │   ├── EpgData.js        # EPG 数据模型
│   │   ├── EpgSource.js      # EPG 源模型
│   │   ├── Export.js         # 导出模型
│   │   ├── Link.js           # 链接模型
│   │   ├── M3uSource.js      # M3U 源模型
│   │   └── User.js           # 用户模型
│   ├── routes/                # 路由
│   │   ├── auth.js           # 认证路由
│   │   ├── channels.js       # 频道路由
│   │   ├── epg.js            # EPG 路由
│   │   ├── exports.js        # 导出路由
│   │   ├── settings.js       # 设置路由
│   │   └── sources.js        # 源路由
│   ├── services/              # 服务
│   │   ├── storageService.js # 存储服务
│   │   └── tokenService.js   # Token 服务
│   └── api-server.js         # API 服务器入口
├── web/                       # 前端代码
│   ├── assets/               # 静态资源
│   │   ├── luna-theme.css    # Luna 主题样式
│   │   ├── mobile-fix.css    # 移动端修复样式
│   │   └── theme-switcher.js # 主题切换脚本
│   ├── src/                  # 源代码
│   │   └── modules/          # 模块
│   │       ├── players/      # 播放器模块
│   │       │   ├── artplayer.js
│   │       │   ├── fallback.js
│   │       │   ├── mpegts.js
│   │       │   └── native.js
│   │       ├── auth-cookie.js # Cookie 认证
│   │       ├── channels.js   # 频道相关
│   │       ├── config.js     # 配置
│   │       ├── constants.js  # 常量
│   │       ├── diagnostics.js # 诊断
│   │       ├── dom.js        # DOM 工具
│   │       ├── drm.js        # DRM 相关
│   │       ├── epg.js        # EPG 相关
│   │       ├── errors.js     # 错误处理
│   │       ├── init.js       # 初始化
│   │       ├── live.js       # 直播相关
│   │       ├── m3u.js        # M3U 解析
│   │       ├── mobile-player.js # 移动端播放器
│   │       ├── player-constants.js # 播放器常量
│   │       ├── proxy.js      # 代理相关
│   │       ├── redirect.js   # 重定向
│   │       ├── runtime-config.js # 运行时配置
│   │       ├── shaka-init.js # Shaka 初始化
│   │       ├── state.js      # 状态管理
│   │       ├── stats.js      # 统计
│   │       ├── store.js      # 存储
│   │       ├── ua.js         # UA 相关
│   │       └── utils.js      # 工具函数
│   ├── admin.html            # 后台管理页面
│   ├── index.html            # 主页面
│   ├── login.html            # 登录页面
│   └── mobile.html           # 移动端页面
├── data/                      # 数据文件
│   ├── exports/              # 导出的文件
│   ├── channels.json         # 频道数据
│   ├── epg-channels.json     # EPG 频道数据
│   ├── epg-sources.json      # EPG 源数据
│   ├── exports.json          # 导出记录
│   ├── links.json            # 链接数据
│   ├── m3u-sources.json      # M3U 源数据
│   └── settings.json         # 系统设置
├── files/cache/               # 缓存文件
├── frontend/player/           # 前端播放器
├── .env                       # 环境变量配置
├── .env.example              # 环境变量示例
├── .gitignore                # Git 忽略文件
├── package.json              # 项目配置
├── birdtv.js                 # 主服务器入口
└── auth.js                   # 认证入口
```

## 核心功能模块

### 1. 播放器功能
- **多格式支持**: HLS (.m3u8), DASH (.mpd), MP4, WebM, TS
- **多种播放器内核**: Shaka Player, ArtPlayer, HLS.js, mpegts.js
- **智能播放器选择**: 根据流媒体类型自动选择最佳播放器
- **DRM 支持**: Widevine, PlayReady 许可证
- **线路切换**: 支持多线路快速切换
- **故障转移**: 播放失败自动切换到备用线路

### 2. 频道管理
- **CRUD 操作**: 完整的增删改查功能
- **批量导入**: 支持从 M3U 文件批量导入频道
- **批量操作**: 批量修改代理方式、播放器、分组、UA
- **搜索过滤**: 按名称、分组、状态搜索
- **分组管理**: 预设分组 + 自定义分组
- **频道配置**: 
  - 代理模式（自动/代理/直连）
  - 播放器类型（自动/Shaka/ArtPlayer/HLS.js/mpegts）
  - User-Agent 设置
  - DRM 配置

### 3. EPG 电子节目单
- **独立 EPG 管理**: 与频道管理分离
- **加载策略**:
  - 自动匹配：根据频道名称自动匹配 EPG
  - 手动绑定：手动指定 EPG 源
  - 自定义映射：自定义频道与 EPG 的映射关系
  - 智能学习：学习用户的匹配选择
- **批量操作**: 批量设置策略、批量设置分组、批量删除
- **从频道列表导入**: 一键导入所有频道
- **分组管理**: 预设 10 个分组（CCTV、卫视、地方台、港澳、国际、影视、体育、新闻、少儿、其他）

### 4. 节目源管理
- **M3U 源管理**: 支持多个 M3U 源配置
- **EPG 源管理**: 支持多个 EPG 源配置
- **源配置**:
  - 名称、URL、启用状态
  - 更新间隔
  - 默认播放器
  - 代理模式
  - 超时设置
  - 重试次数

### 5. 用户管理系统
- **JWT 认证**: 基于 JWT 的身份验证
- **Redis 存储**: Token 存储在 Redis 中
- **角色权限**: 管理员和普通用户角色
- **密码管理**: 密码加密存储
- **Token 管理**: Token 生成、验证、刷新、撤销

### 6. 分组与 UA 管理
- **分组管理**:
  - 预设分组（不可删除）
  - 自定义分组（可添加删除）
  - 分组关联频道
- **UA 管理**:
  - 全局 User-Agent 设置
  - 频道级 UA 设置（覆盖全局）
  - 预设 UA 快速选择
  - 自定义 UA 管理

### 7. 导出管理
- **M3U 导出**: 导出频道为 M3U 格式
- **批量导出**: 支持批量选择频道导出
- **导出记录**: 保存导出历史记录

### 8. 链接管理
- **用户链接**: 为用户生成专属链接
- **链接管理**: 创建、编辑、删除链接
- **链接统计**: 记录链接使用情况

## API 接口

### 认证接口
```
POST   /api/auth/login      - 用户登录
POST   /api/auth/logout     - 用户登出
POST   /api/auth/refresh    - 刷新 Token
GET    /api/auth/me         - 获取当前用户信息
```

### 频道接口
```
GET    /api/channels              - 获取频道列表
POST   /api/channels              - 创建频道
GET    /api/channels/:id          - 获取频道详情
PUT    /api/channels/:id          - 更新频道
DELETE /api/channels/:id          - 删除频道
GET    /api/channels/groups       - 获取所有分组
POST   /api/channels/batch        - 批量导入
POST   /api/channels/batch/delete - 批量删除
POST   /api/channels/batch/update - 批量更新
```

### EPG 接口
```
GET    /api/epg/channels          - 获取 EPG 频道列表
POST   /api/epg/channels          - 创建 EPG 频道
PUT    /api/epg/channels/:id      - 更新 EPG 频道
DELETE /api/epg/channels/:id      - 删除 EPG 频道
GET    /api/epg/groups            - 获取所有分组
POST   /api/epg/batch-set-group   - 批量设置分组
```

### 源管理接口
```
GET    /api/sources/m3u           - 获取 M3U 源列表
POST   /api/sources/m3u           - 创建 M3U 源
PUT    /api/sources/m3u/:id       - 更新 M3U 源
DELETE /api/sources/m3u/:id       - 删除 M3U 源
GET    /api/sources/epg           - 获取 EPG 源列表
POST   /api/sources/epg           - 创建 EPG 源
PUT    /api/sources/epg/:id       - 更新 EPG 源
DELETE /api/sources/epg/:id       - 删除 EPG 源
```

### 设置接口
```
GET    /api/settings              - 获取所有设置
PUT    /api/settings              - 更新设置
GET    /api/settings/ua/global    - 获取全局 UA
PUT    /api/settings/ua/global    - 更新全局 UA
```

### 导出接口
```
GET    /api/exports               - 获取导出记录列表
POST   /api/exports               - 创建导出记录
DELETE /api/exports/:id           - 删除导出记录
```

### 链接接口
```
GET    /api/links                 - 获取链接列表
POST   /api/links                 - 创建链接
PUT    /api/links/:id             - 更新链接
DELETE /api/links/:id             - 删除链接
```

## 数据模型

### Channel (频道)
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

### EpgChannel (EPG 频道)
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

### M3uSource (M3U 源)
```javascript
{
  id: string,           // 唯一标识
  name: string,         // 源名称
  url: string,          // 源 URL
  enabled: boolean,     // 是否启用
  defaultPlayerType: string, // 默认播放器
  proxyMode: string,    // 代理模式
  updateInterval: number, // 更新间隔（分钟）
  timeout: number,      // 超时时间（毫秒）
  retryCount: number,   // 重试次数
  createdAt: string,    // 创建时间
  updatedAt: string     // 更新时间
}
```

### User (用户)
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

## 技术栈

### 前端
- **核心**: HTML5, CSS3, JavaScript (ES6+)
- **播放器**: 
  - Shaka Player (DASH/MPD)
  - ArtPlayer (HLS)
  - HLS.js (HLS)
  - mpegts.js (TS)
- **UI 框架**: 原生 JavaScript + Luna 主题
- **状态管理**: 自定义 Store 模式

### 后端
- **运行环境**: Node.js
- **Web 框架**: 原生 HTTP 模块
- **认证**: JWT + Redis
- **数据存储**: JSON 文件 / Redis
- **中间件**: 
  - 认证中间件
  - CORS 中间件
  - 错误处理中间件

### 部署
- **支持平台**: 
  - 本地部署
  - CloudStudio
  - 腾讯云 BAS
  - Cloudflare Workers
- **反向代理**: Nginx, Caddy
- **进程管理**: PM2, Supervisor

## 环境配置

### .env 文件配置
```bash
# 服务器配置
PORT=3000
HOST=localhost

# 认证配置
AUTH_ENABLED=false
AUTH_REDIS_HOST=localhost
AUTH_REDIS_PORT=6379
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# 数据目录
DATA_DIR=./data

# 代理配置
PROXY_ENABLED=true
PROXY_TIMEOUT=10000
```

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件配置
```

### 3. 启动服务
```bash
# 开发环境
node birdtv.js

# 生产环境（使用 PM2）
pm2 start birdtv.js --name birdtv
pm2 save
pm2 startup
```

### 4. 访问系统
- 前端播放器：http://localhost:3000
- 后台管理：http://localhost:3000/admin.html
- 移动端：http://localhost:3000/mobile.html

## 主要更新日志

### v3.3.0 (当前版本)
- ✅ 新增 EPG 管理功能，独立于节目源管理
- ✅ 新增频道分组管理，支持预设分组和自定义分组
- ✅ 新增批量操作功能（批量设置策略、分组、删除）
- ✅ 新增分组与 UA 管理页面，合并分组管理和 UA 管理
- ✅ 优化频道管理批量修改，支持分组和 UA 下拉选择
- ✅ 优化左侧栏菜单顺序
- ✅ 新增移动端 EPG 节目信息显示
- ✅ 优化代码结构，删除测试文件和缓存文件

## 开发规范

### 代码风格
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化
- 遵循 JavaScript ES6+ 规范

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

## 常见问题

详见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 部署指南

- 本地部署：详见 [README.md](./README.md)
- CloudStudio 部署：详见 [CLOUDSTUDIO_DEPLOY.md](./CLOUDSTUDIO_DEPLOY.md)
- 部署概览：详见 [DEPLOYMENT_OVERVIEW.md](./DEPLOYMENT_OVERVIEW.md)
- 移动端指南：详见 [MOBILE_GUIDE.md](./MOBILE_GUIDE.md)

## 许可证

本项目仅供学习交流使用。

## 联系方式

- 项目地址：https://github.com/your-repo/birdtv
- 问题反馈：请提交 Issue
