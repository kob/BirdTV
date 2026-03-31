/**
 * Redis 配置管理
 * 用于隔离不同系统的数据存储
 */

class RedisConfig {
  constructor(options = {}) {
    // 默认前缀
    this.prefix = options.prefix || 'birdtv';

    // 系统标识（用于区分不同应用实例）
    this.systemId = options.systemId || process.env.BIRDTV_SYSTEM_ID || 'default';

    // 完整的 Key 前缀（包含系统ID）
    this.fullPrefix = `${this.prefix}:${this.systemId}:`;

    // 各模块的 Key 前缀
    this.keys = {
      // 频道相关
      channels: `${this.fullPrefix}channels`,

      // 源配置
      m3uSources: `${this.fullPrefix}m3u:sources`,
      epgSources: `${this.fullPrefix}epg:sources`,

      // 设置
      settings: `${this.fullPrefix}settings`,

      // 用户认证
      authTokens: `${this.fullPrefix}auth:tokens`,
      authUsers: `${this.fullPrefix}auth:users`,
      authSessions: `${this.fullPrefix}auth:sessions`,

      // 缓存
      cache: {
        m3u: `${this.fullPrefix}cache:m3u`,
        epg: `${this.fullPrefix}cache:epg`,
        channels: `${this.fullPrefix}cache:channels`
      }
    };
  }

  /**
   * 获取完整的 Redis Key
   * @param {string} keyType - Key 类型
   * @param {string} suffix - 后缀（可选）
   * @returns {string} 完整的 Redis Key
   */
  getKey(keyType, suffix = '') {
    const baseKey = this.keys[keyType] || `${this.fullPrefix}${keyType}`;
    return suffix ? `${baseKey}:${suffix}` : baseKey;
  }

  /**
   * 生成带前缀的缓存 Key
   * @param {string} type - 缓存类型（m3u/epg/channels）
   * @param {string} identifier - 标识符（如 URL 或 ID）
   * @returns {string} 缓存 Key
   */
  getCacheKey(type, identifier) {
    const hash = require('crypto')
      .createHash('md5')
      .update(identifier)
      .digest('hex');
    return `${this.keys.cache[type]}:${hash}`;
  }

  /**
   * 从配置环境变量加载配置
   */
  static fromEnv() {
    return new RedisConfig({
      prefix: process.env.REDIS_PREFIX || 'birdtv',
      systemId: process.env.BIRDTV_SYSTEM_ID || 'default'
    });
  }
}

module.exports = RedisConfig;
