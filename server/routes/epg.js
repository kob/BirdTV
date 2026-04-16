/**
 * EPG 路由 - Express Router 版
 * epgController 导出的是单例实例（不是类）
 */
const express = require('express');
const epgController = require('../../backend/controllers/epgController');

function createEpgRouter(storage) {
  const router = express.Router();

  router.get('/channels', (req, res) => epgController.getEpgChannels(req, res));
  router.post('/channels', (req, res) => epgController.addEpgChannel(req, res));
  router.get('/channels/:id', (req, res) => epgController.getEpgChannel(req, res));
  router.put('/channels/:id', (req, res) => epgController.updateEpgChannel(req, res));
  router.delete('/channels/:id', (req, res) => epgController.deleteEpgChannel(req, res));
  router.get('/now/:channelName', (req, res) => epgController.getCurrentProgram(req, res));
  router.get('/now-next/:channelName', (req, res) => epgController.getNowAndNext(req, res));
  router.post('/cache/refresh', (req, res) => epgController.refreshEpgCache(req, res));
  router.get('/groups', (req, res) => epgController.getGroups(req, res));
  router.post('/batch-set-group', (req, res) => epgController.batchSetGroup(req, res));

  return router;
}

module.exports = { createEpgRouter };
