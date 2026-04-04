const fs = require('fs').promises;
const path = require('path');

/**
 * 数据存储服务 - Redis 优先，JSON 文件降级
 */
class StorageService {
  constructor(dataDir, redisConfig = null) {
    this.dataDir = dataDir;
    this.channelsFile = path.join(dataDir, 'channels.json');
    this.usersFile = path.join(dataDir, 'users.json');
    this.m3uSourcesFile = path.join(dataDir, 'm3u-sources.json');
    this.epgSourcesFile = path.join(dataDir, 'epg-sources.json');
    this.settingsFile = path.join(dataDir, 'settings.json');

    this.redisClient = null;
    this.redisReady = false;
    this.redisConfig = redisConfig;
    // 支持通过环境变量设置数据隔离前缀，默认为 birdtv:storage
    this.redisPrefix = process.env.REDIS_DATA_PREFIX || 'birdtv:storage:';
    // 支持通过环境变量设置服务器标识，避免多服务器冲突
    this.serverId = process.env.SERVER_ID || 'default';
    console.log(`[StorageService] 使用 Redis 前缀: ${this.redisPrefix}, 服务器标识: ${this.serverId}`);
  }

  /**
   * 初始化数据目录、文件和 Redis 连接
   */
  async init() {
    // 尝试连接 Redis
    if (this.redisConfig && this.redisConfig.host) {
      try {
        const Redis = require('redis');
        this.redisClient = Redis.createClient({
          socket: {
            host: this.redisConfig.host,
            port: parseInt(this.redisConfig.port) || 6379
          },
          password: this.redisConfig.password || undefined,
          database: parseInt(this.redisConfig.db) || 0
        });

        this.redisClient.on('error', (err) => {
          console.warn('[StorageService] Redis 连接异常:', err.message);
          this.redisReady = false;
        });

        await this.redisClient.connect();
        this.redisReady = true;
        console.log('[StorageService] Redis 连接成功，使用 Redis 存储');
      } catch (error) {
        console.warn('[StorageService] Redis 连接失败:', error.message);
        console.log('[StorageService] 降级使用 JSON 文件存储');
        this.redisReady = false;
      }
    } else {
      console.log('[StorageService] 未配置 Redis，使用 JSON 文件存储');
    }

    // 初始化本地文件（作为降级/备份）
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this._initFile(this.channelsFile, []);
      await this._initFile(this.m3uSourcesFile, []);
      await this._initFile(this.epgSourcesFile, []);
      await this._initFile(this.settingsFile, this._getDefaultSettings());
    } catch (error) {
      console.error('[StorageService] 本地文件初始化失败:', error);
    }

    // 如果 Redis 可用，将本地文件同步到 Redis（首次启动时）
    if (this.redisReady) {
      await this._syncFilesToRedis();
    }

    console.log('[StorageService] 数据存储初始化完成');
  }

  /**
   * 首次连接 Redis 时，将本地文件数据同步到 Redis
   */
  async _syncFilesToRedis() {
    try {
      const keys = [
        ['channels', this.channelsFile],
        ['m3uSources', this.m3uSourcesFile],
        ['epgSources', this.epgSourcesFile],
        ['settings', this.settingsFile]
      ];

      for (const [key, filePath] of keys) {
        const redisKey = this.redisPrefix + key;
        const exists = await this.redisClient.exists(redisKey);
        if (!exists) {
          const fileData = await this._readFile(filePath);
          if (fileData !== null) {
            await this.redisClient.set(redisKey, JSON.stringify(fileData));
            console.log(`[StorageService] 已同步 ${key} 到 Redis`);
          }
        }
      }
    } catch (error) {
      console.warn('[StorageService] 同步文件到 Redis 失败:', error.message);
    }
  }

  /**
   * 通用读取：优先 Redis，降级文件
   */
  async _get(key, filePath) {
    // 优先从 Redis 读取
    if (this.redisReady) {
      try {
        const data = await this.redisClient.get(this.redisPrefix + key);
        if (data !== null) {
          return JSON.parse(data);
        }
      } catch (error) {
        console.warn(`[StorageService] Redis 读取 ${key} 失败:`, error.message);
      }
    }
    // 降级读取文件
    return this._readFile(filePath);
  }

  /**
   * 通用写入：同时写 Redis 和文件
   */
  async _set(key, filePath, data) {
    const jsonStr = JSON.stringify(data);
    // 写 Redis
    if (this.redisReady) {
      try {
        await this.redisClient.set(this.redisPrefix + key, jsonStr);
      } catch (error) {
        console.warn(`[StorageService] Redis 写入 ${key} 失败:`, error.message);
      }
    }
    // 写文件（备份）
    await this._writeFile(filePath, data);
  }

  /**
   * 初始化文件（如果不存在）
   */
  async _initFile(filePath, defaultData) {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    }
  }

  /**
   * 读取 JSON 文件
   */
  async _readFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 写入 JSON 文件
   */
  async _writeFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  // ========== 频道管理 ==========

  /**
   * 获取所有频道
   */
  async getChannels() {
    const data = await this._get('channels', this.channelsFile);
    return data || [];
  }

  /**
   * 保存频道
   */
  async saveChannel(channel) {
    const channels = await this.getChannels();
    const index = channels.findIndex(c => c.id === channel.id);

    if (index >= 0) {
      channels[index] = channel;
    } else {
      channels.push(channel);
    }

    await this._set('channels', this.channelsFile, channels);
    return channel;
  }

  /**
   * 删除频道
   */
  async deleteChannel(channelId) {
    const channels = await this.getChannels();
    const newChannels = channels.filter(c => c.id !== channelId);

    if (channels.length === newChannels.length) {
      return false;
    }

    await this._set('channels', this.channelsFile, newChannels);
    return true;
  }

  /**
   * 批量删除频道（优化版本：只读写文件一次）
   */
  async batchDeleteChannels(channelIds) {
    const channels = await this.getChannels();
    const idsSet = new Set(channelIds);
    const newChannels = channels.filter(c => !idsSet.has(c.id));

    const deletedCount = channels.length - newChannels.length;

    if (deletedCount === 0) {
      return {
        deletedCount: 0,
        results: channelIds.map(id => ({ success: false, id }))
      };
    }

    await this._set('channels', this.channelsFile, newChannels);

    return {
      deletedCount,
      results: channelIds.map(id => ({
        success: channels.some(c => c.id === id),
        id
      }))
    };
  }

  // ========== 源配置管理 ==========

  /**
   * 获取所有源配置（M3U 和 EPG）
   */
  async getSources() {
    const m3uSources = await this._get('m3uSources', this.m3uSourcesFile) || [];
    const epgSources = await this._get('epgSources', this.epgSourcesFile) || [];

    return {
      m3u: m3uSources,
      epg: epgSources
    };
  }

  /**
   * 根据 ID 获取单个源
   */
  async getSourceById(type, sourceId) {
    const sources = type === 'm3u'
      ? await this._get('m3uSources', this.m3uSourcesFile) || []
      : await this._get('epgSources', this.epgSourcesFile) || [];
    return sources.find(s => s.id === sourceId) || null;
  }

  /**
   * 保存源配置
   */
  async saveSource(type, source) {
    const redisKey = type === 'm3u' ? 'm3uSources' : 'epgSources';
    const filePath = type === 'm3u' ? this.m3uSourcesFile : this.epgSourcesFile;
    const sources = await this._get(redisKey, filePath) || [];

    const index = sources.findIndex(s => s.id === source.id);

    if (index >= 0) {
      sources[index] = source;
    } else {
      sources.push(source);
    }

    await this._set(redisKey, filePath, sources);
    return source;
  }

  /**
   * 删除源配置
   */
  async deleteSource(type, sourceId) {
    const redisKey = type === 'm3u' ? 'm3uSources' : 'epgSources';
    const filePath = type === 'm3u' ? this.m3uSourcesFile : this.epgSourcesFile;
    const sources = await this._get(redisKey, filePath) || [];

    // 同时支持 id 和 _id 字段匹配
    const newSources = sources.filter(s => s.id !== sourceId && s._id !== sourceId);

    if (sources.length === newSources.length) {
      return false;
    }

    await this._set(redisKey, filePath, newSources);
    return true;
  }

  // ========== 设置管理 ==========

  /**
   * 获取所有设置
   */
  async getSettings() {
    const settings = await this._get('settings', this.settingsFile);
    return settings || this._getDefaultSettings();
  }

  /**
   * 保存设置
   */
  async saveSettings(settings) {
    await this._set('settings', this.settingsFile, settings);
    return settings;
  }

  /**
   * 获取默认设置
   */
  _getDefaultSettings() {
    return {
      language: 'zh-CN',
      theme: 'light',
      autoplay: true,
      proxyEnabled: false,
      proxyUrl: '',
      proxyAuth: '',
      timeout: 30000,
      defaultPlayer: 'hls',
      vlcPath: '',
      networkCache: 1000,
      epgEnabled: false,
      defaultM3uSource: '',
      defaultEpgSource: '',
      cacheEnabled: true,
      cacheTtl: 3600,
      authEnabled: false,
      sessionTimeout: 604800,
      updatedAt: new Date().toISOString()
    };
  }
}

module.exports = StorageService;
