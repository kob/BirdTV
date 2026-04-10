const auth = require('../auth');

/**
 * 授权中间件
 * 验证 JWT Token
 */
async function authMiddleware(req, res, next) {
  // 检查授权是否启用
  if (!auth.isEnabled()) {
    req.user = { id: 'default', username: 'admin', role: 'admin' };
    next();
    return;
  }

  // 获取 token
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace('Bearer ', '') : (req.query ? req.query.token : '');

  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '未提供认证令牌' }));
    return;
  }

  // 验证 token 签名和过期时间
  const payload = auth.verifyToken(token);
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '无效或已过期的认证令牌' }));
    return;
  }

  // 验证 token 是否在存储中存在（支持登出后 token 失效）
  const isValid = await auth.isTokenValidWithCleanup(token);
  if (!isValid) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '认证令牌已失效' }));
    return;
  }

  // 将用户信息附加到请求对象
  req.user = {
    id: payload.userId,
    username: payload.username,
    role: payload.role
  };
  next();
}

/**
 * 管理员中间件
 * 检查用户是否为管理员
 */
function adminMiddleware(req, res, next) {
  if (!auth.isEnabled()) {
    req.user = { id: 'default', username: 'admin', role: 'admin' };
    next();
    return;
  }

  if (!req.user || req.user.role !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '需要管理员权限' }));
    return;
  }

  next();
}

/**
 * 可选授权中间件
 * 如果提供了 token 则验证，否则继续
 */
async function optionalAuthMiddleware(req, res, next) {
  if (!auth.isEnabled()) {
    req.user = { id: 'default', username: 'admin', role: 'admin' };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.replace('Bearer ', '') : (req.query ? req.query.token : '');

  if (token) {
    const payload = auth.verifyToken(token);
    if (payload) {
      const isValid = await auth.isTokenValidWithCleanup(token);
      if (isValid) {
        req.user = {
          id: payload.userId,
          username: payload.username,
          role: payload.role
        };
      }
    }
  }

  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  optionalAuthMiddleware
};
