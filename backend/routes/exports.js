const authMiddleware = require('../middleware/auth');

// 导出路由处理
function createExportsRoutes(controller) {
  return async function exportsRoutes(req, res) {
    if (!controller) {
      res.status(500).json({ ok: false, message: 'Controller not initialized' });
      return;
    }

    const url = req.url;
    const method = req.method;

    // 批量导出频道 (需要认证)
    if (url === '/api/exports/export' && method === 'POST') {
      if (!req.user) {
        res.status(401).json({ ok: false, message: 'Unauthorized' });
        return;
      }
      await controller.exportChannels(req, res);
      return;
    }

    // 下载导出文件 (公开但需要token)
    if (url === '/api/exports/download' && method === 'GET') {
      await controller.downloadExport(req, res);
      return;
    }

    // 列出所有导出记录 (需要认证)
    if (url === '/api/exports/list' && method === 'GET') {
      if (!req.user) {
        res.status(401).json({ ok: false, message: 'Unauthorized' });
        return;
      }
      await controller.listExports(req, res);
      return;
    }

    // 删除导出记录 (需要认证)
    if (url.match(/^\/api\/exports\/[a-f0-9_]+$/) && method === 'DELETE') {
      if (!req.user) {
        res.status(401).json({ ok: false, message: 'Unauthorized' });
        return;
      }
      const id = url.split('/').pop();
      req.params = { id };
      await controller.deleteExport(req, res);
      return;
    }

    // 清理过期导出 (需要认证)
    if (url === '/api/exports/cleanup' && method === 'POST') {
      if (!req.user) {
        res.status(401).json({ ok: false, message: 'Unauthorized' });
        return;
      }
      await controller.cleanupExpired(req, res);
      return;
    }

    // 404
    res.status(404).json({ ok: false, message: 'Not found' });
  };
}

module.exports = createExportsRoutes;
