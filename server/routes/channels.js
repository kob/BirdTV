/**
 * 频道路由 - Express Router 版
 * 方法名与 ChannelController 完全对应
 */
const express = require('express');

function createChannelsRouter(channelController) {
  const router = express.Router();

  router.get('/', (req, res) => channelController.getChannels(req, res));
  router.get('/search', (req, res) => channelController.searchChannels(req, res));
  router.post('/', (req, res) => channelController.createChannel(req, res));
  router.get('/groups', (req, res) => channelController.getGroups(req, res));
  router.post('/groups', (req, res) => channelController.addGroup(req, res));
  router.delete('/groups', (req, res) => channelController.deleteGroupFromSettings(req, res));
  router.post('/batch', (req, res) => channelController.batchImportChannels(req, res));
  router.post('/batch/delete', (req, res) => channelController.batchDeleteChannels(req, res));
  router.post('/batch/update', (req, res) => channelController.batchUpdateChannels(req, res));
  router.get('/:id', (req, res) => channelController.getChannel(req, res));
  router.put('/:id', (req, res) => channelController.updateChannel(req, res));
  router.delete('/:id', (req, res) => channelController.deleteChannel(req, res));

  return router;
}

module.exports = { createChannelsRouter };
