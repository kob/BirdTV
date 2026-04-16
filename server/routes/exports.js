/**
 * 导出路由 - Express Router 版
 * 方法名与 ExportController 完全对应
 */
const express = require('express');

function createExportsRouter(exportController) {
  const router = express.Router();

  router.post('/export', (req, res) => exportController.exportChannels(req, res));
  router.get('/download', (req, res) => exportController.downloadExport(req, res));
  router.get('/list', (req, res) => exportController.listExports(req, res));
  router.delete('/:id', (req, res) => exportController.deleteExport(req, res));
  router.post('/cleanup', (req, res) => exportController.cleanupExpired(req, res));

  // 订阅链接管理
  router.post('/link', (req, res) => exportController.createLink(req, res));
  router.get('/links', (req, res) => exportController.listLinks(req, res));
  router.get('/link/:id', (req, res) => exportController.downloadByShortCode(req, res));
  router.put('/link/:id', (req, res) => exportController.updateLink(req, res));
  router.delete('/link/:id', (req, res) => exportController.deleteLink(req, res));

  return router;
}

module.exports = { createExportsRouter };
