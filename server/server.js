/**
 * BirdTV 后端 API 服务器 - 前后端分离版本
 * 基于 Express，纯 API + M3U 代理，不再 serve 静态文件
 *
 * 核心策略：
 * - 复用 birdtv.js 的代理核心函数（proxyRequestToRemote 等），避免重写
 * - 复用 backend/ 下所有 controller/service/model，通过兼容中间件桥接
 * - Express Router 替代 birdtv.js 内联的 API 路由分发
 */

// 加载 .env 环境变量（必须在最前面）
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// 自动注入 NODE_PATH，让 backend/ 下的 require 能找到 server/node_modules 中的模块
if (!process.env.NODE_PATH) {
  const path = require('path');
  process.env.NODE_PATH = path.resolve(__dirname, 'node_modules');
  require('module')._initPaths();
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

// 引入授权模块
const auth = require('../backend/auth');
const tokenService = require('../backend/services/tokenService');

// 导入存储服务
const StorageService = require('../backend/services/storageService');

// 导入控制器
const AuthController = require('../backend/controllers/authController');
const ChannelController = require('../backend/controllers/channelController');
const SourceController = require('../backend/controllers/sourceController');
const SettingsController = require('../backend/controllers/settingsController');
const ExportController = require('../backend/controllers/exportController');
const { SchedulerService } = require('../backend/services/schedulerService');

// 导入 Express 风格路由
const { createAuthRouter } = require('./routes/auth');
const { createChannelsRouter } = require('./routes/channels');
const { createSourcesRouter } = require('./routes/sources');
const { createSettingsRouter } = require('./routes/settings');
const { createExportsRouter } = require('./routes/exports');
const { createEpgRouter } = require('./routes/epg');
const { createSchedulerRouter } = require('./routes/scheduler');

// 导入代理路由（复用 birdtv.js 核心代理逻辑）
const { createProxyRouter } = require('./routes/proxy');

// 导入中间件
const { createProxyAuthMiddleware } = require('./middleware/auth');

const app = express();

// ==================== 配置 ====================

const config = {
  port: parseInt(process.env.BIRDTV_PORT || '8771', 10),
  host: process.env.BIRDTV_HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || path.resolve(__dirname, '../data'),
  cacheRoot: process.env.CACHE_ROOT || path.resolve(__dirname, '../files/cache'),
  staticRoot: path.resolve(__dirname, '../web'),
  cloudflareWorkerUrl: process.env.CLOUDFLARE_WORKER_URL || '',
  defaultUserAgent: process.env.M3U_PROXY_DEFAULT_UA || 'okhttp/4.3',
  requestTimeoutMs: parseInt(process.env.M3U_PROXY_TIMEOUT_MS || '40000', 10),
  redirectLimit: parseInt(process.env.M3U_PROXY_REDIRECT_LIMIT || '3', 10),
  m3uRemoteBaseUrl: process.env.M3U_REMOTE_BASE_URL || '',
  // CORS 允许的前端源
  corsOrigins: process.env.API_CORS_ORIGIN
    ? process.env.API_CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://localhost:8771'],
};

// ==================== 全局中间件 ====================

// CORS - 前后端分离必须
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    // 开发阶段全部放行，生产环境应限制
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With'],
}));

// 请求日志
app.use(morgan('dev'));

// JSON 解析（限制 10MB，支持大批量频道导入）
app.use(express.json({ limit: '10mb' }));

// URL-encoded 解析
app.use(express.urlencoded({ extended: true }));

// 健康检查（无需认证）
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'birdtv-api',
    port: config.port,
    authEnabled: auth.isEnabled(),
    mode: 'separated',
  });
});

// ==================== 初始化 ====================

async function initialize() {
  console.log('='.repeat(60));
  console.log('BirdTV API Server (前后端分离版)');
  console.log('='.repeat(60));

  // 初始化授权系统
  await auth.initAuth({
    authEnabled: process.env.AUTH_ENABLED,
    jwtSecret: process.env.AUTH_JWT_SECRET,
    tokenExpireDays: process.env.AUTH_TOKEN_EXPIRE_DAYS,
    redisHost: process.env.AUTH_REDIS_HOST,
    redisPort: process.env.AUTH_REDIS_PORT,
    redisPassword: process.env.AUTH_REDIS_PASSWORD,
    redisDb: process.env.AUTH_REDIS_DB,
    dataDir: config.dataDir,
    defaultAdmin: process.env.AUTH_DEFAULT_ADMIN || 'admin',
    defaultPassword: process.env.AUTH_DEFAULT_PASSWORD || 'admin123',
    forceResetAdmin: process.env.AUTH_FORCE_RESET_ADMIN === 'true',
    systemId: process.env.BIRDTV_SYSTEM_ID || '',
  });

  // 初始化存储服务
  const storage = new StorageService(config.dataDir, {
    host: process.env.AUTH_REDIS_HOST,
    port: parseInt(process.env.AUTH_REDIS_PORT || '6666', 10),
    password: process.env.AUTH_REDIS_PASSWORD,
    db: parseInt(process.env.AUTH_REDIS_DB || '0', 10),
    prefix: process.env.REDIS_DATA_PREFIX || 'birdtv:storage:',
    systemId: process.env.BIRDTV_SYSTEM_ID || '',
  });
  await storage.init();

  // 创建控制器
  const authController = new AuthController(storage);
  const channelController = new ChannelController(storage);
  const sourceController = new SourceController(storage);
  const settingsController = new SettingsController(storage);
  const exportController = new ExportController(storage);

  // 启动定时任务
  const scheduler = new SchedulerService(storage, sourceController, exportController);
  await scheduler.start();

  // birdtv.js 代理核心（复用其 proxyRequestToRemote 等函数）
  const birdtv = require('../birdtv');

  // 构建代理认证中间件
  const proxyAuthMiddleware = createProxyAuthMiddleware(storage);

  // ==================== 注册路由 ====================

  // 公开路由（无需认证）- 登录接口
  app.use('/api/auth', createAuthRouter(authController));

  // 需要认证的 API 路由
  app.use('/api/channels', proxyAuthMiddleware, createChannelsRouter(channelController));
  app.use('/api/sources', proxyAuthMiddleware, createSourcesRouter(sourceController));
  app.use('/api/settings', proxyAuthMiddleware, createSettingsRouter(settingsController));
  app.use('/api/exports', proxyAuthMiddleware, createExportsRouter(exportController));
  app.use('/api/epg', proxyAuthMiddleware, createEpgRouter(storage));
  app.use('/api/scheduler', proxyAuthMiddleware, createSchedulerRouter(scheduler));

  // M3U 代理（需要代理认证 - 支持 cookie/query token）
  app.use('/', proxyAuthMiddleware, createProxyRouter(config, storage, birdtv));

  // 短链接（无需认证，用于分享的导出链接）
  app.get('/link/:shortCode', async (req, res) => {
    req.ip = req.ip || req.connection.remoteAddress;
    await exportController.downloadByShortCode(req, res);
  });

  // ==================== SPA 回退（生产环境前端由后端 serve 时使用） ====================
  if (process.env.SERVE_STATIC === 'true') {
    const staticPath = path.resolve(__dirname, '../web-vue/dist');
    app.use(express.static(staticPath));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api/') && !req.path.startsWith('/m3u-proxy') && !req.path.startsWith('/tv-iill')) {
        res.sendFile(path.join(staticPath, 'index.html'));
      }
    });
    console.log(`[Static] 前端静态文件: ${staticPath}`);
  }

  // ==================== 错误处理（必须在所有路由之后注册） ====================

  app.use((err, req, res, _next) => {
    console.error('[Error]', err.message || err);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Internal Server Error',
    });
  });

  // 404（必须在所有路由之后）
  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'Not Found' });
  });

  return { storage, scheduler };
}

// ==================== 启动 ====================

initialize()
  .then(({ scheduler }) => {
    app.listen(config.port, config.host, () => {
      console.log('服务器已启动');
      console.log(`监听地址: http://${config.host}:${config.port}`);
      console.log(`授权状态: ${auth.isEnabled() ? '✓ 已启用' : '✗ 已禁用'}`);
      console.log(`数据目录: ${config.dataDir}`);
      console.log(`CORS 允许: ${config.corsOrigins.join(', ')}`);
      console.log('');
      console.log('API 端点:');
      console.log('─'.repeat(60));
      console.log(`  健康检查: GET  /health`);
      console.log(`  认证管理: /api/auth/*`);
      console.log(`  频道管理: /api/channels/*`);
      console.log(`  源管理:   /api/sources/*`);
      console.log(`  设置管理: /api/settings/*`);
      console.log(`  导出管理: /api/exports/*`);
      console.log(`  EPG 管理: /api/epg/*`);
      console.log(`  定时任务: /api/scheduler/*`);
      console.log(`  M3U 代理: /m3u-proxy, /tv-iill`);
      console.log(`  短链接:   /link/:shortCode`);
      console.log('─'.repeat(60));
      console.log('='.repeat(60));
    });
  })
  .catch((err) => {
    console.error('启动失败:', err);
    process.exit(1);
  });
