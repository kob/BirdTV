/**
 * 认证中间件 - Express 版
 *
 * 两种中间件：
 * 1. proxyAuthMiddleware - 用于 API 和代理路由，支持多种 token 来源
 *    (Authorization header, cookie, query, 16-char export token)
 * 2. apiAuthMiddleware - 简化版，仅支持 Authorization header
 */
const auth = require('../../backend/auth');
const tokenService = require('../../backend/services/tokenService');
const exportModel = require('../../backend/models/Export');

/**
 * 代理认证中间件 - 兼容 birdtv.js 的完整认证逻辑
 * 支持：JWT Bearer token, cookie authToken, query token/auth_token, 16-char export token
 */
function createProxyAuthMiddleware(storage) {
  return async function proxyAuthMiddleware(req, res, next) {
    if (!auth.isEnabled()) {
      req.user = { id: 'default', username: 'admin', role: 'admin' };
      return next();
    }

    // 特殊处理：/m3u-proxy 请求检查 m3uProxyAuth 设置
    const isProxyRequest = req.path && req.path.includes('/m3u-proxy');
    if (isProxyRequest) {
      try {
        if (storage) {
          const settings = await storage.getSettings();
          if (settings.m3uProxyAuth === false) {
            console.log('[Auth] /m3u-proxy m3uProxyAuth=false, skip auth');
            req.user = { id: 'default', username: 'admin', role: 'admin' };
            return next();
          }
        }
      } catch (error) {
        console.error('[Auth] 读取设置失败:', error);
      }
    }

    // 从多个位置获取 token
    let token = '';

    // 1. Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.replace('Bearer ', '');
    }

    // 2. Cookie（兼容 HLS.js、ArtPlayer 等播放器）
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').map(c => c.trim());
      for (const cookie of cookies) {
        if (cookie.startsWith('authToken=')) {
          token = cookie.substring('authToken='.length);
          break;
        }
      }
    }

    // 3. Query 参数（兼容导出 M3U、旧版客户端）
    if (!token && req.query) {
      token = req.query.token || req.query.auth_token || '';
    }

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: '未提供认证令牌',
      });
    }

    // 验证 token
    let isValid = false;
    let tokenPayload = null;
    let isExportToken = false;
    let isLinkToken = false;

    try {
      const decoded = tokenService.decodeToken(token);

      if (decoded.type === 'export') {
        tokenService.verifyToken(decoded);
        isValid = true;
        tokenPayload = decoded;
        isExportToken = true;
      } else if (decoded.linkId) {
        tokenService.verifyToken(decoded);
        isValid = true;
        tokenPayload = decoded;
        isLinkToken = true;
      } else {
        isValid = await auth.isTokenValidWithCleanup(token);
      }
    } catch (e) {
      // Token 解码失败，尝试 16-char export token
      if (/^[0-9a-f]{16}$/i.test(token)) {
        try {
          const allExports = exportModel.getAll();
          const exportRecord = allExports.find(e => e.exportToken === token);
          if (exportRecord && exportRecord.tokenExpiresAt) {
            const now = new Date();
            const expiresAt = new Date(exportRecord.tokenExpiresAt);
            if (now <= expiresAt) {
              isValid = true;
              isExportToken = true;
              tokenPayload = { type: 'export', exportId: exportRecord.id };
            }
          }
        } catch (err) {
          // ignore
        }
      }

      // JWT fallback
      if (!isValid) {
        isValid = await auth.isTokenValidWithCleanup(token);
      }
    }

    if (!isValid) {
      return res.status(401).json({
        ok: false,
        error: 'invalid_token',
        message: '无效或已过期的令牌',
      });
    }

    // 设置用户信息
    if ((isExportToken || isLinkToken) && tokenPayload) {
      req.user = {
        id: tokenPayload.userId || tokenPayload.linkId || 'admin',
        username: tokenPayload.userId || tokenPayload.shortCode || 'link',
        role: 'admin',
      };
    } else {
      req.user = await auth.getUserInfo(token);
    }

    next();
  };
}

/**
 * 简化版 API 认证中间件 - 仅支持 Authorization header
 */
async function apiAuthMiddleware(req, res, next) {
  if (!auth.isEnabled()) {
    req.user = { id: 'default', username: 'admin', role: 'admin' };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader
    ? authHeader.replace('Bearer ', '')
    : (req.query ? req.query.token : '');

  if (!token) {
    return res.status(401).json({ ok: false, error: '未提供认证令牌' });
  }

  const payload = auth.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ ok: false, error: '无效或已过期的认证令牌' });
  }

  const isValid = await auth.isTokenValidWithCleanup(token);
  if (!isValid) {
    return res.status(401).json({ ok: false, error: '认证令牌已失效' });
  }

  req.user = {
    id: payload.userId,
    username: payload.username,
    role: payload.role,
  };
  next();
}

/**
 * 管理员中间件
 */
function adminMiddleware(req, res, next) {
  if (!auth.isEnabled()) {
    req.user = { id: 'default', username: 'admin', role: 'admin' };
    return next();
  }

  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: '需要管理员权限' });
  }
  next();
}

module.exports = {
  createProxyAuthMiddleware,
  apiAuthMiddleware,
  adminMiddleware,
};
