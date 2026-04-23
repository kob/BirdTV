const M3uSource = require('../models/M3uSource');
const EpgSource = require('../models/EpgSource');
const http = require('http');
const https = require('https');

/**
 * 源配置控制器
 */
class SourceController {
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * 使用原生 http/https 获取远程内容（替代 node-fetch，避免 ESM 兼容问题）
   * 支持 Cloudflare WAF 自动重试（通过 CLOUDFLARE_WORKER_URL）
   * 支持域名直通（通过 CLOUDFLARE_WORKER_DOMAINS 配置的域名直接走 Worker）
   */
  _fetchContent(url, userAgent = null, timeoutMs = 30000, _useWorkerProxy = false) {
    const esaUrl = process.env.ESA_PROXY_URL;
    const esaDomains = this._parseProxyDomains(process.env.ESA_PROXY_DOMAINS);
    const denoUrl = process.env.DENO_PROXY_URL;
    const denoDomains = this._parseProxyDomains(process.env.DENO_PROXY_DOMAINS);
    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
    const workerDomains = this._parseProxyDomains(process.env.CLOUDFLARE_WORKER_DOMAINS);
    // 代理优先级：ESA > Deno > CF Worker
    const isEsaDomain = this._isProxyDomain(url, esaDomains);
    const isDenoDomain = this._isProxyDomain(url, denoDomains);
    const isWorkerDomain = this._isProxyDomain(url, workerDomains);
    let effectiveProxyUrl = null;
    let effectiveProxyType = null;
    if (isEsaDomain && esaUrl) {
      effectiveProxyUrl = esaUrl;
      effectiveProxyType = 'ESA';
    } else if (isDenoDomain && denoUrl) {
      effectiveProxyUrl = denoUrl;
      effectiveProxyType = 'Deno';
    } else if (isWorkerDomain && workerUrl) {
      effectiveProxyUrl = workerUrl;
      effectiveProxyType = 'CF-Worker';
    }
    const actualUseWorker = (_useWorkerProxy || isEsaDomain || isDenoDomain || isWorkerDomain) && !!effectiveProxyUrl;

    if ((isEsaDomain || isDenoDomain || isWorkerDomain) && effectiveProxyUrl && !_useWorkerProxy) {
      console.log(`[SourceController] 域名直通(${effectiveProxyType})，通过代理: ${url}`);
    }

    return new Promise((resolve, reject) => {
      let redirectCount = 0;
      const maxRedirects = 5;

      // 如果启用了代理，将 URL 包装为代理请求
      let targetUrl = url;
      if (actualUseWorker && effectiveProxyUrl) {
        targetUrl = new URL(effectiveProxyUrl);
        targetUrl.searchParams.set('url', url);
        if (userAgent) targetUrl.searchParams.set('ua', userAgent);
      }

      const makeRequest = (currentUrl) => {
        const parsed = new URL(currentUrl);
        const lib = parsed.protocol === 'https:' ? https : http;

        const options = {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'GET',
          timeout: timeoutMs,
          headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
          }
        };

        // Worker 代理模式下不覆盖 User-Agent（已在 query 参数中传递）
        if (userAgent && !actualUseWorker) {
          options.headers['User-Agent'] = userAgent;
        } else if (!userAgent && !actualUseWorker) {
          options.headers['User-Agent'] = process.env.DEFAULT_USER_AGENT || 'okhttp/4.12.0';
        }

        const req = lib.request(options, (res) => {
          // 处理重定向
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              reject(new Error('Too many redirects'));
              return;
            }
            let location = res.headers.location;
            if (location.startsWith('/')) {
              location = `${parsed.protocol}//${parsed.hostname}${location}`;
            }
            makeRequest(location);
            return;
          }

          // 检测 Cloudflare WAF 拦截，尝试通过代理重试
          if ((res.statusCode === 403 || res.statusCode === 520) &&
              !_useWorkerProxy && (workerUrl || denoUrl || esaUrl)) {
            const isCloudflare =
              res.headers['cf-mitigated'] === 'challenge' ||
              String(res.headers['server'] || '').toLowerCase().includes('cloudflare');
            if (isCloudflare) {
              console.log(`[SourceController] WAF 拦截 (${res.statusCode})，尝试 Worker 代理重试: ${url}`);
              res.resume();
              this._fetchContent(url, userAgent, timeoutMs, true)
                .then(resolve)
                .catch(reject);
              return;
            }
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve(body);
          });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      };

      makeRequest(targetUrl);
    });
  }

  // M3U 源管理

  /**
   * 解析代理域名环境变量
   */
  _parseProxyDomains(raw) {
    if (!raw || !String(raw).trim()) return new Set();
    return new Set(
      String(raw).split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
    );
  }

  /** @deprecated 使用 _parseProxyDomains 替代 */
  _parseWorkerDomains() {
    return this._parseProxyDomains(process.env.CLOUDFLARE_WORKER_DOMAINS);
  }

  /**
   * 检查 URL 域名是否匹配代理域名列表
   * 支持：精确匹配（fi.touch-u.fun）和后缀匹配（.touch-u.fun 匹配所有子域名）
   */
  _isProxyDomain(urlStr, domains) {
    if (!domains || domains.size === 0) return false;
    try {
      const hostname = new URL(urlStr).hostname.toLowerCase();
      for (const domain of domains) {
        if (hostname === domain) return true;
        if (domain.startsWith('.') && (hostname.endsWith(domain) || hostname === domain.slice(1))) return true;
      }
      return false;
    } catch { return false; }
  }

  /** @deprecated 使用 _isProxyDomain 替代 */
  _isWorkerDomain(urlStr, domains) {
    return this._isProxyDomain(urlStr, domains);
  }

  async getM3uSources(req, res) {
    try {
      const sources = await this.storage.getSources();
      res.json({ ok: true, data: sources.m3u || [] });
    } catch (error) {
      console.error('[SourceController] GetM3uSources error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取 M3U 源列表失败'
      }));
    }
  }

  async getM3uSource(req, res) {
    try {
      const { id } = req.params;
      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const source = (sources.m3u || []).find(s => s.id === id || s._id === id);

      if (!source) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'M3U 源不存在'
        }));
      }

      res.json({ ok: true, data: source });
    } catch (error) {
      console.error('[SourceController] GetM3uSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取 M3U 源失败'
      }));
    }
  }

  async createM3uSource(req, res) {
    try {
      const sourceData = req.body;

      if (!sourceData.name || !sourceData.url) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '源名称和 URL 为必填项'
        }));
      }

      const existingSources = await this.storage.getSources();
      const duplicate = (existingSources.m3u || []).find(
        s => s.name && s.name.trim().toLowerCase() === sourceData.name.trim().toLowerCase()
      );
      if (duplicate) {
        res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'duplicate_name',
          message: '已存在相同名称的节目源：' + sourceData.name
        }));
      }

      const source = new M3uSource(sourceData);
      await this.storage.saveSource('m3u', source.toJSON());

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, data: source.toJSON() }));
    } catch (error) {
      console.error('[SourceController] CreateM3uSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '创建 M3U 源失败'
      }));
    }
  }

  async updateM3uSource(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const index = (sources.m3u || []).findIndex(s => s.id === id || s._id === id);

      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'M3U 源不存在'
        }));
      }

      // 重名检查（排除自身）
      if (updateData.name) {
        const duplicate = (sources.m3u || []).find(
          (s, i) => i !== index && s.name && s.name.trim().toLowerCase() === updateData.name.trim().toLowerCase()
        );
        if (duplicate) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
            ok: false,
            error: 'duplicate_name',
            message: '已存在相同名称的节目源：' + updateData.name
          }));
        }
      }

      const source = new M3uSource(sources.m3u[index]);
      Object.assign(source, updateData);
      source.updatedAt = new Date().toISOString();

      await this.storage.saveSource('m3u', source.toJSON());

      res.json({ ok: true, data: source.toJSON() });
    } catch (error) {
      console.error('[SourceController] UpdateM3uSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '更新 M3U 源失败'
      }));
    }
  }

  async deleteM3uSource(req, res) {
    try {
      const { id } = req.params;
      const deleted = await this.storage.deleteSource('m3u', id);

      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'M3U 源不存在'
        }));
      }

      res.json({ ok: true, message: 'M3U 源已删除' });
    } catch (error) {
      console.error('[SourceController] DeleteM3uSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '删除 M3U 源失败'
      }));
    }
  }

  async testM3uSource(req, res) {
    try {
      const { id } = req.params;
      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const source = (sources.m3u || []).find(s => s.id === id || s._id === id);

      if (!source) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'M3U 源不存在'
        }));
      }

      // 测试源可用性，使用节目源的自定义UA
      const result = await this._testSourceUrl(source.url, source.userAgent);

      res.json({
        ok: true,
        data: {
          id: source.id,
          url: source.url,
          ...result
        }
      });
    } catch (error) {
      console.error('[SourceController] TestM3uSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '测试 M3U 源失败'
      }));
    }
  }

  async getM3uSourceChannels(req, res) {
    try {
      const { id } = req.params;
      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const source = (sources.m3u || []).find(s => s.id === id || s._id === id);

      if (!source) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'M3U 源不存在'
        }));
      }

      // 获取 M3U 内容并解析频道，使用节目源的自定义UA
      const channels = await this._parseM3uChannels(source.url, source.userAgent);

      res.json({
        ok: true,
        data: channels
      });
    } catch (error) {
      console.error('[SourceController] GetM3uSourceChannels error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取频道列表失败: ' + error.message
      }));
    }
  }

  // 解析 M3U 文件获取频道列表（纯解析，不执行导入/删除操作）
  async _parseM3uChannels(url, userAgent = null) {
    try {
      const content = await this._fetchContent(url, userAgent);
      this._lastParsedContent = content;

      const lines = content.split(/\r?\n/);
      const channels = [];
      let pendingName = '';
      let pendingGroup = '';
      let pendingTvgId = '';
      let pendingTvgLogo = '';
      let pendingKodiProps = {};
      let pendingUserAgent = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
          // 解析频道名称和属性
          pendingName = '';
          pendingGroup = '';
          pendingTvgId = '';
          pendingTvgLogo = '';
          pendingKodiProps = {};
          pendingUserAgent = '';
          
          // 提取分组信息
          const groupMatch = line.match(/group-title="([^"]+)"/);
          if (groupMatch) {
            pendingGroup = groupMatch[1];
          }
          
          // 提取 tvg-id
          const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);
          if (tvgIdMatch) {
            pendingTvgId = tvgIdMatch[1];
          }
          
          // 提取 tvg-logo
          const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
          if (tvgLogoMatch) {
            pendingTvgLogo = tvgLogoMatch[1];
          }
          
          // 提取频道名称
          const commaIndex = line.lastIndexOf(',');
          if (commaIndex >= 0) {
            pendingName = line.slice(commaIndex + 1).trim();
          }
          continue;
        }

        if (line.startsWith('#KODIPROP:')) {
          // 解析 KODIPROP 信息
          const propMatch = line.match(/^#KODIPROP:(.+?)=(.+)$/);
          if (propMatch) {
            pendingKodiProps[propMatch[1]] = propMatch[2];
          }
          continue;
        }

        if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
          // 解析 EXTVLCOPT:http-user-agent 信息
          const uaMatch = line.match(/^#EXTVLCOPT:http-user-agent=(.+)$/);
          if (uaMatch) {
            pendingUserAgent = uaMatch[1];
          }
          continue;
        }

        if (line.startsWith('#') || line.startsWith('<')) continue;

        // 这是一个 URL 行
        const channelUrl = line;
        const name = pendingName || `频道 ${channels.length + 1}`;

        // 构建频道对象
        const channel = {
          id: `temp_${Date.now()}_${channels.length}`,
          name,
          url: channelUrl,
          group: pendingGroup,
          drm: {}
        };

        // 添加 tvg-id 和 tvg-logo
        if (pendingTvgId) channel.tvgId = pendingTvgId;
        if (pendingTvgLogo) channel.tvgLogo = pendingTvgLogo;
        if (pendingUserAgent) channel.userAgent = pendingUserAgent;

        // 处理 KODIPROP 信息
        if (Object.keys(pendingKodiProps).length > 0) {
          // 处理 DASH MPD 相关信息
          if (pendingKodiProps['inputstream.adaptive.manifest_type'] === 'mpd') {
            channel.streamType = 'dash';
            channel.playerType = 'shaka';
          }

          // 处理 ClearKey 信息（兼容 'clearkey' 和 'org.w3.clearkey' 两种写法）
          const licenseType = String(pendingKodiProps['inputstream.adaptive.license_type'] || '').toLowerCase();
          if ((licenseType === 'clearkey' || licenseType === 'org.w3.clearkey') && 
              pendingKodiProps['inputstream.adaptive.license_key']) {
            const licenseKey = pendingKodiProps['inputstream.adaptive.license_key'];
            const [kid, key] = licenseKey.split(':');
            if (kid && key) {
              channel.drm = {
                clearKeys: {
                  [kid]: key
                }
              };
            }
          }
        }

        channels.push(channel);
        pendingName = '';
        pendingGroup = '';
        pendingTvgId = '';
        pendingTvgLogo = '';
        pendingKodiProps = {};
        pendingUserAgent = '';
      }

      return channels;
    } catch (error) {
      console.error('[SourceController] _parseM3uChannels error:', error);
      throw error;
    }
  }

  async parseM3uUrl(req, res) {
    try {
      const { url, userAgent } = req.body;
      
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: 'M3U 链接为必填项'
        }));
      }

      // 解析 M3U 链接获取频道列表，传入自定义UA
      const channels = await this._parseM3uChannels(url, userAgent || null);

      res.json({
        ok: true,
        data: channels
      });
    } catch (error) {
      console.error('[SourceController] ParseM3uUrl error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '解析 M3U 链接失败: ' + error.message
      }));
    }
  }

  async parseM3uFile(req, res) {
    try {
      // 处理文件上传
      const formidable = require('formidable');
      const form = new formidable.IncomingForm();
      form.keepExtensions = true;
      form.parse(req, async (err, fields, files) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            ok: false,
            error: 'validation_error',
            message: '文件上传失败: ' + err.message
          }));
        }

        const m3uFile = files.file;
        if (!m3uFile) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            ok: false,
            error: 'validation_error',
            message: '请选择M3U文件'
          }));
        }

        // 读取文件内容
        const fs = require('fs');
        // 调试：打印文件对象结构
        console.log('File object structure:', JSON.stringify(m3uFile, null, 2));
        
        // 处理文件对象可能是数组的情况
        const fileObj = Array.isArray(m3uFile) ? m3uFile[0] : m3uFile;
        if (!fileObj) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            ok: false,
            error: 'validation_error',
            message: '无法获取文件对象'
          }));
        }
        
        // 尝试使用不同的属性名
        const filePath = fileObj.filepath || fileObj.filePath || fileObj.path;
        if (!filePath) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            ok: false,
            error: 'validation_error',
            message: '无法获取文件路径'
          }));
        }
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 解析M3U内容
        const channels = this._parseM3uContent(content);

        res.json({
          ok: true,
          data: channels
        });
      });
    } catch (error) {
      console.error('[SourceController] ParseM3uFile error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '解析 M3U 文件失败: ' + error.message
      }));
    }
  }

  // 解析M3U内容
  _parseM3uContent(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let pendingName = '';
    let pendingGroup = '';
    let pendingTvgId = '';
    let pendingTvgLogo = '';
    let pendingKodiProps = {};
    let pendingUserAgent = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        // 解析频道名称和属性
        pendingName = '';
        pendingGroup = '';
        pendingTvgId = '';
        pendingTvgLogo = '';
        pendingKodiProps = {};
        pendingUserAgent = '';
        
        // 提取分组信息
        const groupMatch = line.match(/group-title="([^"]+)"/);
        if (groupMatch) {
          pendingGroup = groupMatch[1];
        }
        
        // 提取 tvg-id
        const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);
        if (tvgIdMatch) {
          pendingTvgId = tvgIdMatch[1];
        }
        
        // 提取 tvg-logo
        const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (tvgLogoMatch) {
          pendingTvgLogo = tvgLogoMatch[1];
        }
        
        // 提取频道名称
        const commaIndex = line.lastIndexOf(',');
        if (commaIndex >= 0) {
          pendingName = line.slice(commaIndex + 1).trim();
        }
        continue;
      }

      if (line.startsWith('#KODIPROP:')) {
        // 解析 KODIPROP 信息
        const propMatch = line.match(/^#KODIPROP:(.+?)=(.+)$/);
        if (propMatch) {
          pendingKodiProps[propMatch[1]] = propMatch[2];
        }
        continue;
      }

      if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
        // 解析 EXTVLCOPT:http-user-agent 信息
        const uaMatch = line.match(/^#EXTVLCOPT:http-user-agent=(.+)$/);
        if (uaMatch) {
          pendingUserAgent = uaMatch[1];
        }
        continue;
      }

      if (line.startsWith('#') || line.startsWith('<')) continue;

      // 这是一个 URL 行
      const channelUrl = line;
      const name = pendingName || `频道 ${channels.length + 1}`;

      // 构建频道对象
      const channel = {
        id: `temp_${Date.now()}_${channels.length}`,
        name,
        url: channelUrl,
        group: pendingGroup,
        drm: {}
      };

      // 添加 tvg-id 和 tvg-logo
      if (pendingTvgId) channel.tvgId = pendingTvgId;
      if (pendingTvgLogo) channel.tvgLogo = pendingTvgLogo;
      if (pendingUserAgent) channel.userAgent = pendingUserAgent;

      // 处理 KODIPROP 信息
      if (Object.keys(pendingKodiProps).length > 0) {
        // 处理 DASH MPD 相关信息
        if (pendingKodiProps['inputstream.adaptive.manifest_type'] === 'mpd') {
          channel.streamType = 'dash';
          channel.playerType = 'shaka';
        }

        // 处理 ClearKey 信息（兼容 'clearkey' 和 'org.w3.clearkey' 两种写法）
        const licenseType = String(pendingKodiProps['inputstream.adaptive.license_type'] || '').toLowerCase();
        if ((licenseType === 'clearkey' || licenseType === 'org.w3.clearkey') && 
            pendingKodiProps['inputstream.adaptive.license_key']) {
          const licenseKey = pendingKodiProps['inputstream.adaptive.license_key'];
          const [kid, key] = licenseKey.split(':');
          if (kid && key) {
            channel.drm = {
              clearKeys: {
                [kid]: key
              }
            };
          }
        }
      }

      channels.push(channel);
      pendingName = '';
      pendingGroup = '';
      pendingTvgId = '';
      pendingTvgLogo = '';
      pendingKodiProps = {};
      pendingUserAgent = '';
    }

    return channels;
  }

  async importM3uSource(req, res) {
    try {
      const { id } = req.params;
      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const source = (sources.m3u || []).find(s => s.id === id || s._id === id);

      if (!source) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'M3U 源不存在'
        }));
      }

      // 获取 M3U 内容并解析频道，使用节目源的自定义UA
      const Channel = require('../models/Channel');
      const sourceId = source.id || source._id;
      const imported = await this._importChannelsFromM3U(source.url, sourceId, source.userAgent);

      res.json({
        ok: true,
        data: {
          imported: imported.length,
          sourceId: sourceId,
          sourceName: source.name
        }
      });
    } catch (error) {
      console.error('[SourceController] ImportM3uSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '导入 M3U 源失败: ' + error.message
      }));
    }
  }

  // 从 M3U URL 导入频道
  async _importChannelsFromM3U(url, sourceId, userAgent = null, importOptions = {}) {
    const Channel = require('../models/Channel');
    const { proxyMode: optProxyMode, playerType: optPlayerType, group: optGroup, duplicateMode = 'replace' } = importOptions;

    try {
      const content = await this._fetchContent(url, userAgent);
      const allChannels = await this.storage.getChannels();

      // 根据 duplicateMode 处理已有频道
      // - replace: 先删除该源旧频道再全部导入（默认，兼容旧行为）
      // - skip: 跳过已存在的频道（按名称+URL匹配）
      // - merge: 已存在则更新，不存在则新增
      if (duplicateMode === 'replace') {
        const existingIds = allChannels
          .filter(c => c.sourceId === sourceId)
          .map(c => c.id);
        if (existingIds.length > 0) {
          await this.storage.batchDeleteChannels(existingIds);
          console.log(`[SourceController] 已清理源 ${sourceId} 的 ${existingIds.length} 个旧频道`);
        }
      }

      const lines = content.split(/\r?\n/);
      const channels = [];
      let pendingName = '';
      let pendingGroup = '';
      let pendingTvgId = '';
      let pendingTvgLogo = '';
      let pendingKodiProps = {};
      let pendingUserAgent = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
          // 解析频道名称和属性
          pendingName = '';
          pendingGroup = '';
          pendingTvgId = '';
          pendingTvgLogo = '';
          pendingKodiProps = {};
          pendingUserAgent = '';
          
          // 提取分组信息
          const groupMatch = line.match(/group-title="([^"]+)"/);
          if (groupMatch) {
            pendingGroup = groupMatch[1];
          }
          
          // 提取 tvg-id
          const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);
          if (tvgIdMatch) {
            pendingTvgId = tvgIdMatch[1];
          }
          
          // 提取 tvg-logo
          const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
          if (tvgLogoMatch) {
            pendingTvgLogo = tvgLogoMatch[1];
          }
          
          // 提取频道名称
          const commaIndex = line.lastIndexOf(',');
          if (commaIndex >= 0) {
            pendingName = line.slice(commaIndex + 1).trim();
          }
          continue;
        }

        if (line.startsWith('#KODIPROP:')) {
          // 解析 KODIPROP 信息
          const propMatch = line.match(/^#KODIPROP:(.+?)=(.+)$/);
          if (propMatch) {
            pendingKodiProps[propMatch[1]] = propMatch[2];
          }
          continue;
        }

        if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
          // 解析 EXTVLCOPT:http-user-agent 信息
          const uaMatch = line.match(/^#EXTVLCOPT:http-user-agent=(.+)$/);
          if (uaMatch) {
            pendingUserAgent = uaMatch[1];
          }
          continue;
        }

        if (line.startsWith('#') || line.startsWith('<')) continue;

        // 这是一个 URL 行
        // 构建频道数据
        let channelUrl = line;
        // 代理模式：auto/proxy 重写为代理 URL
        const effectiveProxyMode = optProxyMode || '';
        if (effectiveProxyMode === 'proxy' || effectiveProxyMode === 'auto') {
          channelUrl = `/m3u-proxy?url=${encodeURIComponent(line)}`;
        }
        const effectivePlayerType = optPlayerType || '';
        const name = pendingName || `频道 ${channels.length + 1}`;

        const channelData = {
          name,
          url: channelUrl,
          sourceId: sourceId,
          group: optGroup || pendingGroup || '未分组',
          streamType: 'auto',
          playerType: effectivePlayerType || 'auto',
          proxyMode: effectiveProxyMode || 'auto'
        };

        // 添加 tvg-id 和 tvg-logo
        if (pendingTvgId) channelData.tvgId = pendingTvgId;
        if (pendingTvgLogo) channelData.tvgLogo = pendingTvgLogo;
        if (pendingUserAgent) channelData.userAgent = pendingUserAgent;

        // 处理 KODIPROP 信息
        if (Object.keys(pendingKodiProps).length > 0) {
          // 处理 DASH MPD 相关信息
          if (pendingKodiProps['inputstream.adaptive.manifest_type'] === 'mpd') {
            channelData.streamType = 'dash';
            channelData.playerType = 'shaka';
          }

          // 处理 ClearKey 信息（兼容 'clearkey' 和 'org.w3.clearkey' 两种写法）
          const importLicenseType = String(pendingKodiProps['inputstream.adaptive.license_type'] || '').toLowerCase();
          if ((importLicenseType === 'clearkey' || importLicenseType === 'org.w3.clearkey') && 
              pendingKodiProps['inputstream.adaptive.license_key']) {
            const licenseKey = pendingKodiProps['inputstream.adaptive.license_key'];
            const [kid, key] = licenseKey.split(':');
            if (kid && key) {
              channelData.drm = {
                clearKeys: {
                  [kid]: key
                }
              };
            }
          }
        }

        const channel = new Channel(channelData);
        channels.push(channel.toJSON());
        pendingName = '';
        pendingGroup = '';
        pendingTvgId = '';
        pendingTvgLogo = '';
        pendingKodiProps = {};
        pendingUserAgent = '';
      }

      // 根据 duplicateMode 保存频道
      if (duplicateMode === 'replace') {
        // replace 模式：旧频道已删除，直接批量新增
        for (const channelData of channels) {
          await this.storage.saveChannel(channelData);
        }
      } else {
        // skip / merge 模式：需要检测重复
        const existingChannels = await this.storage.getChannels();
        let skippedCount = 0;
        let updatedCount = 0;
        let createdCount = 0;

        for (const channelData of channels) {
          const newName = (channelData.name || '').trim().toLowerCase();
          const newUrl = (channelData.url || '').trim();

          // 按名称+URL 匹配已存在的频道
          const matchIndex = existingChannels.findIndex(c =>
            (c.name || '').trim().toLowerCase() === newName &&
            (c.url || '').trim() === newUrl
          );

          if (matchIndex >= 0) {
            if (duplicateMode === 'skip') {
              // 跳过已存在的频道
              skippedCount++;
              continue;
            } else if (duplicateMode === 'merge') {
              // 更新已有频道，保留 id 和 createdAt
              const existing = existingChannels[matchIndex];
              channelData.id = existing.id;
              channelData.createdAt = existing.createdAt;
              channelData.updatedAt = new Date().toISOString();
              Object.assign(existingChannels[matchIndex], channelData);
              updatedCount++;
              continue;
            }
          }

          // 不存在：新增
          existingChannels.push(channelData);
          createdCount++;
        }

        // 一次性写入
        await this.storage._set('channels', this.storage.channelsFile, existingChannels);
        console.log(`[SourceController] 导入完成 (mode=${duplicateMode}): 新增 ${createdCount}, 更新 ${updatedCount}, 跳过 ${skippedCount}`);
      }

      return channels;
    } catch (error) {
      console.error('[SourceController] _importChannelsFromM3U error:', error);
      throw error;
    }
  }

  // EPG 源管理
  async getEpgSources(req, res) {
    try {
      const sources = await this.storage.getSources();
      res.json({ ok: true, data: sources.epg || [] });
    } catch (error) {
      console.error('[SourceController] GetEpgSources error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取 EPG 源列表失败'
      }));
    }
  }

  async getEpgSource(req, res) {
    try {
      const { id } = req.params;
      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const source = (sources.epg || []).find(s => s.id === id || s._id === id);

      if (!source) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'EPG 源不存在'
        }));
      }

      res.json({ ok: true, data: source });
    } catch (error) {
      console.error('[SourceController] GetEpgSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取 EPG 源失败'
      }));
    }
  }

  async createEpgSource(req, res) {
    try {
      const sourceData = req.body;

      if (!sourceData.name || !sourceData.url) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '源名称和 URL 为必填项'
        }));
      }

      const existingSources = await this.storage.getSources();
      const duplicate = (existingSources.epg || []).find(
        s => s.name && s.name.trim().toLowerCase() === sourceData.name.trim().toLowerCase()
      );
      if (duplicate) {
        res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'duplicate_name',
          message: '已存在相同名称的 EPG 源：' + sourceData.name
        }));
      }

      const source = new EpgSource(sourceData);
      await this.storage.saveSource('epg', source.toJSON());

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, data: source.toJSON() }));
    } catch (error) {
      console.error('[SourceController] CreateEpgSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '创建 EPG 源失败'
      }));
    }
  }

  async updateEpgSource(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const sources = await this.storage.getSources();
      // 同时支持 id 和 _id 字段匹配
      const index = (sources.epg || []).findIndex(s => s.id === id || s._id === id);

      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'EPG 源不存在'
        }));
      }

      // 重名检查（排除自身）
      if (updateData.name) {
        const duplicate = (sources.epg || []).find(
          (s, i) => i !== index && s.name && s.name.trim().toLowerCase() === updateData.name.trim().toLowerCase()
        );
        if (duplicate) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({
            ok: false,
            error: 'duplicate_name',
            message: '已存在相同名称的 EPG 源：' + updateData.name
          }));
        }
      }

      const source = new EpgSource(sources.epg[index]);
      Object.assign(source, updateData);
      source.updatedAt = new Date().toISOString();

      await this.storage.saveSource('epg', source.toJSON());

      res.json({ ok: true, data: source.toJSON() });
    } catch (error) {
      console.error('[SourceController] UpdateEpgSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '更新 EPG 源失败'
      }));
    }
  }

  async deleteEpgSource(req, res) {
    try {
      const { id } = req.params;
      const deleted = await this.storage.deleteSource('epg', id);

      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: 'EPG 源不存在'
        }));
      }

      res.json({ ok: true, message: 'EPG 源已删除' });
    } catch (error) {
      console.error('[SourceController] DeleteEpgSource error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '删除 EPG 源失败'
      }));
    }
  }

  /**
   * 测试源 URL 可用性
   */
  async _testSourceUrl(url, userAgent = null) {
    try {
      const content = await this._fetchContent(url, userAgent, 15000);
      return {
        status: 'success',
        statusCode: 200,
        finalUrl: url,
        contentLength: content.length
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = SourceController;
