/**
 * CORS 中间件
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // 允许的源
  const allowedOrigins = process.env.API_CORS_ORIGIN ?
    process.env.API_CORS_ORIGIN.split(',') :
    ['*'];

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  next();
}

module.exports = corsMiddleware;
