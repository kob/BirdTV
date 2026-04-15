const Channel = require('../models/Channel');

/**
 * 频道控制器
 */
class ChannelController {
  constructor(storage) {
    this.storage = storage;
  }

  async getChannels(req, res) {
    try {
      // 支持分页参数（兼容 URLSearchParams 和普通对象两种格式）
      const _q = req.query && typeof req.query.get === 'function' ? req.query : (req.query || {});
      const page = parseInt(_q.get ? _q.get('page') : _q.page) || 1;
      const limitRaw = _q.get ? _q.get('limit') : _q.limit;
      // limit=0 表示无限制，否则默认50
      let limit = 50;
      if (limitRaw !== undefined && limitRaw !== null && limitRaw !== '') {
        const parsed = parseInt(limitRaw);
        if (!isNaN(parsed)) {
          limit = parsed;
        }
      }
      const offset = (page - 1) * limit;
      const group = (_q.get ? _q.get('group') : _q.group) || null;

      let channels = await this.storage.getChannels();
      const sources = await this.storage.getSources();
      const m3uSources = sources.m3u || [];

      // 按分组筛选
      if (group) {
        channels = channels.filter(ch => ch.group === group);
      }

      // 计算总数
      const total = channels.length;

      // 分页处理（limit=0 表示无限制，返回全部）
      const paginatedChannels = limit === 0 ? channels : channels.slice(offset, offset + limit);

      // 为每个频道添加源的默认播放器和代理模式信息
      const enrichedChannels = paginatedChannels.map(channel => {
        if (channel.sourceId) {
          const source = m3uSources.find(s => s.id === channel.sourceId);
          if (source) {
            return {
              ...channel,
              sourceDefaultPlayerType: source.defaultPlayerType || channel.defaultPlayerType,
              sourceProxyMode: source.proxyMode || channel.proxyMode,
              sourceName: source.name
            };
          }
        }
        // 独立导入的频道（无 sourceId），将自身 proxyMode 映射为 sourceProxyMode
        return {
          ...channel,
          sourceDefaultPlayerType: channel.playerType || channel.defaultPlayerType || undefined,
          sourceProxyMode: channel.proxyMode || undefined
        };
      });

      res.json({
        ok: true,
        data: enrichedChannels,
        pagination: {
          page: limit === 0 ? 1 : page,
          limit,
          total,
          totalPages: limit === 0 ? 1 : Math.ceil(total / limit),
          hasMore: limit === 0 ? false : offset + limit < total
        }
      });
    } catch (error) {
      console.error('[ChannelController] GetChannels error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取频道列表失败'
      }));
    }
  }

  async getChannel(req, res) {
    try {
      const { id } = req.params;
      const channels = await this.storage.getChannels();
      const channel = channels.find(c => c.id === id);

      if (!channel) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: '频道不存在'
        }));
      }

      res.json({ ok: true, data: channel });
    } catch (error) {
      console.error('[ChannelController] GetChannel error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取频道失败'
      }));
    }
  }

  async createChannel(req, res) {
    try {
      const channelData = req.body;
      
      // 验证必需字段
      if (!channelData.name || !channelData.url) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '频道名称和 URL 为必填项'
        }));
      }

      const channel = new Channel(channelData);
      await this.storage.saveChannel(channel.toJSON());

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, data: channel.toJSON() }));
    } catch (error) {
      console.error('[ChannelController] CreateChannel error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '创建频道失败'
      }));
    }
  }

  async updateChannel(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const channels = await this.storage.getChannels();
      const index = channels.findIndex(c => c.id === id);

      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: '频道不存在'
        }));
      }

      const channel = new Channel(channels[index]);
      channel.update(updateData);

      await this.storage.saveChannel(channel.toJSON());

      res.json({ ok: true, data: channel.toJSON() });
    } catch (error) {
      console.error('[ChannelController] UpdateChannel error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '更新频道失败'
      }));
    }
  }

  async deleteChannel(req, res) {
    try {
      const { id } = req.params;
      const deleted = await this.storage.deleteChannel(id);

      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: '频道不存在'
        }));
      }

      res.json({ ok: true, message: '频道已删除' });
    } catch (error) {
      console.error('[ChannelController] DeleteChannel error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '删除频道失败'
      }));
    }
  }

  async batchImportChannels(req, res) {
    try {
      const { channels } = req.body;

      if (!Array.isArray(channels) || channels.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: 'channels 必须是非空数组'
        }));
      }

      const existingChannels = await this.storage.getChannels();
      let updatedCount = 0;
      let createdCount = 0;
      const results = [];

      for (const channelData of channels) {
        try {
          // 按 sourceId + tvgId + name 三项匹配已有频道
          const newSourceId = channelData.sourceId || '';
          const newTvgId = channelData.tvgId || '';
          const newName = (channelData.name || '').trim().toLowerCase();

          const matchIndex = existingChannels.findIndex(c =>
            (c.sourceId || '') === newSourceId &&
            (c.tvgId || '') === newTvgId &&
            (c.name || '').trim().toLowerCase() === newName
          );

          if (matchIndex >= 0) {
            // 已存在：保留原有 id 和 createdAt，更新其他字段
            const existing = existingChannels[matchIndex];
            const channel = new Channel(channelData);
            channel.id = existing.id;
            channel.createdAt = existing.createdAt;
            channel.updatedAt = new Date().toISOString();
            existingChannels[matchIndex] = channel.toJSON();
            results.push({ success: true, id: channel.id, action: 'updated' });
            updatedCount++;
            console.log(`[BatchImport] UPDATE channel "${channelData.name}" id=${channel.id} (sourceId=${newSourceId}, tvgId=${newTvgId})`);
          } else {
            // 不存在：新增频道
            const channel = new Channel(channelData);
            existingChannels.push(channel.toJSON());
            results.push({ success: true, id: channel.id, action: 'created' });
            createdCount++;
            console.log(`[BatchImport] CREATE channel "${channelData.name}" id=${channel.id} (sourceId=${newSourceId}, tvgId=${newTvgId})`);
          }
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }

      // 一次性写入所有频道（避免循环中多次读写文件）
      await this.storage._set('channels', this.storage.channelsFile, existingChannels);

      const successCount = results.filter(r => r.success).length;
      res.json({
        ok: true,
        data: {
          total: channels.length,
          success: successCount,
          failed: channels.length - successCount,
          created: createdCount,
          updated: updatedCount,
          results
        }
      });
    } catch (error) {
      console.error('[ChannelController] BatchImport error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '批量导入失败'
      }));
    }
  }

  async searchChannels(req, res) {
    try {
      // 兼容 URLSearchParams 和普通对象两种格式
      const _q = req.query && typeof req.query.get === 'function' ? req.query : (req.query || {});
      const q = _q.get ? _q.get('q') : _q.q;
      const streamType = _q.get ? _q.get('streamType') : _q.streamType;
      const playerType = _q.get ? _q.get('playerType') : _q.playerType;
      const channels = await this.storage.getChannels();

      let filtered = channels;

      // 关键词搜索
      if (q) {
        const query = q.toLowerCase();
        filtered = filtered.filter(c =>
          c.name.toLowerCase().includes(query) ||
          c.url.toLowerCase().includes(query)
        );
      }

      // 流类型筛选
      if (streamType) {
        filtered = filtered.filter(c => c.streamType === streamType);
      }

      // 播放器类型筛选
      if (playerType) {
        filtered = filtered.filter(c => c.playerType === playerType);
      }

      res.json({ ok: true, data: filtered });
    } catch (error) {
      console.error('[ChannelController] SearchChannels error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '搜索频道失败'
      }));
    }
  }

  async batchDeleteChannels(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: 'ids 必须是非空数组'
        }));
      }

      // 优化：使用批量删除方法，只读写文件一次
      const result = await this.storage.batchDeleteChannels(ids);

      res.json({
        ok: true,
        data: {
          total: ids.length,
          success: result.deletedCount,
          failed: ids.length - result.deletedCount,
          results: result.results
        }
      });
    } catch (error) {
      console.error('[ChannelController] BatchDelete error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '批量删除失败'
      }));
    }
  }

  async batchUpdateChannels(req, res) {
    try {
      const { ids, data } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: 'ids 必须是非空数组'
        }));
      }

      if (!data || typeof data !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: 'data 必须是非空对象'
        }));
      }

      // 优化：只读取一次所有频道，批量更新，只写入一次
      const allChannels = await this.storage.getChannels();
      const idsSet = new Set(ids);
      const results = [];
      let updatedCount = 0;

      // 批量更新频道
      for (const channel of allChannels) {
        if (idsSet.has(channel.id)) {
          try {
            const channelObj = new Channel(channel);
            channelObj.update(data);
            channelObj.updatedAt = new Date().toISOString();
            // 更新数组中的对象（原地修改）
            Object.assign(channel, channelObj.toJSON());
            results.push({ success: true, id: channel.id });
            updatedCount++;
          } catch (error) {
            results.push({ success: false, error: error.message, id: channel.id });
          }
        }
      }

      // 一次性写入所有频道（避免循环中多次读写文件）
      await this.storage._set('channels', this.storage.channelsFile, allChannels);

      const successCount = results.filter(r => r.success).length;
      res.json({
        ok: true,
        data: {
          total: ids.length,
          success: successCount,
          failed: ids.length - successCount,
          updated: updatedCount,
          results
        }
      });
    } catch (error) {
      console.error('[ChannelController] BatchUpdate error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '批量更新失败'
      }));
    }
  }

  async getGroups(req, res) {
    try {
      const channels = await this.storage.getChannels();
      const groups = [...new Set(channels.map(ch => ch.group || '未分组').filter(Boolean))];
      // 合并自定义分组
      const settings = await this.storage.getSettings();
      const customGroups = settings.customGroups || [];
      const allGroups = [...new Set([...groups, ...customGroups])];
      res.json({ ok: true, data: allGroups.sort() });
    } catch (error) {
      console.error('[ChannelController] GetGroups error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取分组列表失败'
      }));
    }
  }

  async addGroup(req, res) {
    try {
      const { groupName } = req.body;
      if (!groupName || !groupName.trim()) {
        return res.status(400).json({ ok: false, message: '分组名称不能为空' });
      }
      const settings = await this.storage.getSettings();
      if (!settings.customGroups) settings.customGroups = [];
      if (settings.customGroups.includes(groupName.trim())) {
        return res.json({ ok: false, message: '该分组已存在' });
      }
      settings.customGroups.push(groupName.trim());
      await this.storage.saveSettings(settings);
      res.json({ ok: true, message: '分组添加成功' });
    } catch (error) {
      console.error('[ChannelController] addGroup error:', error);
      res.status(500).json({ ok: false, message: '添加分组失败' });
    }
  }

  async deleteGroupFromSettings(req, res) {
    try {
      const { groupName } = req.body;
      const settings = await this.storage.getSettings();
      if (!settings.customGroups) {
        return res.json({ ok: true, message: '没有自定义分组' });
      }
      settings.customGroups = settings.customGroups.filter(g => g !== groupName);
      await this.storage.saveSettings(settings);
      res.json({ ok: true, message: '分组删除成功' });
    } catch (error) {
      console.error('[ChannelController] deleteGroup error:', error);
      res.status(500).json({ ok: false, message: '删除分组失败' });
    }
  }
}

module.exports = ChannelController;
