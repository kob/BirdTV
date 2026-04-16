/**
 * 源管理路由 - Express Router 版
 * 方法名与 SourceController 完全对应
 */
const express = require('express');
const formidable = require('formidable');

function createSourcesRouter(sourceController) {
  const router = express.Router();

  // M3U 源
  router.get('/m3u', (req, res) => sourceController.getM3uSources(req, res));
  router.post('/m3u', (req, res) => sourceController.createM3uSource(req, res));
  router.get('/m3u/parse', (req, res) => sourceController.parseM3uUrl(req, res));
  router.post('/m3u/parse', (req, res) => sourceController.parseM3uUrl(req, res));
  router.post('/m3u/upload', (req, res) => {
    // 文件上传用 formidable 处理
    const form = formidable({ multiples: true });
    form.parse(req, (err, fields, files) => {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      req.body = fields;
      req.files = files;
      sourceController.parseM3uFile(req, res);
    });
  });
  router.get('/m3u/:id', (req, res) => sourceController.getM3uSource(req, res));
  router.put('/m3u/:id', (req, res) => sourceController.updateM3uSource(req, res));
  router.delete('/m3u/:id', (req, res) => sourceController.deleteM3uSource(req, res));
  router.post('/m3u/:id/test', (req, res) => sourceController.testM3uSource(req, res));
  router.get('/m3u/:id/channels', (req, res) => sourceController.getM3uSourceChannels(req, res));
  router.post('/m3u/:id/import', (req, res) => sourceController.importM3uSource(req, res));

  // EPG 源
  router.get('/epg', (req, res) => sourceController.getEpgSources(req, res));
  router.post('/epg', (req, res) => sourceController.createEpgSource(req, res));
  router.get('/epg/:id', (req, res) => sourceController.getEpgSource(req, res));
  router.put('/epg/:id', (req, res) => sourceController.updateEpgSource(req, res));
  router.delete('/epg/:id', (req, res) => sourceController.deleteEpgSource(req, res));

  return router;
}

module.exports = { createSourcesRouter };
