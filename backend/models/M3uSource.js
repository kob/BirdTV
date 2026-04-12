const crypto = require('crypto');

/**
 * M3U 源模型
 */
class M3uSource {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.url = data.url;
    this.importType = data.importType || 'auto'; // auto/mpd/ts/hls/unknown
    this.defaultPlayerType = data.defaultPlayerType || 'auto'; // auto/shaka/hls/mpegts/native
    this.proxyMode = data.proxyMode || 'auto'; // auto/proxy/direct
    this.userAgent = data.userAgent || ''; // 自定义UA，为空时使用全局默认
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.channelCount = data.channelCount || 0;
    this.lastSyncAt = data.lastSyncAt || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      url: this.url,
      importType: this.importType,
      defaultPlayerType: this.defaultPlayerType,
      proxyMode: this.proxyMode,
      userAgent: this.userAgent,
      enabled: this.enabled,
      channelCount: this.channelCount,
      lastSyncAt: this.lastSyncAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * 更新字段
   */
  update(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.url !== undefined) this.url = data.url;
    if (data.importType !== undefined) this.importType = data.importType;
    if (data.defaultPlayerType !== undefined) this.defaultPlayerType = data.defaultPlayerType;
    if (data.proxyMode !== undefined) this.proxyMode = data.proxyMode;
    if (data.userAgent !== undefined) this.userAgent = data.userAgent;
    if (data.enabled !== undefined) this.enabled = data.enabled;
    if (data.channelCount !== undefined) this.channelCount = data.channelCount;
    if (data.lastSyncAt !== undefined) this.lastSyncAt = data.lastSyncAt;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * 从 JSON 对象创建 M3U 源
   */
  static fromJSON(json) {
    return new M3uSource(json);
  }
}

module.exports = M3uSource;
