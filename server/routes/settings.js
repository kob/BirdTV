/**
 * 设置路由 - Express Router 版
 * 方法名与 SettingsController 完全对应
 */
const express = require('express');

function createSettingsRouter(settingsController) {
  const router = express.Router();

  router.get('/', (req, res) => settingsController.getSettings(req, res));
  router.put('/', (req, res) => settingsController.updateSettings(req, res));
  router.get('/categories', (req, res) => settingsController.getCategories(req, res));

  // UA 管理
  router.get('/ua/global', (req, res) => settingsController.getGlobalUA(req, res));
  router.post('/ua/global', (req, res) => settingsController.setGlobalUA(req, res));
  router.get('/ua/channel', (req, res) => settingsController.getChannelUA(req, res));
  router.post('/ua/channel', (req, res) => settingsController.setChannelUA(req, res));
  router.get('/ua/effective', (req, res) => settingsController.getEffectiveUA(req, res));

  // 数据同步
  router.get('/sync/info', (req, res) => settingsController.getSyncInfo(req, res));
  router.post('/sync/redis', (req, res) => settingsController.syncToRedis(req, res));
  router.post('/sync/file', (req, res) => settingsController.syncFromFile(req, res));

  return router;
}

module.exports = { createSettingsRouter };
