/**
 * EPG Routes - EPG 管理路由
 */

const express = require('express');
const router = express.Router();
const epgController = require('../controllers/epgController');

/**
 * @route   GET /api/epg/channels
 * @desc    获取所有 EPG 频道配置
 */
router.get('/channels', (req, res) => {
  epgController.getEpgChannels(req, res);
});

/**
 * @route   GET /api/epg/channels/:id
 * @desc    获取单个 EPG 频道配置
 */
router.get('/channels/:id', (req, res) => {
  epgController.getEpgChannel(req, res);
});

/**
 * @route   POST /api/epg/channels
 * @desc    添加 EPG 频道配置
 */
router.post('/channels', (req, res) => {
  epgController.addEpgChannel(req, res);
});

/**
 * @route   PUT /api/epg/channels/:id
 * @desc    更新 EPG 频道配置
 */
router.put('/channels/:id', (req, res) => {
  epgController.updateEpgChannel(req, res);
});

/**
 * @route   DELETE /api/epg/channels/:id
 * @desc    删除 EPG 频道配置
 */
router.delete('/channels/:id', (req, res) => {
  epgController.deleteEpgChannel(req, res);
});

/**
 * @route   GET /api/epg/now/:channelName
 * @desc    获取频道当前节目信息
 */
router.get('/now/:channelName', (req, res) => {
  epgController.getCurrentProgram(req, res);
});

/**
 * @route   GET /api/epg/now-next/:channelName
 * @desc    获取频道正在播放和下一个节目
 */
router.get('/now-next/:channelName', (req, res) => {
  epgController.getNowAndNext(req, res);
});

/**
 * @route   POST /api/epg/cache/refresh
 * @desc    刷新 EPG 缓存
 */
router.post('/cache/refresh', (req, res) => {
  epgController.refreshEpgCache(req, res);
});

/**
 * @route   GET /api/epg/groups
 * @desc    获取所有分组
 */
router.get('/groups', (req, res) => {
  epgController.getGroups(req, res);
});

/**
 * @route   POST /api/epg/batch-set-group
 * @desc    批量设置分组
 */
router.post('/batch-set-group', (req, res) => {
  epgController.batchSetGroup(req, res);
});

module.exports = router;
