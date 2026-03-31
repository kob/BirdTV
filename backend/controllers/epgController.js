/**
 * EPG Controller - EPG 管理控制器
 */

const epgChannelModel = require('../models/EpgChannel');
const epgDataModel = require('../models/EpgData');

class EpgController {
  /**
   * 获取所有 EPG 频道配置
   */
  async getEpgChannels(req, res) {
    try {
      const channels = epgChannelModel.getAll();
      res.json({ ok: true, data: channels });
    } catch (error) {
      console.error('获取 EPG 频道列表失败:', error);
      res.status(500).json({ ok: false, message: '获取 EPG 频道列表失败', error: error.message });
    }
  }

  /**
   * 获取单个 EPG 频道配置
   */
  async getEpgChannel(req, res) {
    try {
      const { id } = req.params;
      const channel = epgChannelModel.getById(id);
      
      if (!channel) {
        return res.status(404).json({ ok: false, message: '未找到该 EPG 频道配置' });
      }
      
      res.json({ ok: true, data: channel });
    } catch (error) {
      console.error('获取 EPG 频道失败:', error);
      res.status(500).json({ ok: false, message: '获取 EPG 频道失败', error: error.message });
    }
  }

  /**
   * 添加 EPG 频道配置
   */
  async addEpgChannel(req, res) {
    try {
      const { name, epgSource, strategy, customMapping } = req.body;
      
      if (!name) {
        return res.status(400).json({ ok: false, message: '频道名称不能为空' });
      }

      const channel = epgChannelModel.add({
        name,
        epgSource,
        strategy,
        customMapping
      });
      
      res.status(201).json({ ok: true, data: channel, message: '添加成功' });
    } catch (error) {
      console.error('添加 EPG 频道失败:', error);
      res.status(500).json({ ok: false, message: '添加 EPG 频道失败', error: error.message });
    }
  }

  /**
   * 更新 EPG 频道配置
   */
  async updateEpgChannel(req, res) {
    try {
      const { id } = req.params;
      const { epgSource, strategy, customMapping } = req.body;
      
      const channel = epgChannelModel.update(id, {
        epgSource,
        strategy,
        customMapping
      });
      
      res.json({ ok: true, data: channel, message: '更新成功' });
    } catch (error) {
      console.error('更新 EPG 频道失败:', error);
      res.status(500).json({ ok: false, message: '更新 EPG 频道失败', error: error.message });
    }
  }

  /**
   * 删除 EPG 频道配置
   */
  async deleteEpgChannel(req, res) {
    try {
      const { id } = req.params;
      
      epgChannelModel.delete(id);
      res.json({ ok: true, message: '删除成功' });
    } catch (error) {
      console.error('删除 EPG 频道失败:', error);
      res.status(500).json({ ok: false, message: '删除 EPG 频道失败', error: error.message });
    }
  }

  /**
   * 获取频道当前节目信息
   */
  async getCurrentProgram(req, res) {
    try {
      const { channelName } = req.params;
      
      // 获取 EPG 频道配置
      const channelConfig = epgChannelModel.getByName(channelName);
      
      let strategy = 'auto';
      let epgSource = null;
      let customMapping = null;
      
      if (channelConfig) {
        strategy = channelConfig.strategy;
        epgSource = channelConfig.epgSource;
        
        if (strategy === 'custom' && channelConfig.customMapping) {
          customMapping = epgChannelModel.parseCustomMapping(channelConfig);
        }
      }
      
      // 获取节目数据
      const programs = await epgDataModel.getChannelPrograms(
        channelName, 
        strategy, 
        epgSource, 
        customMapping
      );
      
      if (programs.length === 0) {
        return res.json({ ok: true, data: [] });
      }
      
      // 更新最后更新时间
      if (channelConfig) {
        epgChannelModel.updateLastUpdate(channelConfig.id);
      }
      
      res.json({ ok: true, data: programs });
    } catch (error) {
      console.error('获取节目信息失败:', error);
      res.status(500).json({ ok: false, message: '获取节目信息失败', error: error.message });
    }
  }

  /**
   * 获取频道正在播放和下一个节目
   */
  async getNowAndNext(req, res) {
    try {
      const { channelName } = req.params;
      
      // 获取 EPG 频道配置
      const channelConfig = epgChannelModel.getByName(channelName);
      
      let strategy = 'auto';
      let epgSource = null;
      let customMapping = null;
      
      if (channelConfig) {
        strategy = channelConfig.strategy;
        epgSource = channelConfig.epgSource;
        
        if (strategy === 'custom' && channelConfig.customMapping) {
          customMapping = epgChannelModel.parseCustomMapping(channelConfig);
        }
      }
      
      // 获取节目数据
      const programs = await epgDataModel.getChannelPrograms(
        channelName, 
        strategy, 
        epgSource, 
        customMapping
      );
      
      if (programs.length === 0) {
        return res.json({ 
          ok: true, 
          data: { 
            nowPlaying: null, 
            nextPlaying: null 
          } 
        });
      }
      
      // 获取当前和下一个节目
      const nowPlaying = epgDataModel.getCurrentProgram(programs);
      const nextPlaying = epgDataModel.getNextProgram(programs);
      
      // 更新最后更新时间
      if (channelConfig) {
        epgChannelModel.updateLastUpdate(channelConfig.id);
      }
      
      res.json({ 
        ok: true, 
        data: { 
          nowPlaying: nowPlaying || null, 
          nextPlaying: nextPlaying || null 
        } 
      });
    } catch (error) {
      console.error('获取节目信息失败:', error);
      res.status(500).json({ ok: false, message: '获取节目信息失败', error: error.message });
    }
  }

  /**
   * 刷新 EPG 缓存
   */
  async refreshEpgCache(req, res) {
    try {
      epgDataModel.cleanupCache();
      res.json({ ok: true, message: '缓存已清理' });
    } catch (error) {
      console.error('刷新缓存失败:', error);
      res.status(500).json({ ok: false, message: '刷新缓存失败', error: error.message });
    }
  }

  /**
   * 获取所有分组
   */
  async getGroups(req, res) {
    try {
      const groups = epgChannelModel.getAllGroups();
      res.json({ ok: true, data: groups });
    } catch (error) {
      console.error('获取分组失败:', error);
      res.status(500).json({ ok: false, message: '获取分组失败', error: error.message });
    }
  }

  /**
   * 批量设置分组
   */
  async batchSetGroup(req, res) {
    try {
      const { ids, group } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ ok: false, message: '请选择要设置的频道' });
      }
      
      const updatedCount = epgChannelModel.batchSetGroup(ids, group);
      res.json({ ok: true, message: `成功更新 ${updatedCount} 个频道的分组`, data: { updatedCount } });
    } catch (error) {
      console.error('批量设置分组失败:', error);
      res.status(500).json({ ok: false, message: '批量设置分组失败', error: error.message });
    }
  }
}

module.exports = new EpgController();
