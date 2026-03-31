const http = require('http');
const url = require('url');
const { URL } = require('url');
const auth = require('../auth');

// 导入中间件
const corsMiddleware = require('./middleware/cors');
const { errorMiddleware, notFoundMiddleware } = require('./middleware/error');
const authMiddleware = require('./middleware/auth');

// 导入服务
const StorageService = require('./services/storageService');

// 导入控制器
const AuthController = require('./controllers/authController');
const ChannelController = require('./controllers/channelController');
const SourceController = require('./controllers/sourceController');
const SettingsController = require('./controllers/settingsController');
const ExportController = require('./controllers/exportController');

// 导入路由
const createAuthRoutes = require('./routes/auth');
const createChannelsRoutes = require('./routes/channels');
const createSourcesRoutes = require('./routes/sources');
const createSettingsRoutes = require('./routes/settings');
const createExportsRoutes = require('./routes/exports');

// 统一端口配置
// 如果未指定 API_SERVER_PORT，则使用与主代理服务相同的端口
const DEFAULTS = {
  port: process.env.API_SERVER_PORT || process.env.M3U_PROXY_PORT || 8771,
  host: process.env.API_SERVER_HOST || process.env.M3U_PROXY_HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || './data'
};

// 解析请求体
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const contentType = req.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
          resolve(JSON.parse(body || '{}'));
        } else {
          resolve(body);
        }
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

// 创建路由
function createRouter(controllers) {
  const { authController, channelController, sourceController, settingsController, exportController } = controllers;

  const authRoutes = createAuthRoutes(authController);
  const channelsRoutes = createChannelsRoutes(channelController);
  const sourcesRoutes = createSourcesRoutes(sourceController);
  const settingsRoutes = createSettingsRoutes(settingsController);
  const exportsRoutes = createExportsRoutes(exportController);

  return function router(req, res) {
    const parsedUrl = url.parse(req.url, true);
    req.url = parsedUrl.pathname;
    req.query = parsedUrl.query;

    // 健康检查
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        service: 'birdtv-api',
        port: DEFAULTS.port,
        authEnabled: auth.isEnabled()
      }));
      return;
    }

    // 导出路由
    if (req.url.startsWith('/api/exports')) {
      exportsRoutes(req, res);
      return;
    }

    // 路由分发
    authRoutes(req, res, () => {
      channelsRoutes(req, res, () => {
        sourcesRoutes(req, res, () => {
          settingsRoutes(req, res, () => {
            // 404 处理
            notFoundMiddleware(req, res);
          });
        });
      });
    });
  };
}

// 初始化授权系统
async function initAuth() {
  if (process.env.AUTH_ENABLED === 'true') {
    await auth.initAuth({
      authEnabled: process.env.AUTH_ENABLED,
      jwtSecret: process.env.AUTH_JWT_SECRET,
      tokenExpireDays: process.env.AUTH_TOKEN_EXPIRE_DAYS,
      redisHost: process.env.AUTH_REDIS_HOST,
      redisPort: process.env.AUTH_REDIS_PORT,
      redisPassword: process.env.AUTH_REDIS_PASSWORD,
      redisDb: process.env.AUTH_REDIS_DB
    });
    console.log('[API Server] 授权系统已启用');
  } else {
    console.log('[API Server] 授权系统已禁用');
  }
}

// 启动服务器
async function startServer() {
  console.log('[API Server] 正在启动...');

  // 初始化授权系统
  await initAuth();

  // 初始化存储服务
  const storage = new StorageService(DEFAULTS.dataDir);
  await storage.init();

  // 创建控制器
  const authController = new AuthController(storage);
  const channelController = new ChannelController(storage);
  const sourceController = new SourceController(storage);
  const settingsController = new SettingsController(storage);
  const exportController = new ExportController(storage);

  const controllers = {
    authController,
    channelController,
    sourceController,
    settingsController,
    exportController
  };



  // 创建路由
  const router = createRouter(controllers);

  // 创建 HTTP 服务器
  const server = http.createServer(async (req, res) => {
    // 解析请求体
    req.body = await parseRequestBody(req).catch(() => ({}));

    // 中间件链
    corsMiddleware(req, res, () => {
      router(req, res, (err) => {
        if (err) {
          errorMiddleware(err, req, res, () => {});
        }
      });
    });
  });

  // 启动监听
  server.listen(DEFAULTS.port, DEFAULTS.host, () => {
    console.log('='.repeat(60));
    console.log('[API Server] 服务器已启动');
    console.log('='.repeat(60));
    console.log(`监听地址: http://${DEFAULTS.host}:${DEFAULTS.port}`);
    console.log(`授权状态: ${auth.isEnabled() ? '✓ 已启用' : '✗ 已禁用'}`);
    console.log(`数据目录: ${DEFAULTS.dataDir}`);
    console.log('');
    console.log('可用的 API 端点:');
    console.log('─'.repeat(60));
    console.log('授权管理:');
    console.log('  POST   /api/auth/login             - 用户登录');
    console.log('  POST   /api/auth/logout            - 用户登出');
    console.log('  GET    /api/auth/userinfo          - 获取用户信息');
    console.log('  PUT    /api/auth/password          - 修改密码');
    console.log('  GET    /api/auth/users             - 获取用户列表 (管理员)');
    console.log('  POST   /api/auth/users             - 创建用户 (管理员)');
    console.log('  PUT    /api/auth/users/:id         - 更新用户 (管理员)');
    console.log('  DELETE /api/auth/users/:id         - 删除用户 (管理员)');
    console.log('');
    console.log('频道管理:');
    console.log('  GET    /api/channels               - 获取频道列表');
    console.log('  GET    /api/channels/search        - 搜索频道');
    console.log('  POST   /api/channels               - 创建频道');
    console.log('  GET    /api/channels/:id           - 获取频道详情');
    console.log('  PUT    /api/channels/:id           - 更新频道');
    console.log('  DELETE /api/channels/:id           - 删除频道');
    console.log('  POST   /api/channels/batch         - 批量导入频道');
    console.log('');
    console.log('源配置管理:');
    console.log('  GET    /api/sources/m3u            - 获取 M3U 源列表');
    console.log('  POST   /api/sources/m3u            - 创建 M3U 源');
    console.log('  PUT    /api/sources/m3u/:id        - 更新 M3U 源');
    console.log('  DELETE /api/sources/m3u/:id        - 删除 M3U 源');
    console.log('  POST   /api/sources/m3u/:id/test    - 测试 M3U 源');
    console.log('  GET    /api/sources/epg            - 获取 EPG 源列表');
    console.log('  POST   /api/sources/epg            - 创建 EPG 源');
    console.log('  PUT    /api/sources/epg/:id        - 更新 EPG 源');
    console.log('  DELETE /api/sources/epg/:id        - 删除 EPG 源');
    console.log('');
    console.log('导出管理:');
    console.log('  POST   /api/exports/export         - 批量导出频道');
    console.log('  GET    /api/exports/download       - 下载导出文件');
    console.log('  GET    /api/exports/list           - 列出导出记录');
    console.log('  DELETE /api/exports/:id            - 删除导出记录');
    console.log('  POST   /api/exports/cleanup        - 清理过期导出');
    console.log('');
    console.log('全局设置:');
    console.log('  GET    /api/settings               - 获取设置');
    console.log('  PUT    /api/settings               - 更新设置');
    console.log('  GET    /api/settings/categories    - 获取设置分类');
    console.log('  GET    /health                    - 健康检查');
    console.log('─'.repeat(60));
    console.log('='.repeat(60));
  });

  // 错误处理
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[API Server] 端口 ${DEFAULTS.port} 已被占用，请检查是否有其他服务在使用该端口`);
      process.exit(1);
    } else {
      console.error('[API Server] 服务器错误:', error);
      process.exit(1);
    }
  });

  // 优雅关闭
  process.on('SIGTERM', () => {
    console.log('[API Server] 收到 SIGTERM 信号，正在关闭...');
    server.close(() => {
      console.log('[API Server] 服务器已关闭');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[API Server] 收到 SIGINT 信号，正在关闭...');
    server.close(() => {
      console.log('[API Server] 服务器已关闭');
      process.exit(0);
    });
  });

  return server;
}

// 启动
if (require.main === module) {
  startServer().catch(error => {
    console.error('[API Server] 启动失败:', error);
    process.exit(1);
  });
}

module.exports = { startServer };
