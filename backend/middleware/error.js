/**
 * 错误处理中间件
 */
function errorMiddleware(err, req, res, next) {
  const context = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers?.['user-agent'] || 'unknown'
  };
  console.error('[Error]', JSON.stringify(context, null, 2));

  const statusCode = err.statusCode || 500;
  const message = err.message || '内部服务器错误';

  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: false,
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  }));
}

/**
 * 404 处理
 */
function notFoundMiddleware(req, res) {
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: false,
    error: `未找到路径: ${req.method} ${req.url}`
  }));
}

/**
 * 异步错误包装器
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorMiddleware,
  notFoundMiddleware,
  asyncHandler
};
