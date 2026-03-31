/**
 * M3U Proxy with API Server
 * 整合 M3U 代理和完整 API 服务到单一端口
 * 支持：代理、认证、频道管理、源管理、设置管理
 */

// 加载 .env 环境变量（必须在最前面）
require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { URL } = require('url');
const { execSync, spawn, spawnSync } = require('child_process');

// 引入授权模块
const auth = require('./auth');

// 导入存储服务
const StorageService = require('./backend/services/storageService');

// 导入控制器
const AuthController = require('./backend/controllers/authController');
const ChannelController = require('./backend/controllers/channelController');
const SourceController = require('./backend/controllers/sourceController');
const SettingsController = require('./backend/controllers/settingsController');
const ExportController = require('./backend/controllers/exportController');

let HttpsProxyAgent = null;
try {
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch {}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.m3u': 'audio/x-mpegurl; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl; charset=utf-8',
  '.mpd': 'application/dash+xml; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.m4s': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt'
};

const DEFAULTS = {
  port: 8771,
  host: '0.0.0.0',
  requestTimeoutMs: 40000,
  redirectLimit: 3,
  staticRoot: path.resolve(__dirname, 'web'),
  cacheRoot: path.resolve(__dirname, 'files', 'cache'),
  cacheM3uTtlMs: 10 * 60 * 1000,
  cacheEpgTtlMs: 30 * 60 * 1000,
  m3uRemoteBaseUrl: 'http://192.168.200.6:8881',
  defaultUserAgent: 'okhttp/4.3',
  dataDir: path.resolve(__dirname, 'data')
};

const serverState = {
  server: null,
  config: null,
  memoryCache: new Map(),
  storage: null,
  controllers: null
};

// ==================== 工具函数 ====================

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseAllowedHosts(raw) {
  // 如果 raw 已经是 Set，直接返回
  if (raw instanceof Set) {
    return raw;
  }

  // 如果 raw 是字符串，解析它
  if (!raw || !String(raw).trim()) {
    return new Set();
  }
  return new Set(
    String(raw)
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getConfig(overrides = {}) {
  const env = process.env;
  return {
    port: parseNumber(overrides.port || env.BIRDTV_PORT || env.M3U_PROXY_PORT, DEFAULTS.port),
    host: String(overrides.host || env.BIRDTV_HOST || env.M3U_PROXY_HOST || DEFAULTS.host),
    requestTimeoutMs: parseNumber(overrides.requestTimeoutMs || env.BIRDTV_TIMEOUT_MS || env.M3U_PROXY_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
    redirectLimit: parseNumber(overrides.redirectLimit || env.BIRDTV_REDIRECT_LIMIT || env.M3U_PROXY_REDIRECT_LIMIT, DEFAULTS.redirectLimit),
    staticRoot: path.resolve(overrides.staticRoot || env.BIRDTV_STATIC_ROOT || env.M3U_PROXY_STATIC_ROOT || DEFAULTS.staticRoot),
    cacheRoot: path.resolve(overrides.cacheRoot || env.BIRDTV_CACHE_ROOT || env.M3U_PROXY_CACHE_ROOT || DEFAULTS.cacheRoot),
    cacheM3uTtlMs: parseNumber(overrides.cacheM3uTtlMs || env.BIRDTV_CACHE_M3U_TTL_MS || env.M3U_PROXY_CACHE_M3U_TTL_MS, DEFAULTS.cacheM3uTtlMs),
    cacheEpgTtlMs: parseNumber(overrides.cacheEpgTtlMs || env.BIRDTV_CACHE_EPG_TTL_MS || env.M3U_PROXY_CACHE_EPG_TTL_MS, DEFAULTS.cacheEpgTtlMs),
    m3uRemoteBaseUrl: String(overrides.m3uRemoteBaseUrl || env.BIRDTV_REMOTE_BASE_URL || env.M3U_REMOTE_BASE_URL || DEFAULTS.m3uRemoteBaseUrl),
    allowedHosts: parseAllowedHosts(overrides.allowedHosts || env.BIRDTV_ALLOWED_HOSTS || env.M3U_PROXY_ALLOWED_HOSTS || ''),
    defaultUserAgent: String(overrides.defaultUserAgent || env.BIRDTV_DEFAULT_UA || env.M3U_PROXY_DEFAULT_UA || DEFAULTS.defaultUserAgent),
    dataDir: path.resolve(overrides.dataDir || env.BIRDTV_DATA_DIR || env.M3U_PROXY_DATA_DIR || DEFAULTS.dataDir),
    // 授权配置
    authEnabled: String(overrides.authEnabled || env.AUTH_ENABLED || 'true'),
    jwtSecret: String(overrides.jwtSecret || env.AUTH_JWT_SECRET || 'default-secret'),
    tokenExpireDays: parseNumber(overrides.tokenExpireDays || env.AUTH_TOKEN_EXPIRE_DAYS, 7),
    redisHost: String(overrides.redisHost || env.AUTH_REDIS_HOST || 'localhost'),
    redisPort: String(overrides.redisPort || env.AUTH_REDIS_PORT || '6379'),
    redisPassword: String(overrides.redisPassword || env.AUTH_REDIS_PASSWORD || ''),
    redisDb: String(overrides.redisDb || env.AUTH_REDIS_DB || '0'),
    defaultAdmin: String(overrides.defaultAdmin || env.AUTH_DEFAULT_ADMIN || 'admin'),
    defaultPassword: String(overrides.defaultPassword || env.AUTH_DEFAULT_PASSWORD || 'admin123')
  };
}

function log(level, message, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: 'm3u-proxy-api',
    message,
    ...meta
  };
  const text = JSON.stringify(payload);
  if (level === 'error') {
    console.error(text);
  } else if (level === 'warn') {
    console.warn(text);
  } else {
    console.log(text);
  }
}

// ==================== 系统代理检测 ====================

function detectSystemProxy() {
  const envProxy = (process.env.BIRDTV_UPSTREAM_PROXY || process.env.M3U_UPSTREAM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  if (envProxy) return envProxy;

  if (process.platform === 'win32') {
    try {
      const enableOut = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      );
      const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(enableOut);
      if (!enabled) return '';

      const serverOut = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      );
      const m = /ProxyServer\s+REG_SZ\s+(.+)/i.exec(serverOut);
      if (!m) return '';

      let value = String(m[1] || '').trim();
      if (value.includes('=')) {
        const part = value
          .split(';')
          .map((item) => item.split('='))
          .find((entry) => entry[0] && entry[0].trim() === 'http');
        if (part && part[1]) {
          value = part[1].trim();
        }
      }
      if (value && !/^https?:\/\//i.test(value)) {
        value = `http://${value}`;
      }
      return value;
    } catch {
      return '';
    }
  }

  if (process.platform === 'darwin') {
    try {
      const output = execSync('networksetup -getwebproxy Wi-Fi', { encoding: 'utf8', timeout: 3000 });
      const enabled = /Enabled:\s*Yes/i.test(output);
      if (!enabled) return '';
      const host = /Server:\s*(.+)/i.exec(output);
      const port = /Port:\s*(\d+)/i.exec(output);
      if (!host || !port) return '';
      return `http://${host[1].trim()}:${port[1].trim()}`;
    } catch {
      return '';
    }
  }

  return '';
}

// ==================== HTTP Agent 配置 ====================

const directHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 });
const directHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 });
const upstreamProxyUrl = detectSystemProxy();
let upstreamHttpsAgent = null;
if (upstreamProxyUrl && HttpsProxyAgent) {
  try {
    upstreamHttpsAgent = new HttpsProxyAgent(upstreamProxyUrl);
    log('info', 'upstream proxy enabled', { proxy: upstreamProxyUrl });
  } catch (error) {
    log('warn', 'failed to init upstream proxy agent', { error: String(error && error.message ? error.message : error) });
  }
}

function getAgent(urlParsed, useProxy) {
  if (useProxy && upstreamHttpsAgent && urlParsed.protocol === 'https:') {
    return upstreamHttpsAgent;
  }
  return urlParsed.protocol === 'https:' ? directHttpsAgent : directHttpAgent;
}

function isNetworkRetryableError(err) {
  const code = String((err && err.code) || '');
  return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code);
}

function isTlsCertError(err) {
  const code = String((err && err.code) || '');
  return [
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'CERT_HAS_EXPIRED'
  ].includes(code);
}

// ==================== M3U 代理功能 ====================

function normalizeRemoteUrl(input, pathname, searchParams) {
  if (pathname === '/tv-iill' || pathname.startsWith('/tv-iill/')) {
    const rawTail = pathname === '/tv-iill' ? '/' : pathname.slice('/tv-iill'.length);
    const tail = rawTail.startsWith('/') ? rawTail : `/${rawTail}`;
    const passthrough = new URLSearchParams(searchParams);
    ['ua', 'user-agent', 'redirect-check', 'check-redirect', 'max-redirects'].forEach((key) => passthrough.delete(key));
    const query = passthrough.toString();
    return `https://tv.iill.top${tail}${query ? `?${query}` : ''}`;
  }
  return String(input || '').trim();
}

function isUrlAllowed(urlValue, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, reason: 'protocol_not_supported' };
  }

  // 调试日志
  console.log('[isUrlAllowed] allowedHosts type:', allowedHosts.constructor.name);
  console.log('[isUrlAllowed] allowedHosts.size:', allowedHosts.size);
  console.log('[isUrlAllowed] allowedHosts:', Array.from(allowedHosts));

  if (!allowedHosts || allowedHosts.size === 0) {
    return { ok: true };
  }

  const host = String(parsed.hostname || '').toLowerCase();
  for (const allowed of allowedHosts) {
    if (host === allowed || host.endsWith(`.${allowed}`)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'host_not_allowed' };
}

function getCacheTtlMs(urlValue, config) {
  const lower = String(urlValue || '').toLowerCase();
  if (lower.includes('.xml') || lower.includes('epg')) {
    return config.cacheEpgTtlMs;
  }
  if (lower.includes('.m3u') || lower.includes('.m3u8')) {
    return config.cacheM3uTtlMs;
  }
  return 0;
}

function isLiveLikeStreamUrl(urlValue) {
  const lower = String(urlValue || '').toLowerCase();
  return (
    lower.includes('/udp/') ||
    lower.includes('/rtp/') ||
    /239\.\d+\.\d+\.\d+/.test(lower) ||
    lower.includes('.ts?') ||
    lower.endsWith('.ts')
  );
}

function makeCacheKey(urlValue, userAgent) {
  return crypto.createHash('sha1').update(`${urlValue}|${userAgent || ''}`).digest('hex');
}

function getCacheFilePath(config, key) {
  return path.join(config.cacheRoot, `${key}.json`);
}

async function ensureCacheRoot(config) {
  await fsp.mkdir(config.cacheRoot, { recursive: true });
}

function isTextLike(headers) {
  const contentType = String((headers && (headers['content-type'] || headers['Content-Type'])) || '').toLowerCase();
  return (
    contentType.includes('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('mpegurl') ||
    contentType.includes('javascript')
  );
}

function shouldRewriteM3u(payload, remoteUrl) {
  const contentType = String((payload.headers && (payload.headers['content-type'] || payload.headers['Content-Type'])) || '').toLowerCase();
  if (contentType.includes('mpegurl') || contentType.includes('application/x-mpegurl')) {
    return true;
  }
  const finalLower = String(payload.finalUrl || '').toLowerCase();
  const remoteLower = String(remoteUrl || '').toLowerCase();
  return finalLower.includes('.m3u8') || finalLower.includes('.m3u') || remoteLower.includes('.m3u8') || remoteLower.includes('.m3u');
}

function buildLocalProxyUrl(targetUrl, userAgent) {
  let out = `/m3u-proxy?url=${encodeURIComponent(targetUrl)}`;
  if (userAgent) {
    out += `&ua=${encodeURIComponent(String(userAgent))}`;
  }
  return out;
}

function toAbsoluteUrl(raw, baseUrl) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(?:data|urn|skd|blob):/i.test(value)) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function rewriteM3uText(inputText, baseUrl, userAgent) {
  const lines = String(inputText || '').split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          const abs = toAbsoluteUrl(uri, baseUrl);
          if (!/^https?:/i.test(abs)) return match;
          return `URI="${buildLocalProxyUrl(abs, userAgent)}"`;
        });
      }

      const abs = toAbsoluteUrl(trimmed, baseUrl);
      if (!/^https?:/i.test(abs)) return line;
      return buildLocalProxyUrl(abs, userAgent);
    })
    .join('\n');
}

async function readCache(config, key) {
  const now = Date.now();
  const memory = serverState.memoryCache.get(key);
  if (memory && memory.expiresAt > now) {
    return memory;
  }

  const fp = getCacheFilePath(config, key);
  try {
    const raw = await fsp.readFile(fp, 'utf8');
    const payload = JSON.parse(raw);
    if (!payload || payload.expiresAt <= now) {
      return null;
    }
    payload.body = Buffer.from(payload.bodyBase64 || '', 'base64');
    serverState.memoryCache.set(key, payload);
    return payload;
  } catch {
    return null;
  }
}

async function writeCache(config, key, item) {
  try {
    await ensureCacheRoot(config);
    serverState.memoryCache.set(key, item);
    const out = {
      ...item,
      bodyBase64: Buffer.isBuffer(item.body) ? item.body.toString('base64') : ''
    };
    delete out.body;
    await fsp.writeFile(getCacheFilePath(config, key), JSON.stringify(out), 'utf8');
  } catch (error) {
    log('warn', 'write cache failed', { error: String(error && error.message ? error.message : error) });
  }
}

function requestRemotePayload(remoteUrl, { userAgent = null, method = 'GET', maxRedirects = 3, config } = {}) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const headers = {
      Accept: '*/*',
      'User-Agent': String(userAgent || config.defaultUserAgent || DEFAULTS.defaultUserAgent),
      'Accept-Encoding': 'identity'
    };

    function shouldHeadFallbackToGet(statusCode) {
      return normalizedMethod === 'HEAD' && (statusCode < 200 || statusCode >= 400);
    }

    const run = (
      target,
      insecureTls = false,
      family = 0,
      useProxy = !!upstreamHttpsAgent,
      forceGetForHeadFallback = false
    ) => {
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        reject(new Error('Invalid URL'));
        return;
      }

      const lib = parsed.protocol === 'https:' ? https : http;
      const reqOptions = {
        method: forceGetForHeadFallback ? 'GET' : normalizedMethod,
        headers: forceGetForHeadFallback ? { ...headers, Range: 'bytes=0-0' } : headers,
        agent: getAgent(parsed, useProxy),
        timeout: config.requestTimeoutMs
      };

      if (family === 4 || family === 6) {
        reqOptions.family = family;
      }
      if (parsed.protocol === 'https:') {
        reqOptions.rejectUnauthorized = !insecureTls;
      }

      const req = lib.request(parsed, reqOptions, (resp) => {
        const code = resp.statusCode || 0;
        if (code >= 300 && code < 400 && resp.headers.location && redirectCount < maxRedirects) {
          redirectCount += 1;
          let nextUrl = resp.headers.location;
          if (nextUrl.startsWith('//')) {
            nextUrl = `${parsed.protocol}${nextUrl}`;
          } else if (!/^https?:/i.test(nextUrl)) {
            nextUrl = new URL(nextUrl, parsed).href;
          }
          resp.resume();
          run(nextUrl, insecureTls, family, useProxy, forceGetForHeadFallback);
          return;
        }

        if (normalizedMethod === 'HEAD' && !forceGetForHeadFallback && shouldHeadFallbackToGet(code)) {
          resp.resume();
          run(target, insecureTls, family, useProxy, true);
          return;
        }

        if (normalizedMethod === 'HEAD') {
          resp.resume();
          resolve({
            statusCode: code,
            headers: resp.headers,
            body: Buffer.alloc(0),
            finalUrl: parsed.href,
            redirected: redirectCount > 0,
            redirectCount
          });
          return;
        }

        const chunks = [];
        resp.on('data', (chunk) => chunks.push(chunk));
        resp.on('end', () => {
          resolve({
            statusCode: code,
            headers: resp.headers,
            body: Buffer.concat(chunks),
            finalUrl: parsed.href,
            redirected: redirectCount > 0,
            redirectCount
          });
        });
      });

      req.on('timeout', () => {
        const err = new Error('Timeout');
        err.code = 'ETIMEDOUT';
        req.destroy(err);
      });

      req.on('error', (err) => {
        if (!insecureTls && isTlsCertError(err) && /^https:/i.test(target)) {
          run(target, true, family, useProxy);
          return;
        }

        if (isNetworkRetryableError(err)) {
          if (useProxy) {
            run(target, insecureTls, family, false);
            return;
          }
          if (!useProxy && upstreamHttpsAgent) {
            run(target, insecureTls, family, true);
            return;
          }
          if (!family) {
            run(target, insecureTls, 4, useProxy);
            return;
          }
        }

        reject(err);
      });

      req.end();
    };

    run(remoteUrl);
  });
}

function sendCachedResponse(res, cached) {
  const finalUrl = String(cached.finalUrl || '');
  const redirected = !!(cached.redirectCount && Number(cached.redirectCount) > 0);
  const headers = {
    ...cached.headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Final-Url, X-Redirected, X-Redirect-Count, X-Cache',
    'X-Cache': 'HIT',
    'X-Final-Url': finalUrl,
    'X-Redirected': redirected ? 'true' : 'false',
    'X-Redirect-Count': String(Number(cached.redirectCount || 0))
  };
  res.writeHead(cached.statusCode, headers);
  res.end(cached.body);
}

async function maybeServeFromCache(remoteUrl, req, res, options) {
  const { config, userAgent } = options;
  if ((req.method || 'GET').toUpperCase() !== 'GET') return false;
  if (req.headers.range) return false;

  const ttl = getCacheTtlMs(remoteUrl, config);
  if (!ttl) return false;

  const key = makeCacheKey(remoteUrl, userAgent);
  const cached = await readCache(config, key);
  if (!cached) return false;

  sendCachedResponse(res, cached);
  return true;
}

async function maybeStoreCache(remoteUrl, options, payload) {
  const { config, userAgent, method } = options;
  if (String(method || 'GET').toUpperCase() !== 'GET') return;

  const ttl = getCacheTtlMs(remoteUrl, config);
  if (!ttl) return;
  if (!isTextLike(payload.headers)) return;

  const key = makeCacheKey(remoteUrl, userAgent);
  await writeCache(config, key, {
    statusCode: payload.statusCode,
    headers: payload.headers,
    body: payload.body,
    expiresAt: Date.now() + ttl,
    finalUrl: payload.finalUrl,
    redirectCount: payload.redirectCount
  });
}

function streamProxyToRemote(remoteUrl, clientReq, clientRes, options = {}) {
  const config = options.config || serverState.config || getConfig();
  const userAgent = options.userAgent || null;
  const method = String(options.method || clientReq.method || 'GET').toUpperCase();
  const requestHeaders = {
    Accept: '*/*',
    'User-Agent': String(userAgent || config.defaultUserAgent || DEFAULTS.defaultUserAgent),
    'Accept-Encoding': 'identity',
    Connection: 'keep-alive'
  };

  // 尝试函数，支持 HTTPS 回退
  const tryStream = (targetUrl, fallbackUrl = null, attemptedHttps = false) => {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch {
        reject(new Error('Invalid URL'));
        return;
      }

      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        parsed,
        {
          method,
          headers: requestHeaders,
          timeout: config.requestTimeoutMs,
          agent: getAgent(parsed, true)
        },
        (resp) => {
          const headers = {
            ...resp.headers,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-Final-Url, X-Redirected, X-Redirect-Count, X-Cache',
            'X-Cache': 'MISS',
            'X-Final-Url': parsed.href,
            'X-Redirected': 'false',
            'X-Redirect-Count': '0',
            'Cache-Control': 'no-store'
          };
          clientRes.writeHead(resp.statusCode || 200, headers);
          resp.pipe(clientRes);
          resolve({
            status: resp.statusCode || 200,
            finalUrl: parsed.href,
            redirected: false,
            redirectCount: 0,
            cached: false,
            streamed: true
          });
        }
      );

      req.on('timeout', () => {
        const err = new Error('Timeout');
        err.code = 'ETIMEDOUT';
        req.destroy(err);
        reject(err);
      });

      req.on('error', (err) => {
        // 如果是 HTTP 请求且错误，尝试 HTTPS
        if (!attemptedHttps && /^http:/i.test(targetUrl)) {
          const httpsUrl = targetUrl.replace(/^http:/i, 'https:');
          log('info', 'Stream HTTP to HTTPS fallback', {
            originalUrl: targetUrl,
            fallbackUrl: httpsUrl,
            error: String(err && err.message ? err.message : err)
          });
          tryStream(httpsUrl, null, true).then(resolve).catch(reject);
        } else {
          try {
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'X-Stream-Error': String(err.message || err)
              });
              clientRes.end(`stream proxy error: ${err.message || err}`);
            }
          } catch {}
          reject(err);
        }
      });

      req.end();
    });
  };

  return tryStream(remoteUrl);
}

async function proxyRequestToRemote(remoteUrl, clientReq, clientRes, options = {}) {
  const config = options.config || serverState.config || getConfig();
  const userAgent = options.userAgent || null;
  const method = String(options.method || clientReq.method || 'GET').toUpperCase();
  const maxRedirects = parseNumber(options.maxRedirects, config.redirectLimit);

  if (method === 'GET' && isLiveLikeStreamUrl(remoteUrl)) {
    return streamProxyToRemote(remoteUrl, clientReq, clientRes, { config, userAgent, method });
  }

  const served = await maybeServeFromCache(remoteUrl, clientReq, clientRes, { config, userAgent, method });
  if (served) {
    return { status: 200, finalUrl: remoteUrl, redirected: false, redirectCount: 0, cached: true };
  }

  let payload;
  try {
    payload = await requestRemotePayload(remoteUrl, {
      userAgent,
      method,
      maxRedirects,
      config
    });
  } catch (err) {
    // 如果是 HTTP 链接且请求失败，尝试转换为 HTTPS
    const httpsUrl = remoteUrl.replace(/^http:/i, 'https:');
    if (httpsUrl !== remoteUrl && /^http:/i.test(remoteUrl)) {
      log('info', 'HTTP to HTTPS fallback', {
        originalUrl: remoteUrl,
        fallbackUrl: httpsUrl,
        error: String(err && err.message ? err.message : err)
      });
      payload = await requestRemotePayload(httpsUrl, {
        userAgent,
        method,
        maxRedirects,
        config
      });
    } else {
      throw err;
    }
  }

  if (method !== 'HEAD' && shouldRewriteM3u(payload, remoteUrl)) {
    try {
      const sourceText = payload.body.toString('utf8');
      const rewritten = rewriteM3uText(sourceText, payload.finalUrl || remoteUrl, userAgent);
      payload.body = Buffer.from(rewritten, 'utf8');
      payload.headers = {
        ...payload.headers,
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8'
      };
      delete payload.headers['Content-Encoding'];
      delete payload.headers['content-encoding'];
      delete payload.headers['Content-Length'];
      delete payload.headers['content-length'];
    } catch (error) {
      log('warn', 'failed to rewrite m3u response', {
        remoteUrl,
        finalUrl: payload.finalUrl,
        error: String(error && error.message ? error.message : error)
      });
    }
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Final-Url, X-Redirected, X-Redirect-Count, X-Cache, Content-Range, Accept-Ranges',
    'X-Final-Url': String(payload.finalUrl || remoteUrl),
    'X-Redirected': payload.redirected ? 'true' : 'false',
    'X-Redirect-Count': String(Number(payload.redirectCount || 0)),
    'X-Cache': 'MISS'
  };

  const skipHeaders = ['content-location', 'location', 'content-encoding', 'transfer-encoding'];
  for (const [key, value] of Object.entries(payload.headers || {})) {
    const lowerKey = key.toLowerCase();
    if (!skipHeaders.includes(lowerKey) && !lowerKey.startsWith('x-')) {
      headers[key] = value;
    }
  }

  if (payload.statusCode === 401 || payload.statusCode === 403 || payload.statusCode === 404) {
    log('warn', 'upstream error', {
      remoteUrl,
      statusCode: payload.statusCode,
      finalUrl: payload.finalUrl
    });

    clientRes.writeHead(payload.statusCode, {
      'Content-Type': payload.contentType || 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Upstream-Status': String(payload.statusCode),
      'X-Upstream-Url': String(payload.finalUrl || remoteUrl)
    });
    clientRes.end(`Upstream error: ${payload.statusCode}`);
  } else if (method === 'HEAD') {
    clientRes.writeHead(payload.statusCode || 200, headers);
    clientRes.end();
  } else {
    clientRes.writeHead(payload.statusCode || 200, headers);
    clientRes.end(payload.body);
  }

  await maybeStoreCache(remoteUrl, { config, userAgent, method }, payload);

  return {
    status: payload.statusCode,
    finalUrl: payload.finalUrl,
    redirected: payload.redirected,
    redirectCount: payload.redirectCount,
    cached: false
  };
}

// ==================== 静态文件服务 ====================

function serveStaticFile(req, res, filePath, staticRoot) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(staticRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isCompressible =
      contentType.includes('text/') ||
      contentType.includes('javascript') ||
      contentType.includes('json') ||
      contentType.includes('xml') ||
      contentType.includes('mpegurl');
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const useGzip = isCompressible && acceptEncoding.includes('gzip');

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    };

    if (useGzip) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      fs.createReadStream(resolved).pipe(zlib.createGzip()).pipe(res);
      return;
    }

    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    fs.createReadStream(resolved).pipe(res);
  });
}

// ==================== API 路由处理 ====================

/**
 * 解析请求体
 */
async function parseRequestBody(req) {
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

/**
 * 获取请求方法（安全版本）
 */
function getRequestMethod(req) {
  return req.method || 'GET';
}

/**
 * 创建 API 路由器
 */
function createApiRouter(controllers) {
  const { authController, channelController, sourceController, settingsController, exportController } = controllers;

  return async function apiRouter(req, res) {
    const method = getRequestMethod(req);
    const url = req.url;

    // 为原生 http.ServerResponse 添加 Express 风格的辅助方法
        if (!res.json) {
          res.json = function(data) {
            this.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            this.end(JSON.stringify(data));
          };
        }
        if (!res.status) {
          res.status = function(code) {
            this._statusCode = code;
            return this;
          };
        }
        if (!res.sendFile) {
          res.sendFile = function(filePath) {
            const fs = require('fs');
            const path = require('path');
            const mime = require('mime-types');
            
            if (!fs.existsSync(filePath)) {
              this.writeHead(404, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              });
              this.end(JSON.stringify({ ok: false, message: 'File not found' }));
              return;
            }
            
            const contentType = mime.lookup(filePath) || 'application/octet-stream';
            const stats = fs.statSync(filePath);
            
            this.writeHead(200, {
              'Content-Type': contentType,
              'Content-Length': stats.size,
              'Access-Control-Allow-Origin': '*'
            });
            
            const stream = fs.createReadStream(filePath);
            stream.pipe(this);
          };
        }
        
        // 为原生 http.IncomingMessage 添加 Express 风格的辅助方法
        if (!req.get) {
          req.get = function(header) {
            return this.headers[header.toLowerCase()] || '';
          };
        }
        if (!req.protocol) {
          req.protocol = 'http';
        }

    // 健康检查
    if (url === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        service: 'm3u-proxy-api',
        port: serverState.config.port,
        authEnabled: auth.isEnabled(),
        version: '1.0.0'
      }));
      return;
    }

    // ==================== 导出 API ====================
    // POST /api/exports/export - 批量导出频道
    if (url === '/api/exports/export' && req.method === 'POST') {
      return exportController.exportChannels(req, res);
    }

    // GET /api/exports/download - 下载导出文件
    if (url === '/api/exports/download' && method === 'GET') {
      return exportController.downloadExport(req, res);
    }

    // GET /api/exports/list - 列出导出记录
    if (url === '/api/exports/list' && method === 'GET') {
      return exportController.listExports(req, res);
    }

    // DELETE /api/exports/:id - 删除导出记录
    if (url.match(/^\/api\/exports\/[a-zA-Z0-9_]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      req.params = { id };
      return exportController.deleteExport(req, res);
    }

    // POST /api/exports/cleanup - 清理过期导出
    if (url === '/api/exports/cleanup' && req.method === 'POST') {
      return exportController.cleanupExpired(req, res);
    }

    // ==================== 用户链接管理 API ====================
    // POST /api/exports/link - 创建用户链接
    if (url === '/api/exports/link' && req.method === 'POST') {
      return exportController.createLink(req, res);
    }

    // GET /api/exports/links - 列出用户链接
    if (url === '/api/exports/links' && method === 'GET') {
      return exportController.listLinks(req, res);
    }

    // DELETE /api/exports/link/:id - 删除用户链接
    if (url.match(/^\/api\/exports\/link\/[a-z0-9_]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      req.params = { id };
      return exportController.deleteLink(req, res);
    }

    // PUT /api/exports/link/:id - 更新用户链接
    if (url.match(/^\/api\/exports\/link\/[a-z0-9_]+$/) && method === 'PUT') {
      const id = url.split('/').pop();
      req.params = { id };
      return exportController.updateLink(req, res);
    }

    // GET /api/exports/link/:shortCode - 通过短链接下载
    if (url.match(/^\/api\/exports\/link\/[a-zA-Z0-9]+$/) && method === 'GET') {
      const shortCode = url.split('/').pop();
      req.params = { shortCode };
      return exportController.downloadByShortCode(req, res);
    }

    // 优化的短链接路径 - GET /link/:shortCode
    if (url.match(/^\/link\/[a-zA-Z0-9]+$/) && method === 'GET') {
      const shortCode = url.split('/').pop();
      req.params = { shortCode };
      return exportController.downloadByShortCode(req, res);
    }

    // ==================== 认证 API ====================
    // POST /api/auth/login - 登录（无需认证）
    if (url === '/api/auth/login' && req.method === 'POST') {
      return authController.login(req, res);
    }

    // POST /api/auth/logout - 登出
    if (url === '/api/auth/logout' && req.method === 'POST') {
      return authController.logout(req, res);
    }

    // GET /api/auth/userinfo - 获取用户信息
    if (url === '/api/auth/userinfo' && method === 'GET') {
      return authController.getUserInfo(req, res);
    }

    // PUT /api/auth/password - 修改密码
    if (url === '/api/auth/password' && method === 'PUT') {
      return authController.changePassword(req, res);
    }

    // GET /api/auth/users - 获取用户列表（管理员）
    if (url === '/api/auth/users' && method === 'GET') {
      return authController.getUsers(req, res);
    }

    // POST /api/auth/users - 创建用户（管理员）
    if (url === '/api/auth/users' && req.method === 'POST') {
      return authController.createUser(req, res);
    }

    // PUT /api/auth/users/:id - 更新用户（管理员）
    if (url.startsWith('/api/auth/users/') && method === 'PUT') {
      const id = url.split('/').pop();
      req.params = { id };
      return authController.updateUser(req, res);
    }

    // DELETE /api/auth/users/:id - 删除用户（管理员）
    if (url.startsWith('/api/auth/users/') && method === 'DELETE') {
      const id = url.split('/').pop();
      req.params = { id };
      return authController.deleteUser(req, res);
    }

    // ==================== 频道 API ====================
    // GET /api/channels - 获取频道列表
    if (url === '/api/channels' && method === 'GET') {
      return channelController.getChannels(req, res);
    }

    // GET /api/channels/search - 搜索频道
    if (url.startsWith('/api/channels/search') && method === 'GET') {
      return channelController.searchChannels(req, res);
    }

    // POST /api/channels - 创建频道
    if (url === '/api/channels' && req.method === 'POST') {
      return channelController.createChannel(req, res);
    }

    // POST /api/channels/batch - 批量导入
    if (url === '/api/channels/batch' && req.method === 'POST') {
      return channelController.batchImportChannels(req, res);
    }

    // POST /api/channels/batch/delete - 批量删除
    if (url === '/api/channels/batch/delete' && req.method === 'POST') {
      return channelController.batchDeleteChannels(req, res);
    }

    // POST /api/channels/batch/update - 批量更新
    if (url === '/api/channels/batch/update' && req.method === 'POST') {
      return channelController.batchUpdateChannels(req, res);
    }

    // GET /api/channels/groups - 获取所有分组
    if (url === '/api/channels/groups' && req.method === 'GET') {
      return channelController.getGroups(req, res);
    }

    // GET /api/channels/:id - 获取频道详情
    const channelMatch = url.match(/^\/api\/channels\/([^/]+)$/);
    if (channelMatch && method === 'GET') {
      req.params = { id: channelMatch[1] };
      return channelController.getChannel(req, res);
    }

    // PUT /api/channels/:id - 更新频道
    if (channelMatch && method === 'PUT') {
      req.params = { id: channelMatch[1] };
      return channelController.updateChannel(req, res);
    }

    // DELETE /api/channels/:id - 删除频道
    if (channelMatch && method === 'DELETE') {
      req.params = { id: channelMatch[1] };
      return channelController.deleteChannel(req, res);
    }

    // ==================== 源管理 API ====================
    // GET /api/sources/m3u - 获取 M3U 源列表
    if (url === '/api/sources/m3u' && method === 'GET') {
      return sourceController.getM3uSources(req, res);
    }

    // POST /api/sources/m3u - 创建 M3U 源
    if (url === '/api/sources/m3u' && req.method === 'POST') {
      return sourceController.createM3uSource(req, res);
    }

    // GET /api/sources/m3u/:id - 获取 M3U 源详情
    const m3uMatch = url.match(/^\/api\/sources\/m3u\/([^/]+)$/);
    if (m3uMatch) {
      req.params = { id: m3uMatch[1] };
      if (method === 'GET') return sourceController.getM3uSource(req, res);
      if (method === 'PUT') return sourceController.updateM3uSource(req, res);
      if (method === 'DELETE') return sourceController.deleteM3uSource(req, res);
      if (method === 'POST' && url.endsWith('/test')) return sourceController.testM3uSource(req, res);
    }

    // POST /api/sources/m3u/parse - 解析 M3U 链接
    if (url === '/api/sources/m3u/parse' && req.method === 'POST') {
      return sourceController.parseM3uUrl(req, res);
    }

    // POST /api/sources/m3u/upload - 上传 M3U 文件
    if (url === '/api/sources/m3u/upload' && req.method === 'POST') {
      return sourceController.parseM3uFile(req, res);
    }

    // GET /api/sources/m3u/:id/channels - 获取 M3U 源频道
    if (url.match(/^\/api\/sources\/m3u\/[^/]+\/channels$/) && method === 'GET') {
      const id = url.split('/')[5];
      req.params = { id };
      return sourceController.getM3uSourceChannels(req, res);
    }

    // GET /api/sources/epg - 获取 EPG 源列表
    if (url === '/api/sources/epg' && method === 'GET') {
      return sourceController.getEpgSources(req, res);
    }

    // POST /api/sources/epg - 创建 EPG 源
    if (url === '/api/sources/epg' && req.method === 'POST') {
      return sourceController.createEpgSource(req, res);
    }

    // GET /api/sources/epg/:id - 获取 EPG 源详情
    const epgMatch = url.match(/^\/api\/sources\/epg\/([^/]+)$/);
    if (epgMatch) {
      req.params = { id: epgMatch[1] };
      if (method === 'GET') return sourceController.getEpgSource(req, res);
      if (method === 'PUT') return sourceController.updateEpgSource(req, res);
      if (method === 'DELETE') return sourceController.deleteEpgSource(req, res);
    }

    // ==================== EPG 频道管理 API ====================
    // 需要先导入 epgController
    const epgController = require('./backend/controllers/epgController');
    
    // GET /api/epg/channels - 获取所有 EPG 频道配置
    if (url === '/api/epg/channels' && method === 'GET') {
      return epgController.getEpgChannels(req, res);
    }

    // GET /api/epg/channels/:id - 获取单个 EPG 频道配置
    const epgChannelMatch = url.match(/^\/api\/epg\/channels\/([^/]+)$/);
    if (epgChannelMatch && method === 'GET') {
      req.params = { id: epgChannelMatch[1] };
      return epgController.getEpgChannel(req, res);
    }

    // POST /api/epg/channels - 添加 EPG 频道配置
    if (url === '/api/epg/channels' && method === 'POST') {
      return epgController.addEpgChannel(req, res);
    }

    // PUT /api/epg/channels/:id - 更新 EPG 频道配置
    if (epgChannelMatch && method === 'PUT') {
      req.params = { id: epgChannelMatch[1] };
      return epgController.updateEpgChannel(req, res);
    }

    // DELETE /api/epg/channels/:id - 删除 EPG 频道配置
    if (epgChannelMatch && method === 'DELETE') {
      req.params = { id: epgChannelMatch[1] };
      return epgController.deleteEpgChannel(req, res);
    }

    // GET /api/epg/now/:channelName - 获取频道当前节目信息
    const epgNowMatch = url.match(/^\/api\/epg\/now\/([^/]+)$/);
    if (epgNowMatch && method === 'GET') {
      req.params = { channelName: epgNowMatch[1] };
      return epgController.getCurrentProgram(req, res);
    }

    // GET /api/epg/now-next/:channelName - 获取频道正在播放和下一个节目
    const epgNowNextMatch = url.match(/^\/api\/epg\/now-next\/([^/]+)$/);
    if (epgNowNextMatch && method === 'GET') {
      req.params = { channelName: epgNowNextMatch[1] };
      return epgController.getNowAndNext(req, res);
    }

    // POST /api/epg/cache/refresh - 刷新 EPG 缓存
    if (url === '/api/epg/cache/refresh' && method === 'POST') {
      return epgController.refreshEpgCache(req, res);
    }

    // GET /api/epg/groups - 获取所有分组
    if (url === '/api/epg/groups' && method === 'GET') {
      return epgController.getGroups(req, res);
    }

    // POST /api/epg/batch-set-group - 批量设置分组
    if (url === '/api/epg/batch-set-group' && method === 'POST') {
      return epgController.batchSetGroup(req, res);
    }

    // ==================== 设置 API ====================
    // GET /api/settings - 获取设置
    if (url === '/api/settings' && method === 'GET') {
      return settingsController.getSettings(req, res);
    }

    // PUT /api/settings - 更新设置
    if (url === '/api/settings' && method === 'PUT') {
      return settingsController.updateSettings(req, res);
    }

    // GET /api/settings/categories - 获取设置分类
    if (url === '/api/settings/categories' && method === 'GET') {
      return settingsController.getCategories(req, res);
    }

    // GET /api/settings/ua/global - 获取全局 UA
    if (url === '/api/settings/ua/global' && method === 'GET') {
      return settingsController.getGlobalUA(req, res);
    }

    // POST /api/settings/ua/global - 设置全局 UA
    if (url === '/api/settings/ua/global' && method === 'POST') {
      return settingsController.setGlobalUA(req, res);
    }

    // GET /api/settings/ua/channel - 获取频道 UA
    if (url === '/api/settings/ua/channel' && method === 'GET') {
      return settingsController.getChannelUA(req, res);
    }

    // POST /api/settings/ua/channel - 设置频道 UA
    if (url === '/api/settings/ua/channel' && method === 'POST') {
      return settingsController.setChannelUA(req, res);
    }

    // GET /api/settings/ua/effective - 获取有效 UA
    if (url === '/api/settings/ua/effective' && method === 'GET') {
      return settingsController.getEffectiveUA(req, res);
    }

    // 未匹配的路由
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'not_found', message: 'API 路由不存在' }));
  };
}

// ==================== 授权中间件 ====================

async function authMiddleware(req, res, config, next) {
  if (!auth.isEnabled()) {
    await next();
    return;
  }

  // 特殊处理：检查是否是 /m3u-proxy 请求，并且 m3uProxyAuth 设置为 false
  const isProxyRequest = req.url && req.url.includes('/m3u-proxy');
  if (isProxyRequest) {
    try {
      // 使用已有的 storage 实例，而不是重新创建
      if (serverState.storage) {
        const settings = await serverState.storage.getSettings();
        
        // 如果 m3uProxyAuth 为 false，则不需要认证
        if (settings.m3uProxyAuth === false) {
          console.log('[Auth Middleware] /m3u-proxy 请求，m3uProxyAuth=false，跳过认证');
          await next();
          return;
        }
      } else {
        console.warn('[Auth Middleware] storage 未初始化，继续认证流程');
      }
    } catch (error) {
      console.error('[Auth Middleware] 读取设置失败:', error);
      // 如果读取设置失败，继续认证流程以保证安全
    }
  }

  // 从多个位置获取 token：Authorization header > cookie > query 参数
  let token = '';

  // 1. 优先从 Authorization header 获取
  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.replace('Bearer ', '');
  }

  // 2. 从 cookie 获取（兼容 HLS.js、ArtPlayer 等播放器）
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('authToken=')) {
        token = cookie.substring('authToken='.length);
        break;
      }
    }
  }

  // 3. 从 query 参数获取（兼容旧版）
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  // 调试日志
  if (isProxyRequest) {
    console.log('[Auth Middleware] Path:', req.url);
    console.log('[Auth Middleware] Has Auth Header:', !!authHeader);
    console.log('[Auth Middleware] Has Cookie:', !!req.headers.cookie);
    console.log('[Auth Middleware] Token Found:', !!token);
  }

  if (!token) {
    res.writeHead(401, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: false,
      error: 'unauthorized',
      message: '未提供认证令牌'
    }));
    return;
  }

  const isValid = await auth.isTokenValid(token);
  if (!isValid) {
    res.writeHead(401, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: false,
      error: 'invalid_token',
      message: '无效或已过期的令牌'
    }));
    return;
  }

  req.user = await auth.getUserInfo(token);
  await next();
}

async function adminMiddleware(req, res, config, next) {
  if (!req.user || req.user.role !== 'admin') {
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: false,
      error: 'forbidden',
      message: '需要管理员权限'
    }));
    return;
  }
  await next();
}

// ==================== 代理请求处理 ====================

async function handleProxyRequest(req, res, url, config) {
  const userAgent = url.searchParams.get('ua') || url.searchParams.get('user-agent') || null;
  const isRedirectCheck = url.searchParams.has('redirect-check') || url.searchParams.has('check-redirect');
  const maxRedirects = parseNumber(url.searchParams.get('max-redirects'), config.redirectLimit);
  
  // 检查 M3U 文件中的鉴权信息
  const authToken = url.searchParams.get('auth_token');
  const linkId = url.searchParams.get('link_id');
  
  if (authToken && linkId) {
    try {
      const tokenService = require('./backend/services/tokenService');
      const linkModel = require('./backend/models/Link');
      
      // 验证鉴权令牌
      const decodedToken = tokenService.decodeToken(authToken);
      tokenService.verifyToken(decodedToken);
      
      // 验证链接是否存在
      const linkRecord = linkModel.getById(linkId);
      if (!linkRecord) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid link');
        return;
      }
      
      // 验证链接是否过期
      const now = new Date();
      const expiresAt = new Date(linkRecord.expiresAt);
      if (now > expiresAt) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Link expired');
        return;
      }
      
      // 验证链接下载次数
      if (linkRecord.downloadCount >= linkRecord.maxDownloads) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Download limit reached');
        return;
      }
      
      // 验证 IP 绑定
      if (linkRecord.ipBinding && linkRecord.ipBinding !== req.ip) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('IP mismatch');
        return;
      }
    } catch (error) {
      console.error('Auth token validation error:', error);
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid or expired auth token');
      return;
    }
  }

  const sourceUrl = normalizeRemoteUrl(url.searchParams.get('url') || '', url.pathname, url.searchParams);
  if (!sourceUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Missing query param: url');
    return;
  }

  const allowed = isUrlAllowed(sourceUrl, config.allowedHosts);
  if (!allowed.ok) {
    log('warn', 'blocked remote request', {
      url: sourceUrl,
      reason: allowed.reason,
      allowedHostsSize: config.allowedHosts.size,
      allowedHosts: Array.from(config.allowedHosts)
    });
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(`Blocked by policy: ${allowed.reason}`);
    return;
  }

  if (isRedirectCheck) {
    const info = await proxyRequestToRemote(sourceUrl, req, res, {
      userAgent,
      method: 'HEAD',
      maxRedirects,
      config
    });

    const outHeaders = {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Final-Url': info.finalUrl || sourceUrl,
      'X-Redirected': info.redirected ? 'true' : 'false',
      'X-Status-Code': String(info.status || 0),
      'X-Redirect-Count': String(info.redirectCount || 0),
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Final-Url, X-Redirected, X-Status-Code, X-Redirect-Count, Location'
    };

    if (info.redirected && info.finalUrl && info.finalUrl !== sourceUrl) {
      outHeaders.Location = info.finalUrl;
    }

    res.writeHead(200, outHeaders);
    res.end(`Redirect check completed. Final URL: ${info.finalUrl}, Redirected: ${info.redirected}, Status: ${info.status}`);
    return;
  }

  await proxyRequestToRemote(sourceUrl, req, res, {
    userAgent,
    method: req.method || 'GET',
    maxRedirects,
    config
  });
}

// ==================== 主服务器 ====================

function createAppServer(configInput = {}) {
  const config = getConfig(configInput);
  serverState.config = config;
  console.log('[Config] allowedHosts:', config.allowedHosts.size === 0 ? '(允许所有)' : Array.from(config.allowedHosts).join(', '));

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    let pathname = '-';
    
    try {
      const url = new URL(req.url, `http://${config.host}:${config.port}`);
      pathname = url.pathname;

      // CORS 预检
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, X-Requested-With'
        });
        res.end();
        return;
      }

      // 健康检查
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          ok: true, 
          port: config.port, 
          cacheEntries: serverState.memoryCache.size, 
          authEnabled: auth.isEnabled() 
        }));
        return;
      }

      // API 路由
      if (pathname.startsWith('/api/')) {
        // 解析查询参数
        req.query = url.searchParams;
        
        // 对于文件上传的路由，不解析请求体（由控制器自己处理）
        if (pathname !== '/api/sources/m3u/upload' || req.method !== 'POST') {
          req.body = await parseRequestBody(req).catch(() => ({}));
        }
        
        // 登录接口不需要认证
        if (pathname === '/api/auth/login' && req.method === 'POST') {
          await serverState.controllers.apiRouter(req, res);
          return;
        }
        
        // 其他 API 需要认证
        await authMiddleware(req, res, config, async () => {
          // 管理员接口额外检查
          if (
            pathname.startsWith('/api/auth/users') ||
            (pathname === '/api/auth/users' && ['POST', 'PUT', 'DELETE'].includes(req.method))
          ) {
            await adminMiddleware(req, res, config, async () => {
              await serverState.controllers.apiRouter(req, res);
            });
          } else {
            await serverState.controllers.apiRouter(req, res);
          }
        });
        return;
      }

      // 代理接口（需要认证）
      if (pathname === '/m3u-proxy' || pathname === '/tv-iill' || pathname.startsWith('/tv-iill/') || pathname.startsWith('/m3u-remote/')) {
        await authMiddleware(req, res, config, async () => {
          if (pathname.startsWith('/m3u-remote/')) {
            const remotePath = pathname.slice('/m3u-remote'.length) + url.search;
            // TODO: 实现 m3u-remote 代理逻辑
            res.writeHead(501, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Implemented');
          } else {
            await handleProxyRequest(req, res, url, config);
          }
        });
        return;
      }

      // 优化的短链接路径 - GET /link/:shortCode
      if (pathname.match(/^\/link\/[a-zA-Z0-9]+$/) && req.method === 'GET') {
        const shortCode = pathname.split('/').pop();
        req.params = { shortCode };
        req.query = url.searchParams;
        // 设置 req.ip
        req.ip = req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
        // 为 res 对象添加 Express 风格的辅助方法
        if (!res.json) {
          res.json = function(data) {
            this.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            this.end(JSON.stringify(data));
          };
        }
        if (!res.status) {
          res.status = function(code) {
            this._statusCode = code;
            return this;
          };
        }
        if (!res.send) {
          res.send = function(data) {
            if (!this._statusCode) {
              this.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              });
            }
            this.end(data);
          };
        }
        if (!res.setHeader) {
          res.setHeader = function(name, value) {
            this.setHeader(name, value);
          };
        }
        // 直接调用 downloadByShortCode 函数，绕过认证
        const exportController = serverState.controllers.exportController;
        await exportController.downloadByShortCode(req, res);
        return;
      }

      // 静态文件
      let filePath = pathname === '/' ? '/index.html' : pathname;
      filePath = path.join(config.staticRoot, decodeURIComponent(filePath));
      serveStaticFile(req, res, filePath, config.staticRoot);
    } catch (err) {
      log('error', 'request failed', {
        pathname,
        error: String(err && err.message ? err.message : err)
      });
      try {
        res.writeHead(502, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(`Server error: ${err.message || err}`);
      } catch {}
    } finally {
      log('info', 'request completed', {
        method: req.method || 'GET',
        path: pathname,
        elapsedMs: Date.now() - startedAt
      });
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log('error', 'port already in use', { port: config.port });
      return;
    }
    log('error', 'server startup error', { error: String(err && err.message ? err.message : err) });
  });

  return { server, config };
}

// ==================== 服务器启动/停止 ====================

async function startServer(configInput = {}) {
  if (serverState.server) {
    return serverState.server;
  }

  console.log('='.repeat(60));
  console.log('M3U Proxy API Server');
  console.log('='.repeat(60));
  console.log('正在启动...');

  const config = getConfig(configInput);
  serverState.config = config;
  console.log('[Config-1] allowedHosts:', config.allowedHosts.size === 0 ? '(允许所有)' : Array.from(config.allowedHosts).join(', '));
  console.log('[Config-1] allowedHosts type:', config.allowedHosts.constructor.name);
  console.log('[Config-1] allowedHosts size:', config.allowedHosts.size);

  // 初始化授权系统
  await auth.initAuth(config);

  console.log('[Config-2] allowedHosts:', config.allowedHosts.size === 0 ? '(允许所有)' : Array.from(config.allowedHosts).join(', '));
  console.log('[Config-2] allowedHosts type:', config.allowedHosts.constructor.name);
  console.log('[Config-2] allowedHosts size:', config.allowedHosts.size);

  // 初始化存储服务
  const storage = new StorageService(config.dataDir, {
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    db: config.redisDb
  });
  await storage.init();
  serverState.storage = storage;

  // 创建控制器
  const authController = new AuthController(storage);
  const channelController = new ChannelController(storage);
  const sourceController = new SourceController(storage);
  const settingsController = new SettingsController(storage);
  const exportController = new ExportController(storage);

  serverState.controllers = {
    authController,
    channelController,
    sourceController,
    settingsController,
    exportController,
    apiRouter: createApiRouter({
      authController,
      channelController,
      sourceController,
      settingsController,
      exportController
    })
  };

  const { server } = createAppServer(config);
  serverState.server = server;

  server.listen(config.port, config.host, () => {
    console.log('='.repeat(60));
    console.log('服务器已启动');
    console.log('='.repeat(60));
    console.log(`监听地址：http://${config.host}:${config.port}`);
    console.log(`授权状态：${auth.isEnabled() ? '✓ 已启用' : '✗ 已禁用'}`);
    console.log(`数据目录：${config.dataDir}`);
    console.log(`缓存目录：${config.cacheRoot}`);
    console.log(`静态文件：${config.staticRoot}`);
    if (upstreamProxyUrl) {
      console.log(`上游代理：${upstreamProxyUrl}`);
    }
    console.log('');
    console.log('服务端点:');
    console.log('─'.repeat(60));
    console.log(`Web 界面：http://localhost:${config.port}/`);
    console.log(`API 接口：http://localhost:${config.port}/api/`);
    console.log(`代理服务：http://localhost:${config.port}/m3u-proxy?url=<encoded_url>`);
    console.log(`健康检查：http://localhost:${config.port}/health`);
    console.log('─'.repeat(60));
    console.log('='.repeat(60));

    log('info', 'server started', {
      url: `http://${config.host}:${config.port}`,
      authEnabled: config.authEnabled
    });
  });

  return server;
}

async function stopServer() {
  return new Promise((resolve) => {
    if (!serverState.server) {
      resolve();
      return;
    }

    const current = serverState.server;
    serverState.server = null;
    current.close(() => resolve());
  }).then(() => {
    return auth.closeAuth();
  });
}

// ==================== 模块导出 ====================

module.exports = {
  DEFAULTS,
  getConfig,
  createAppServer,
  startServer,
  stopServer,
  proxyRequestToRemote,
  requestRemotePayload,
  normalizeRemoteUrl,
  isUrlAllowed,
  getCacheTtlMs
};

if (require.main === module) {
  startServer().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}
