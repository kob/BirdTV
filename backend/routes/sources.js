/**
 * 源配置路由
 */
function createSourcesRoutes(sourceController) {
  return function sourcesRoutes(req, res, next) {
    const { method, url, body } = req;

    // M3U 源路由

    // GET /api/sources/m3u - 获取 M3U 源列表
    if (url === '/api/sources/m3u' && method === 'GET') {
      return sourceController.getM3uSources(req, res);
    }

    // POST /api/sources/m3u - 创建 M3U 源
    if (url === '/api/sources/m3u' && method === 'POST') {
      return sourceController.createM3uSource(req, res);
    }

    // POST /api/sources/m3u/:id/import - 从 M3U 源导入频道（必须在 /:id 之前）
    const importM3uMatch = url.match(/^\/api\/sources\/m3u\/([^/]+)\/import$/);
    if (importM3uMatch && method === 'POST') {
      const id = importM3uMatch[1];
      req.params = { id };
      return sourceController.importM3uSource(req, res);
    }

    // POST /api/sources/m3u/:id/test - 测试 M3U 源（必须在 /:id 之前）
    const testM3uMatch = url.match(/^\/api\/sources\/m3u\/([^/]+)\/test$/);
    if (testM3uMatch && method === 'POST') {
      const id = testM3uMatch[1];
      req.params = { id };
      return sourceController.testM3uSource(req, res);
    }

    // GET /api/sources/m3u/:id/channels - 获取 M3U 源的频道列表（必须在 /:id 之前）
    const channelsM3uMatch = url.match(/^\/api\/sources\/m3u\/([^/]+)\/channels$/);
    if (channelsM3uMatch && method === 'GET') {
      const id = channelsM3uMatch[1];
      req.params = { id };
      return sourceController.getM3uSourceChannels(req, res);
    }

    // POST /api/sources/m3u/parse - 解析 M3U 链接并返回频道列表
    if (url === '/api/sources/m3u/parse' && method === 'POST') {
      return sourceController.parseM3uUrl(req, res);
    }

    // GET /api/sources/m3u/:id - 获取 M3U 源详情
    const m3uMatch = url.match(/^\/api\/sources\/m3u\/([^/]+)$/);
    if (m3uMatch && method === 'GET') {
      const id = m3uMatch[1];
      req.params = { id };
      return sourceController.getM3uSource(req, res);
    }

    // PUT /api/sources/m3u/:id - 更新 M3U 源
    if (m3uMatch && method === 'PUT') {
      const id = m3uMatch[1];
      req.params = { id };
      return sourceController.updateM3uSource(req, res);
    }

    // DELETE /api/sources/m3u/:id - 删除 M3U 源
    if (m3uMatch && method === 'DELETE') {
      const id = m3uMatch[1];
      req.params = { id };
      return sourceController.deleteM3uSource(req, res);
    }

    // EPG 源路由

    // GET /api/sources/epg - 获取 EPG 源列表
    if (url === '/api/sources/epg' && method === 'GET') {
      return sourceController.getEpgSources(req, res);
    }

    // POST /api/sources/epg - 创建 EPG 源
    if (url === '/api/sources/epg' && method === 'POST') {
      return sourceController.createEpgSource(req, res);
    }

    // GET /api/sources/epg/:id - 获取 EPG 源详情
    const epgMatch = url.match(/^\/api\/sources\/epg\/([^/]+)$/);
    if (epgMatch && method === 'GET') {
      const id = epgMatch[1];
      req.params = { id };
      return sourceController.getEpgSource(req, res);
    }

    // PUT /api/sources/epg/:id - 更新 EPG 源
    if (epgMatch && method === 'PUT') {
      const id = epgMatch[1];
      req.params = { id };
      return sourceController.updateEpgSource(req, res);
    }

    // DELETE /api/sources/epg/:id - 删除 EPG 源
    if (epgMatch && method === 'DELETE') {
      const id = epgMatch[1];
      req.params = { id };
      return sourceController.deleteEpgSource(req, res);
    }

    // 继续处理下一个路由
    next();
  };
}

module.exports = createSourcesRoutes;
