ji/**
 * 设置控制器
 */
const UAManager = require('../managers/uaManager');

class SettingsController {
  constructor(storage) {
    this.storage = storage;
    this.uaManager = new UAManager(storage);
    this.uaManager.initialize().catch(err => console.error('[SettingsController] UA初始化失败:', err));
  }

  // ─── UA 管理 API ───

  async getGlobalUA(req, res) {
    try {
      const ua = this.uaManager.getGlobalUA();
      res.json({ ok: true, userAgent: ua });
    } catch (error) {
      console.error('[SettingsController] getGlobalUA error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '获取全局UA失败' }));
    }
  }

  async setGlobalUA(req, res) {
    try {
      const { userAgent } = req.body;
      if (typeof userAgent !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'userAgent 必须为字符串' }));
        return;
      }
      await this.uaManager.setGlobalUA(userAgent);
      res.json({ ok: true, userAgent });
    } catch (error) {
      console.error('[SettingsController] setGlobalUA error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '设置全局UA失败' }));
    }
  }

  async getChannelUA(req, res) {
    try {
      const channelId = req.query.channelId;
      if (!channelId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '缺少 channelId' }));
        return;
      }
      const ua = await this.uaManager.getChannelUA(channelId);
      res.json({ ok: true, userAgent: ua });
    } catch (error) {
      console.error('[SettingsController] getChannelUA error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '获取频道UA失败' }));
    }
  }

  async setChannelUA(req, res) {
    try {
      const { channelId, userAgent } = req.body;
      if (!channelId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '缺少 channelId' }));
        return;
      }
      await this.uaManager.setChannelUA(channelId, userAgent || null);
      res.json({ ok: true, channelId, userAgent: userAgent || null });
    } catch (error) {
      console.error('[SettingsController] setChannelUA error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '设置频道UA失败' }));
    }
  }

  async getEffectiveUA(req, res) {
    try {
      const channelId = req.query.channelId || null;
      const ua = await this.uaManager.getEffectiveUA(channelId);
      res.json({ ok: true, userAgent: ua });
    } catch (error) {
      console.error('[SettingsController] getEffectiveUA error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '获取有效UA失败' }));
    }
  }

  // ─── 原有设置 API ───

  async getSettings(req, res) {
    try {
      const settings = await this.storage.getSettings();
      res.json({ ok: true, data: settings });
    } catch (error) {
      console.error('[SettingsController] GetSettings error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取设置失败'
      }));
    }
  }

  async updateSettings(req, res) {
    try {
      const updates = req.body;
      const currentSettings = await this.storage.getSettings();
      
      // 合并设置
      const newSettings = { ...currentSettings, ...updates, updatedAt: new Date().toISOString() };
      
      await this.storage.saveSettings(newSettings);

      res.json({ ok: true, data: newSettings });
    } catch (error) {
      console.error('[SettingsController] UpdateSettings error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '更新设置失败'
      }));
    }
  }

  async getCategories(req, res) {
    try {
      const categories = [
        { id: 'general', name: '通用设置', items: ['language', 'theme', 'autoplay'] },
        { id: 'proxy', name: '代理设置', items: ['proxyEnabled', 'proxyUrl', 'timeout'] },
        { id: 'player', name: '播放器设置', items: ['defaultPlayer', 'vlcPath', 'networkCache'] },
        { id: 'epg', name: 'EPG 设置', items: ['epgEnabled', 'defaultEpgSource'] },
        { id: 'cache', name: '缓存设置', items: ['cacheEnabled', 'cacheTtl'] },
        { id: 'security', name: '安全设置', items: ['authEnabled', 'sessionTimeout'] }
      ];

      res.json({ ok: true, data: categories });
    } catch (error) {
      console.error('[SettingsController] GetCategories error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取设置分类失败'
      }));
    }
  }

  // ─── 数据同步 API ───

  /**
   * 获取同步信息
   */
  async getSyncInfo(req, res) {
    try {
      res.json({
        ok: true,
        data: {
          redisPrefix: this.storage.redisPrefix,
          redisReady: this.storage.redisReady,
          serverId: process.env.SERVER_ID || 'default'
        }
      });
    } catch (error) {
      console.error('[SettingsController] getSyncInfo error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取同步信息失败'
      }));
    }
  }

  /**
   * 同步文件到 Redis
   */
  async syncToRedis(req, res) {
    try {
      const result = await this.storage._syncFilesToRedis();
      res.json({
        ok: true,
        message: '数据同步到 Redis 成功',
        data: {
          redisPrefix: this.storage.redisPrefix,
          serverId: process.env.SERVER_ID || 'default'
        }
      });
    } catch (error) {
      console.error('[SettingsController] syncToRedis error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '同步到 Redis 失败: ' + error.message
      }));
    }
  }

  /**
   * 从 Redis 同步到文件
   */
  async syncFromFile(req, res) {
    try {
      const keys = ['channels', 'm3uSources', 'epgSources', 'settings'];
      const results = [];

      for (const key of keys) {
        const redisKey = this.storage.redisPrefix + key;
        const exists = await this.storage.redisClient.exists(redisKey);

        if (exists) {
          const data = await this.storage.redisClient.get(redisKey);
          const parsedData = JSON.parse(data);

          // 写入文件
          const filePath = {
            channels: this.storage.channelsFile,
            m3uSources: this.storage.m3uSourcesFile,
            epgSources: this.storage.epgSourcesFile,
            settings: this.storage.settingsFile
          }[key];

          await this.storage._writeFile(filePath, parsedData);
          results.push({ key, success: true });
        } else {
          results.push({ key, success: false, reason: 'Redis 中无数据' });
        }
      }

      res.json({
        ok: true,
        message: '从 Redis 同步到文件成功',
        data: {
          redisPrefix: this.storage.redisPrefix,
          serverId: process.env.SERVER_ID || 'default',
          results
        }
      });
    } catch (error) {
      console.error('[SettingsController] syncFromFile error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '从 Redis 同步失败: ' + error.message
      }));
    }
  }
}

module.exports = SettingsController;
