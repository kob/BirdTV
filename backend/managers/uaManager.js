/**
 * UAManager - User-Agent 管理器
 * 管理全局和频道级别的 User-Agent 设置
 */

const UA_SETTINGS_KEY = 'globalUserAgent';
const CHANNEL_UA_SETTINGS_KEY = 'channelUserAgents';
// 从环境变量读取默认 UA，支持 BIRDTV_DEFAULT_UA 和 M3U_PROXY_DEFAULT_UA
const DEFAULT_UA = process.env.BIRDTV_DEFAULT_UA || process.env.M3U_PROXY_DEFAULT_UA || 'okhttp';

class UAManager {
  constructor(storage) {
    this.storage = storage;
    this.uaCache = {
      global: null,
      channel: new Map()
    };
    this.lastUpdated = 0;
    this.initialized = false;
  }

  /**
   * 获取全局 User-Agent
   */
  getGlobalUA() {
    if (!this.initialized) {
      console.warn('[UAManager] Not initialized, using default UA');
      return DEFAULT_UA;
    }
    return this.uaCache.global || DEFAULT_UA;
  }

  /**
   * 设置全局 User-Agent
   */
  async setGlobalUA(userAgent) {
    const settings = await this.storage.getSettings();
    settings[UA_SETTINGS_KEY] = userAgent;
    await this.storage.saveSettings(settings);
    
    this.uaCache.global = userAgent;
    this.lastUpdated = Date.now();
    
    console.log('[UAManager] Global UA updated:', userAgent);
    return true;
  }

  /**
   * 获取频道的 User-Agent
   */
  async getChannelUA(channelId) {
    if (!this.initialized) {
      return null;
    }

    const cached = this.uaCache.channel.get(channelId);
    if (cached) {
      return cached;
    }
    
    const settings = await this.storage.getSettings();
    const channelUAs = settings[CHANNEL_UA_SETTINGS_KEY] || {};
    const ua = channelUAs[channelId] || null;
    
    this.uaCache.channel.set(channelId, ua);
    return ua;
  }

  /**
   * 设置频道的 User-Agent
   */
  async setChannelUA(channelId, userAgent) {
    const settings = await this.storage.getSettings();
    if (!settings[CHANNEL_UA_SETTINGS_KEY]) {
      settings[CHANNEL_UA_SETTINGS_KEY] = {};
    }
    
    if (userAgent === null || userAgent === '') {
      delete settings[CHANNEL_UA_SETTINGS_KEY][channelId];
      this.uaCache.channel.delete(channelId);
    } else {
      settings[CHANNEL_UA_SETTINGS_KEY][channelId] = userAgent;
      this.uaCache.channel.set(channelId, userAgent);
    }
    
    await this.storage.saveSettings(settings);
    this.lastUpdated = Date.now();
    
    console.log(`[UAManager] Channel UA updated: ${channelId} =`, userAgent);
    return true;
  }

  /**
   * 获取有效的 User-Agent (优先使用频道特定 UA，否则使用全局 UA)
   */
  async getEffectiveUA(channelId = null) {
    if (!this.initialized) {
      return DEFAULT_UA;
    }

    if (channelId) {
      const channelUA = await this.getChannelUA(channelId);
      if (channelUA) {
        return channelUA;
      }
    }
    return this.getGlobalUA();
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.uaCache.global = null;
    this.uaCache.channel.clear();
    this.lastUpdated = 0;
    console.log('[UAManager] Cache cleared');
  }

  /**
   * 初始化加载
   */
  async initialize() {
    try {
      const settings = await this.storage.getSettings();
      this.uaCache.global = settings[UA_SETTINGS_KEY] || DEFAULT_UA;
      
      const channelUAs = settings[CHANNEL_UA_SETTINGS_KEY] || {};
      for (const [channelId, ua] of Object.entries(channelUAs)) {
        this.uaCache.channel.set(channelId, ua);
      }
      
      this.initialized = true;
      this.lastUpdated = Date.now();
      console.log('[UAManager] Initialized with global UA:', this.uaCache.global);
      console.log('[UAManager] Loaded', Object.keys(channelUAs).length, 'channel UA settings');
    } catch (error) {
      console.error('[UAManager] Initialize error:', error);
      this.uaCache.global = DEFAULT_UA;
      this.initialized = true;
    }
  }
}

module.exports = UAManager;
