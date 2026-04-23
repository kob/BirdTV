

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
const auth = require('./backend/auth');
const tokenService = require('./backend/services/tokenService');

// 导入存储服务
const StorageService = require('./backend/services/storageService');

// 导入控制器
const AuthController = require('./backend/controllers/authController');
const ChannelController = require('./backend/controllers/channelController');
const SourceController = require('./backend/controllers/sourceController');
const SettingsController = require('./backend/controllers/settingsController');
const ExportController = require('./backend/controllers/exportController');
const { SchedulerService, describeCron } = require('./backend/services/schedulerService');

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
  dataDir: path.resolve(__dirname, 'data'),
  cloudflareWorkerUrl: '',
  cloudflareWorkerDomains: '',
  denoProxyUrl: '',
  denoProxyDomains: '',
  esaProxyUrl: '',
  esaProxyDomains: ''
};

const serverState = {
  server: null,
  config: null,
  memoryCache: new Map(),
  storage: null,
  controllers: null
};

// ==================== 工具函数 ====================

/**
 * 检测用户设备类型
 * @param {string} userAgent - User-Agent 字符串
 * @returns {boolean} - 是否为移动设备
 */
function isMobileDevice(userAgent) {
  if (!userAgent) return false;

  const mobileRegex = /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|Opera Mini|Opera Mobi/i;
  return mobileRegex.test(userAgent);
}

/**
 * 解析 Cookie 并获取指定值
 * @param {string} cookieHeader - Cookie 头字符串
 * @param {string} name - Cookie 名称
 * @returns {string|null} - Cookie 值或 null
 */
function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value || null;
    }
  }
  return null;
}

/**
 * 处理设备检测和自动重定向
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {string} pathname - 请求路径
 * @param {URL} url - 解析后的 URL 对象
 * @returns {boolean|string} - 返回 true 表示已处理（已重定向），false 表示未处理，或返回新的 pathname
 */
function handleDeviceDetection(req, res, pathname, url) {
  // 跳过非 HTML 请求和 API 请求
  if (!pathname.match(/\.(html|\/)$/) || pathname.startsWith('/api/')) {
    return false;
  }

  // 获取用户偏好（从 Cookie 或 URL 参数）
  const forceDevice = getCookie(req.headers.cookie, 'birdtv_device') || url.searchParams.get('device');

  // 如果用户强制指定了设备类型，尊重用户选择
  if (forceDevice === 'desktop') {
    // 如果当前在 mobile.html，且用户强制桌面版，重定向到对应页面
    if (pathname === '/mobile.html') {
      const targetPath = url.searchParams.get('redirect') || '/index.html';
      res.writeHead(302, {
        'Location': targetPath
      });
      res.end();
      return true;
    }
    return false;
  }

  if (forceDevice === 'mobile') {
    // 如果用户强制移动版，重定向到 mobile.html
    if (pathname === '/' || pathname === '/index.html') {
      const targetPath = '/mobile.html';
      // 保留查询参数
      const queryString = url.searchParams.toString();
      const fullTargetPath = queryString ? `${targetPath}?${queryString}` : targetPath;

      res.writeHead(302, {
        'Location': fullTargetPath
      });
      res.end();
      return true;
    }
    return false;
  }

  // 没有用户偏好，自动检测设备类型
  const isMobile = isMobileDevice(req.headers['user-agent']);

  // 移动设备访问根路径或 index.html，重定向到 mobile.html
  if (isMobile && (pathname === '/' || pathname === '/index.html')) {
    const targetPath = '/mobile.html';
    // 保留查询参数
    const queryString = url.searchParams.toString();
    const fullTargetPath = queryString ? `${targetPath}?${queryString}` : targetPath;

    res.writeHead(302, {
      'Location': fullTargetPath
    });
    res.end();
    return true;
  }

  // 桌面设备访问 mobile.html，重定向到 index.html
  if (!isMobile && pathname === '/mobile.html') {
    const targetPath = url.searchParams.get('redirect') || '/index.html';
    res.writeHead(302, {
      'Location': targetPath
    });
    res.end();
    return true;
  }

  return false;
}

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

/**
 * 解析 CF Worker 代理域名列表
 * 支持精确匹配和通配符后缀匹配（如 .touch-u.fun 匹配 fi.touch-u.fun）
 */
function parseCloudflareWorkerDomains(raw) {
  if (raw instanceof Set) return raw;
  if (!raw || !String(raw).trim()) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * 检查目标 URL 的域名是否匹配代理域名列表
 * 支持：精确匹配（fi.touch-u.fun）和后缀匹配（.touch-u.fun 匹配所有子域名）
 */
function isProxyDomain(urlStr, domains) {
  if (!domains || domains.size === 0) return false;
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    for (const domain of domains) {
      if (hostname === domain) return true;
      // .touch-u.fun 匹配 fi.touch-u.fun 等子域名
      if (domain.startsWith('.') && (hostname.endsWith(domain) || hostname === domain.slice(1))) return true;
    }
    return false;
  } catch { return false; }
}

/** @deprecated 使用 isProxyDomain 替代 */
function isCloudflareWorkerDomain(urlStr, domains) {
  return isProxyDomain(urlStr, domains);
}

/**
 * 根据目标 URL 确定使用哪个代理（ESA > Deno > CF Worker）
 * 返回 { proxyUrl, proxyType } 或 null
 */
function resolveProxyForUrl(remoteUrl, esaUrl, esaDomains, denoUrl, denoDomains, workerUrl, workerDomains) {
  // ESA 代理最优先（国内边缘节点，延迟最低）
  if (esaUrl && esaDomains && esaDomains.size > 0 && isProxyDomain(remoteUrl, esaDomains)) {
    return { proxyUrl: esaUrl, proxyType: 'ESA' };
  }
  // Deno 代理次之（用于 CF 同生态导致 WAF 拦截的域名）
  if (denoUrl && denoDomains && denoDomains.size > 0 && isProxyDomain(remoteUrl, denoDomains)) {
    return { proxyUrl: denoUrl, proxyType: 'Deno' };
  }
  // CF Worker 代理最后
  if (workerUrl && workerDomains && workerDomains.size > 0 && isProxyDomain(remoteUrl, workerDomains)) {
    return { proxyUrl: workerUrl, proxyType: 'CF-Worker' };
  }
  return null;
}

function getConfig(overrides = {}) {
  const env = process.env;
  return {
    port: parseNumber(overrides.port || env.BIRDTV_PORT || env.M3U_PROXY_PORT || env.PORT, DEFAULTS.port),
    host: String(overrides.host || env.BIRDTV_HOST || env.M3U_PROXY_HOST || env.HOST || DEFAULTS.host),
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
    cloudflareWorkerUrl: String(overrides.cloudflareWorkerUrl || env.CLOUDFLARE_WORKER_URL || DEFAULTS.cloudflareWorkerUrl),
    cloudflareWorkerDomains: parseCloudflareWorkerDomains(overrides.cloudflareWorkerDomains || env.CLOUDFLARE_WORKER_DOMAINS || DEFAULTS.cloudflareWorkerDomains),
    denoProxyUrl: String(overrides.denoProxyUrl || env.DENO_PROXY_URL || DEFAULTS.denoProxyUrl),
    denoProxyDomains: parseCloudflareWorkerDomains(overrides.denoProxyDomains || env.DENO_PROXY_DOMAINS || DEFAULTS.denoProxyDomains),
    esaProxyUrl: String(overrides.esaProxyUrl || env.ESA_PROXY_URL || DEFAULTS.esaProxyUrl),
    esaProxyDomains: parseCloudflareWorkerDomains(overrides.esaProxyDomains || env.ESA_PROXY_DOMAINS || DEFAULTS.esaProxyDomains),
    // 授权配置
    authEnabled: String(overrides.authEnabled || env.AUTH_ENABLED || 'true'),
    jwtSecret: String(overrides.jwtSecret || env.AUTH_JWT_SECRET || 'default-secret'),
    tokenExpireDays: parseNumber(overrides.tokenExpireDays || env.AUTH_TOKEN_EXPIRE_DAYS, 7),
    // Redis 配置 - 只有当 AUTH_REDIS_HOST 明确设置时才启用
    redisHost: overrides.redisHost || env.AUTH_REDIS_HOST || '',
    redisPort: String(overrides.redisPort || env.AUTH_REDIS_PORT || '6379'),
    redisPassword: String(overrides.redisPassword || env.AUTH_REDIS_PASSWORD || ''),
    redisDb: String(overrides.redisDb || env.AUTH_REDIS_DB || '0'),
    defaultAdmin: String(overrides.defaultAdmin || env.AUTH_DEFAULT_ADMIN || 'admin'),
    defaultPassword: String(overrides.defaultPassword || env.AUTH_DEFAULT_PASSWORD || 'admin123'),
    forceResetAdmin: String(overrides.forceResetAdmin || env.AUTH_FORCE_RESET_ADMIN || 'false')
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
  // DASH MPD manifest 也需要重写 segment URL
  if (contentType.includes('dash') || contentType.includes('xml')) {
    const finalLower = String(payload.finalUrl || '').toLowerCase();
    const remoteLower = String(remoteUrl || '').toLowerCase();
    if (finalLower.includes('.mpd') || remoteLower.includes('.mpd')) {
      return true;
    }
  }
  const finalLower = String(payload.finalUrl || '').toLowerCase();
  const remoteLower = String(remoteUrl || '').toLowerCase();
  return finalLower.includes('.m3u8') || finalLower.includes('.m3u') || remoteLower.includes('.m3u8') || remoteLower.includes('.m3u');
}

function buildLocalProxyUrl(targetUrl, userAgent, authToken = null, linkId = null) {
  // tv.iill.top 域名强制直连，不生成代理 URL
  try {
    const urlObj = new URL(targetUrl);
    if (String(urlObj.hostname || '').toLowerCase().endsWith('tv.iill.top')) {
      return targetUrl;
    }
  } catch {}

  let out = `/m3u-proxy?url=${encodeURIComponent(targetUrl)}`;
  if (userAgent) {
    out += `&ua=${encodeURIComponent(String(userAgent))}`;
  }
  // 添加认证参数（如果有，用于导出的 M3U）
  if (authToken) {
    out += `&auth_token=${encodeURIComponent(authToken)}`;
  }
  // 添加 link_id 参数（如果有）
  if (linkId) {
    out += `&link_id=${encodeURIComponent(linkId)}`;
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

function rewriteM3uText(inputText, baseUrl, userAgent, authToken = null, linkId = null) {
  const lines = String(inputText || '').split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          const abs = toAbsoluteUrl(uri, baseUrl);
          if (!/^https?:/i.test(abs)) return match;
          return `URI="${buildLocalProxyUrl(abs, userAgent, authToken, linkId)}"`;
        });
      }

      const abs = toAbsoluteUrl(trimmed, baseUrl);
      if (!/^https?:/i.test(abs)) return line;
      return buildLocalProxyUrl(abs, userAgent, authToken, linkId);
    })
    .join('\n');
}

/**
 * 重写 DASH MPD manifest 中的 segment URL
 * 将所有绝对 URL 替换为通过 BirdTV 代理的 URL
 */
function rewriteMpdText(inputText, baseUrl, userAgent, authToken = null, linkId = null) {
  try {
    // 使用简单的字符串替换来重写 XML 中的 URL 属性
    // 匹配 BaseURL、Initialization、SegmentURL 等标签中的 URL
    let result = inputText;

    // 检测 URL 是否已经是 Worker URL（不完整的 Worker URL 格式）
    // 如果是，直接返回原始 URL，不再次包装
    function isWorkerUrl(url) {
      if (!url) return false;
      const lower = String(url).toLowerCase();
      // 检测不完整的 Worker URL（如 birdtv-proxy.xxx.workers.dev/8/au1_341/init.cmfa）
      // 这种 URL 缺少 ?url= 参数，是无效的
      if (lower.includes('birdtv-proxy') && lower.includes('.workers.dev') && !lower.includes('?url=')) {
        return true;
      }
      return false;
    }

    // 检测是否为 segment URL
    // Segment URL（.cmfa, .cmfv, .cmft, .stpp 等）应该直接访问，不走任何代理
    function isSegmentUrl(url) {
      if (!url) return false;
      const lower = String(url).toLowerCase();
      // 检测 segment 扩展名（DASH/HLS 媒体片段，应直接访问 CDN 不走代理）
      if (/\.(cmfa|cmfv|cmft|stpp|_stpp\.|m4[a-z]|mp4|ts|aac|ac3|ec3|webm|mkv|ogg|opus)\b/i.test(lower)) {
        return true;
      }
      return false;
    }

    // 将 segment URL 升级为 HTTPS，避免 Mixed Content 阻断
    function upgradeToHttps(url) {
      if (!url) return url;
      return String(url).replace(/^http:/i, 'https:');
    }

    // 处理 BaseURL 标签
    result = result.replace(/<BaseURL[^>]*>([^<]*)<\/BaseURL>/gi, (match, url) => {
      const trimmedUrl = url.trim();
      if (!trimmedUrl || !/^https?:/i.test(trimmedUrl)) return match;
      const abs = toAbsoluteUrl(trimmedUrl, baseUrl);
      // 如果已经是 Worker URL，不重写
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 BaseURL:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN，不走代理
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return `<BaseURL>${https}</BaseURL>`;
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return `<BaseURL>${proxyUrl}</BaseURL>`;
    });

    // 处理 Initialization 标签的 SourceURL 和 Range 属性
    result = result.replace(/<Initialization\s+SourceURL="([^"]+)"[^>]*(?:\/>|>\s*<\/Initialization>)/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 Initialization:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(url, https);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(url, proxyUrl);
    });

    result = result.replace(/<Initialization\s+[^>]*SourceURL="([^"]+)"[^>]*(?:\/>|>\s*<\/Initialization>)/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 Initialization:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(url, https);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(url, proxyUrl);
    });

    // 处理 SegmentURL 标签的 media 和 index 属性
    result = result.replace(/<SegmentURL\s+media="([^"]+)"[^>]*(?:\/>|>\s*<\/SegmentURL>)/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 SegmentURL media:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(`media="${url}"`, `media="${https}"`);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(`media="${url}"`, `media="${proxyUrl}"`);
    });

    result = result.replace(/<SegmentURL\s+[^>]*media="([^"]+)"[^>]*(?:\/>|>\s*<\/SegmentURL>)/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 SegmentURL media:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(`media="${url}"`, `media="${https}"`);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(`media="${url}"`, `media="${proxyUrl}"`);
    });

    result = result.replace(/<SegmentURL\s+index="([^"]+)"[^>]*(?:\/>|>\s*<\/SegmentURL>)/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 SegmentURL index:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(`index="${url}"`, `index="${https}"`);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(`index="${url}"`, `index="${proxyUrl}"`);
    });

    // 处理 SegmentTemplate 标签的 initialization 和 media 属性
    result = result.replace(/initialization="([^"]+)"/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 initialization:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(url, https);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(url, proxyUrl);
    });

    result = result.replace(/media="([^"]+)"/gi, (match, url) => {
      if (!url || !/^https?:/i.test(url)) return match;
      const abs = toAbsoluteUrl(url, baseUrl);
      if (isWorkerUrl(abs)) {
        console.log('[MPD Rewrite] 跳过已经是 Worker URL 的 media:', abs.substring(0, 80));
        return match;
      }
      // Segment URL 直接访问原始 CDN
      if (isSegmentUrl(abs)) {
        const https = upgradeToHttps(abs);
        console.log('[MPD Rewrite] Segment URL 直接访问，不代理:', https.substring(0, 80));
        return match.replace(url, https);
      }
      const proxyUrl = buildLocalProxyUrl(abs, userAgent, authToken, linkId);
      return match.replace(url, proxyUrl);
    });

    return result;
  } catch (error) {
    console.error('[MPD Rewrite] 重写失败:', error);
    return inputText;
  }
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

    // 代理配置（Deno 优先于 CF Worker）
    let workerRetry = false;

    const denoUrl = config.denoProxyUrl || process.env.DENO_PROXY_URL;
    const denoDomains = config.denoProxyDomains;
    const workerUrl = config.cloudflareWorkerUrl || process.env.CLOUDFLARE_WORKER_URL;
    const workerDomains = config.cloudflareWorkerDomains;
    const esaUrl = config.esaProxyUrl || process.env.ESA_PROXY_URL;
    const esaDomains = config.esaProxyDomains;

    // 检查目标域名应使用哪个代理
    const proxyInfo = resolveProxyForUrl(remoteUrl, esaUrl, esaDomains, denoUrl, denoDomains, workerUrl, workerDomains);
    const shouldProxyViaWorker = !!proxyInfo;

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

      // 使用代理（Deno / CF Worker，域名直通 或 WAF 重试时启用）
      const useWorkerProxy = (workerRetry || shouldProxyViaWorker) && !!(proxyInfo?.proxyUrl || workerUrl);
      if (useWorkerProxy) {
        const effectiveProxyUrl = proxyInfo?.proxyUrl || workerUrl;
        const proxyType = proxyInfo?.proxyType || 'CF-Worker';
        const reason = shouldProxyViaWorker ? `域名直通(${proxyType})` : `WAF重试(${proxyType})`;
        console.log(`[Proxy] ${reason}，通过代理: ${target.substring(0, 120)}`);
        const workerTarget = new URL(effectiveProxyUrl);
        workerTarget.searchParams.set('url', target);
        if (headers['User-Agent']) {
          workerTarget.searchParams.set('ua', headers['User-Agent']);
        }
        parsed = workerTarget;
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
          // HEAD 请求失败时，优先尝试代理重试
          if ((code === 403 || code === 520) && !workerRetry && (workerUrl || denoUrl || esaUrl)) {
            console.log('[WAF] HEAD 请求返回错误，尝试使用代理重试', {
              url: target,
              statusCode: code
            });
            resp.resume();
            workerRetry = true;
            run(target, insecureTls, family, useProxy, forceGetForHeadFallback);
            return;
          }
          // 如果没有 Worker 代理或已重试过，使用 GET fallback
          resp.resume();
          run(target, insecureTls, family, useProxy, true);
          return;
        }

        if (normalizedMethod === 'HEAD') {
          resp.resume();
          // Worker 代理时，从 X-Worker-Final-Url 获取真实最终 URL
          let effectiveFinalUrl = useWorkerProxy ? target : parsed.href;
          if (useWorkerProxy && resp.headers) {
            const workerFinalUrl = resp.headers['x-worker-final-url'] || resp.headers['X-Worker-Final-Url'];
            if (workerFinalUrl) {
              effectiveFinalUrl = workerFinalUrl;
              console.log('[Worker Proxy] HEAD 从 X-Worker-Final-Url 获取最终 URL:', workerFinalUrl.substring(0, 100));
            }
          }
          resolve({
            statusCode: code,
            headers: resp.headers,
            body: Buffer.alloc(0),
            finalUrl: effectiveFinalUrl,
            redirected: redirectCount > 0,
            redirectCount
          });
          return;
        }

        // WAF 错误重试（所有 403/520 都尝试代理）
        if ((code === 403 || code === 520) && !workerRetry && (workerUrl || denoUrl || esaUrl)) {
          console.log('[WAF] 检测到 403/520 错误，尝试使用代理重试', {
            url: target,
            statusCode: code
          });
          resp.resume();
          workerRetry = true;
          run(target, insecureTls, family, useProxy, forceGetForHeadFallback);
          return;
        }

        const chunks = [];
        resp.on('data', (chunk) => chunks.push(chunk));
        resp.on('end', () => {
          // Worker 代理时，从 X-Worker-Final-Url 获取真实最终 URL
          // 这样 rewriteMpdText 和前端 Shaka 才能正确解析相对 URL
          let effectiveFinalUrl = useWorkerProxy ? target : parsed.href;
          if (useWorkerProxy && resp.headers) {
            const workerFinalUrl = resp.headers['x-worker-final-url'] || resp.headers['X-Worker-Final-Url'];
            if (workerFinalUrl) {
              effectiveFinalUrl = workerFinalUrl;
              console.log('[Worker Proxy] GET 从 X-Worker-Final-Url 获取最终 URL:', workerFinalUrl.substring(0, 100));
            }
          }
          resolve({
            statusCode: code,
            headers: resp.headers,
            body: Buffer.concat(chunks),
            finalUrl: effectiveFinalUrl,
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

  // 代理配置（ESA > Deno > CF Worker）
  const esaUrl = config.esaProxyUrl || process.env.ESA_PROXY_URL;
  const esaDomains = config.esaProxyDomains;
  const denoUrl = config.denoProxyUrl || process.env.DENO_PROXY_URL;
  const denoDomains = config.denoProxyDomains;
  const workerUrl = config.cloudflareWorkerUrl || process.env.CLOUDFLARE_WORKER_URL;
  const workerDomains = config.cloudflareWorkerDomains;
  const proxyInfo = resolveProxyForUrl(remoteUrl, esaUrl, esaDomains, denoUrl, denoDomains, workerUrl, workerDomains);
  const shouldProxyViaWorker = !!proxyInfo;

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

      // 域名直通：通过代理转发直播流
      let effectiveTarget = parsed;
      let originalUrl = targetUrl;
      if (shouldProxyViaWorker && proxyInfo.proxyUrl) {
        const workerTarget = new URL(proxyInfo.proxyUrl);
        workerTarget.searchParams.set('url', targetUrl);
        if (requestHeaders['User-Agent']) {
          workerTarget.searchParams.set('ua', requestHeaders['User-Agent']);
        }
        effectiveTarget = workerTarget;
        console.log(`[Proxy] 域名直通(${proxyInfo.proxyType})，直播流通过代理: ${targetUrl.substring(0, 120)}`);
      }

      const lib = effectiveTarget.protocol === 'https:' ? https : http;
      const req = lib.request(
        effectiveTarget,
        {
          method,
          headers: requestHeaders,
          timeout: config.requestTimeoutMs,
          agent: getAgent(effectiveTarget, true)
        },
        (resp) => {
          // Worker 代理时，从 X-Worker-Final-Url 获取真实最终 URL
          let finalUrl = shouldProxyViaWorker ? originalUrl : parsed.href;
          if (shouldProxyViaWorker && resp.headers) {
            const workerFinalUrl = resp.headers['x-worker-final-url'] || resp.headers['X-Worker-Final-Url'];
            if (workerFinalUrl) finalUrl = workerFinalUrl;
          }
          const headers = {
            ...resp.headers,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-Final-Url, X-Redirected, X-Redirect-Count, X-Cache',
            'X-Cache': 'MISS',
            'X-Final-Url': finalUrl,
            'X-Redirected': 'false',
            'X-Redirect-Count': '0',
            'Cache-Control': 'no-store'
          };
          clientRes.writeHead(resp.statusCode || 200, headers);
          resp.pipe(clientRes);
          resolve({
            status: resp.statusCode || 200,
            finalUrl,
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
      // 从原始请求 URL 中提取 auth_token 和 link_id（如果存在，用于导出的 M3U）
      const reqUrl = new URL(clientReq.url, `http://${clientReq.headers.host || 'localhost'}`);
      const authToken = reqUrl.searchParams.get('auth_token');
      const linkId = reqUrl.searchParams.get('link_id');
      console.log('[M3U/MPD Rewrite] Request URL:', clientReq.url);
      console.log('[M3U/MPD Rewrite] Extracted auth_token:', authToken ? 'YES (' + authToken.substring(0, 20) + '...)' : 'NO');
      console.log('[M3U/MPD Rewrite] Extracted link_id:', linkId || 'NO');

      // 构建包含 auth_token 和 link_id 的代理 URL
      const rewriteAuthToken = authToken;
      const rewriteLinkId = linkId;

      // 判断是否为 MPD (DASH) manifest
      const contentType = String((payload.headers && (payload.headers['content-type'] || payload.headers['Content-Type'])) || '').toLowerCase();
      const isMpd = contentType.includes('dash') || contentType.includes('xml') ||
        String(payload.finalUrl || '').toLowerCase().includes('.mpd');

      let rewritten;
      if (isMpd) {
        // MPD manifest 重写
        console.log('[M3U/MPD Rewrite] 检测到 MPD manifest，执行 URL 重写');
        rewritten = rewriteMpdText(sourceText, payload.finalUrl || remoteUrl, userAgent, rewriteAuthToken, rewriteLinkId);
        console.log('[M3U/MPD Rewrite] MPD 重写后的前 500 字符:');
        console.log(rewritten.substring(0, 500));
      } else {
        // M3U 播放列表重写
        rewritten = rewriteM3uText(sourceText, payload.finalUrl || remoteUrl, userAgent, rewriteAuthToken, rewriteLinkId);
        console.log('[M3U Rewrite] First 10 lines of rewritten content:');
        const lines = rewritten.split('\n').slice(0, 10);
        lines.forEach((line, i) => console.log(`  Line ${i}: ${line}`));
      }

      payload.body = Buffer.from(rewritten, 'utf8');
      if (!isMpd) {
        payload.headers = {
          ...payload.headers,
          'content-type': 'application/vnd.apple.mpegurl; charset=utf-8'
        };
      }
      delete payload.headers['Content-Encoding'];
      delete payload.headers['content-encoding'];
      delete payload.headers['Content-Length'];
      delete payload.headers['content-length'];
    } catch (error) {
      log('warn', 'failed to rewrite m3u/mpd response', {
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

    // 对大文件使用 chunked 传输，避免 Content-Length 导致代理截断
    if (stats.size > 10000) {
      // 对于支持 Accept-Encoding 的客户端，使用 gzip 压缩
      const acceptEnc = String(req.headers['accept-encoding'] || '');
      if (isCompressible && acceptEnc.includes('gzip')) {
        headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        fs.createReadStream(resolved).pipe(zlib.createGzip()).pipe(res);
      } else {
        // 不设置 Content-Length，让 Node.js 使用 chunked 传输
        res.writeHead(200, headers);
        const rs = fs.createReadStream(resolved, { highWaterMark: 16384 });
        rs.pipe(res);
      }
      return;
    }

    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    res.end(fs.readFileSync(resolved));
  });
}

// ==================== API 路由处理 ====================

/**
 * 解析请求体
 */
async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    
    // 检查是否有请求体
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    console.log('[parseRequestBody] Content-Length:', contentLength);
    if (contentLength === 0) {
      console.log('[parseRequestBody] No body, resolving empty object');
      resolve({});
      return;
    }
    
    req.on('data', chunk => {
      console.log('[parseRequestBody] Received chunk:', chunk.toString());
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
        console.error('[parseRequestBody] JSON parse error:', error.message);
        reject(error);
      }
    });
    
    req.on('error', (err) => {
      console.error('[parseRequestBody] Request error:', err.message);
      reject(err);
    });
    
    // 添加超时处理
    setTimeout(() => {
      if (body === '') {
        console.warn('[parseRequestBody] Timeout waiting for request body');
        resolve({});
      }
    }, 5000);
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
    // 使用 pathname 而不是完整的 url（去除查询参数）
    const url = req.pathname || req.url.split('?')[0];

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

    // ==================== 用户订阅管理 API ====================
    // POST /api/exports/link - 创建订阅
    if (url === '/api/exports/link' && req.method === 'POST') {
      return exportController.createLink(req, res);
    }

    // GET /api/exports/links - 列出订阅
    if (url === '/api/exports/links' && method === 'GET') {
      return exportController.listLinks(req, res);
    }

    // DELETE /api/exports/link/:id - 删除订阅
    if (url.match(/^\/api\/exports\/link\/[a-z0-9_]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      req.params = { id };
      return exportController.deleteLink(req, res);
    }

    // PUT /api/exports/link/:id - 更新订阅
    if (url.match(/^\/api\/exports\/link\/[a-z0-9_]+$/) && method === 'PUT') {
      const id = url.split('/').pop();
      req.params = { id };
      return exportController.updateLink(req, res);
    }

    // GET /api/exports/link/:code - 通过订阅码下载
    if (url.match(/^\/api\/exports\/link\/[a-zA-Z0-9]+$/) && method === 'GET') {
      const shortCode = url.split('/').pop();
      req.params = { shortCode };
      return exportController.downloadByShortCode(req, res);
    }

    // 订阅链接路径 - GET /link/:code
    if (url.match(/^\/link\/[a-zA-Z0-9]+$/) && method === 'GET') {
      const shortCode = url.split('/').pop();
      req.params = { shortCode };
      return exportController.downloadByShortCode(req, res);
    }

    // ==================== 认证 API ====================
    // POST /api/auth/login - 登录（无需认证）
    console.log('[apiRouter] Checking auth login, url:', url, 'method:', req.method);
    if (url === '/api/auth/login' && req.method === 'POST') {
      console.log('[apiRouter] Login matched, calling authController.login');
      console.log('[apiRouter] Request body:', JSON.stringify(req.body));
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

    // GET /api/auth/check-default-password - 检查是否使用默认密码
    if (url === '/api/auth/check-default-password' && method === 'GET') {
      return authController.checkDefaultPassword(req, res);
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

    // POST /api/channels/groups - 添加自定义分组
    if (url === '/api/channels/groups' && req.method === 'POST') {
      return channelController.addGroup(req, res);
    }

    // DELETE /api/channels/groups - 删除自定义分组
    if (url === '/api/channels/groups' && req.method === 'DELETE') {
      return channelController.deleteGroupFromSettings(req, res);
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

    // ==================== 数据同步 API ====================

    // GET /api/settings/sync/info - 获取同步信息
    if (url === '/api/settings/sync/info' && method === 'GET') {
      return settingsController.getSyncInfo(req, res);
    }

    // POST /api/settings/sync/redis - 同步文件到 Redis
    if (url === '/api/settings/sync/redis' && method === 'POST') {
      return settingsController.syncToRedis(req, res);
    }

    // POST /api/settings/sync/file - 从 Redis 同步到文件
    if (url === '/api/settings/sync/file' && method === 'POST') {
      return settingsController.syncFromFile(req, res);
    }

    // ==================== 定时任务 API ====================
    // 获取调度器引用
    const scheduler = serverState.scheduler;

    // GET /api/scheduler/tasks - 获取所有定时任务
    if (url === '/api/scheduler/tasks' && method === 'GET') {
      return (async () => {
        try {
          const tasks = await scheduler.getTasks();
          res.json({ ok: true, data: tasks, status: scheduler.getStatus() });
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: '获取任务列表失败' }));
        }
      })();
    }

    // POST /api/scheduler/tasks - 创建定时任务
    if (url === '/api/scheduler/tasks' && method === 'POST') {
      return (async () => {
        try {
          const task = await scheduler.createTask(req.body);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, data: task }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: e.message }));
        }
      })();
    }

    // PUT /api/scheduler/tasks/:id - 更新定时任务
    const schedulerTaskMatch = url.match(/^\/api\/scheduler\/tasks\/([^/]+)$/);
    if (schedulerTaskMatch && method === 'PUT') {
      return (async () => {
        try {
          const task = await scheduler.updateTask(schedulerTaskMatch[1], req.body);
          res.json({ ok: true, data: task });
        } catch (e) {
          const code = e.message === '任务不存在' ? 404 : 400;
          res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: e.message }));
        }
      })();
    }

    // DELETE /api/scheduler/tasks/:id - 删除定时任务
    if (schedulerTaskMatch && method === 'DELETE') {
      return (async () => {
        try {
          await scheduler.deleteTask(schedulerTaskMatch[1]);
          res.json({ ok: true, message: '任务已删除' });
        } catch (e) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: e.message }));
        }
      })();
    }

    // POST /api/scheduler/tasks/:id/run - 手动执行任务
    const schedulerRunMatch = url.match(/^\/api\/scheduler\/tasks\/([^/]+)\/run$/);
    if (schedulerRunMatch && method === 'POST') {
      return (async () => {
        try {
          const result = await scheduler.runTask(schedulerRunMatch[1]);
          res.json({ ok: true, data: result });
        } catch (e) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: e.message }));
        }
      })();
    }

    // GET /api/scheduler/status - 获取调度器状态
    if (url === '/api/scheduler/status' && method === 'GET') {
      return res.json({ ok: true, data: scheduler.getStatus() });
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

  // 3. 从 query 参数获取（兼容旧版和导出 M3U）
  if (!token && req.query) {
    // URLSearchParams 使用 get() 方法获取参数
    token = req.query.get ? (req.query.get('token') || req.query.get('auth_token')) : (req.query.token || req.query.auth_token);
  }

  // 调试日志
  if (isProxyRequest) {
    console.log('[Auth Middleware] Path:', req.url);
    console.log('[Auth Middleware] Has Auth Header:', !!authHeader);
    console.log('[Auth Middleware] Has Cookie:', !!req.headers.cookie);
    console.log('[Auth Middleware] Has Query:', !!req.query);
    console.log('[Auth Middleware] Query auth_token:', req.query ? (req.query.get ? req.query.get('auth_token') : req.query.auth_token) : 'N/A');
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

  // 尝试解码 Token，判断类型
  let isValid = false;
  let tokenPayload = null;
  let isExportToken = false;
  let isLinkToken = false;
  try {
    const decoded = tokenService.decodeToken(token);

    // 如果是导出 Token（type: 'export'），使用 tokenService 验证
    if (decoded.type === 'export') {
      tokenService.verifyToken(decoded);
      isValid = true;
      tokenPayload = decoded;
      isExportToken = true;
      console.log('[Auth Middleware] Validated export token:', decoded);
    } else if (decoded.linkId) {
      // 如果是短链接 Token（包含 linkId），只验证签名和过期时间
      tokenService.verifyToken(decoded);
      isValid = true;
      tokenPayload = decoded;
      isLinkToken = true;
      console.log('[Auth Middleware] Validated link token:', decoded);
    } else {
      // 否则使用 auth 模块验证（JWT Token）
      isValid = await auth.isTokenValidWithCleanup(token);
    }
  } catch (e) {
    // Token 解码失败，尝试以下验证方式：
    // 1. 16 字符随机 export token（在 Export 记录中查找匹配）
    if (/^[0-9a-f]{16}$/i.test(token)) {
      try {
        const exportModel = require('./backend/models/Export');
        const allExports = exportModel.getAll();
        const exportRecord = allExports.find(e => e.exportToken === token);
        if (exportRecord && exportRecord.tokenExpiresAt) {
          const now = new Date();
          const expiresAt = new Date(exportRecord.tokenExpiresAt);
          if (now <= expiresAt) {
            isValid = true;
            isExportToken = true;
            tokenPayload = { type: 'export', exportId: exportRecord.id };
            console.log('[Auth Middleware] Validated 16-char export token for export:', exportRecord.id);
          }
        }
      } catch (err) {
        console.log('[Auth Middleware] 16-char token validation error:', err.message);
      }
    }
    // 2. JWT Token
    if (!isValid) {
      isValid = await auth.isTokenValidWithCleanup(token);
    }
  }
  
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

  // 获取用户信息
  if ((isExportToken || isLinkToken) && tokenPayload) {
    // 导出 Token 或短链接 Token，直接从 payload 中提取用户信息
    req.user = {
      id: tokenPayload.userId || tokenPayload.linkId || 'admin',
      username: tokenPayload.userId || tokenPayload.shortCode || 'link',
      role: 'admin'  // 导出/短链接 Token 默认给予 admin 角色
    };
    console.log('[Auth Middleware] Set user from token:', req.user);
  } else {
    // JWT Token，使用 auth 模块获取用户信息
    req.user = await auth.getUserInfo(token);
  }
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
      const linkModel = require('./backend/models/Link');
      const exportModel = require('./backend/models/Export');
      
      // 验证链接是否存在
      const linkRecord = linkModel.getById(linkId);
      if (!linkRecord) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid link');
        return;
      }
      
      // 验证链接是否过期
      const now = new Date();
      const linkExpiresAt = new Date(linkRecord.expiresAt);
      if (now > linkExpiresAt) {
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

      // 验证 auth_token：查找匹配的导出记录
      const allExports = exportModel.getAll();
      const exportRecord = allExports.find(e => e.exportToken === authToken);
      if (exportRecord) {
        // 检查 token 是否过期
        if (exportRecord.tokenExpiresAt) {
          const tokenExpiresAt = new Date(exportRecord.tokenExpiresAt);
          if (now > tokenExpiresAt) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Auth token expired');
            return;
          }
        }
      } else {
        // 兼容旧版 base64 编码的 token
        try {
          const tokenService = require('./backend/services/tokenService');
          const decodedToken = tokenService.decodeToken(authToken);
          tokenService.verifyToken(decodedToken);
        } catch (e) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid auth token');
          return;
        }
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
    const errorDetail = allowed.reason === 'host_not_allowed' 
      ? `Host "${sourceUrl}" is not in allowedHosts list. Set BIRDTV_ALLOWED_HOSTS environment variable or leave empty to allow all.`
      : allowed.reason;
    res.end(`Blocked by policy: ${errorDetail}`);
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
  console.log('[Config] cloudflareWorkerUrl:', config.cloudflareWorkerUrl || '(未配置)');
  console.log('[Config] cloudflareWorkerDomains:', config.cloudflareWorkerDomains.size === 0 ? '(无)' : Array.from(config.cloudflareWorkerDomains).join(', '));
  console.log('[Config] denoProxyUrl:', config.denoProxyUrl || '(未配置)');
  console.log('[Config] denoProxyDomains:', config.denoProxyDomains.size === 0 ? '(无)' : Array.from(config.denoProxyDomains).join(', '));
  console.log('[Config] esaProxyUrl:', config.esaProxyUrl || '(未配置)');
  console.log('[Config] esaProxyDomains:', config.esaProxyDomains.size === 0 ? '(无)' : Array.from(config.esaProxyDomains).join(', '));

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
        // 保存 pathname 供后续使用
        req.pathname = pathname;
        
        // 对于文件上传的路由，不解析请求体（由控制器自己处理）
        if (pathname !== '/api/sources/m3u/upload' || req.method !== 'POST') {
          req.body = await parseRequestBody(req).catch(() => ({}));
        }
        
        // 登录接口不需要认证
        console.log('[API Route] Checking login path:', pathname, 'method:', req.method);
        if (pathname === '/api/auth/login' && req.method === 'POST') {
          console.log('[API Route] Login route matched, calling apiRouter');
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
        // 解析查询参数（供 authMiddleware 使用）
        req.query = url.searchParams;
        
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

      // 设备检测和重定向（在静态文件处理之前）
      const deviceMiddlewareResult = handleDeviceDetection(req, res, pathname, url);
      if (deviceMiddlewareResult) {
        return; // 已处理重定向
      }
      pathname = deviceMiddlewareResult === false ? pathname : deviceMiddlewareResult || pathname;

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

  // 启动定时任务调度器
  const scheduler = new SchedulerService(storage, sourceController, exportController);
  await scheduler.start();
  serverState.scheduler = scheduler;

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
  if (serverState.scheduler) {
    serverState.scheduler.stop();
    serverState.scheduler = null;
  }
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

// 全局未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('[FATAL] 未捕获的异常:', error);
  console.error('[FATAL] 堆栈信息:', error.stack);
  // 不立即退出，记录日志后继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] 未处理的 Promise 拒绝:', reason);
  console.error('[FATAL] Promise:', promise);
  // 不立即退出，记录日志后继续运行
});

// 内存警告
if (process.on && typeof process.on === 'function') {
  process.on('warning', (warning) => {
    console.warn('[WARNING]', warning.name, warning.message);
    console.warn('[WARNING] 堆栈:', warning.stack);
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}
