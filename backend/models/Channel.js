const crypto = require('crypto');

/**
 * 频道模型
 */
class Channel {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.url = data.url;
    this.streamType = data.streamType || 'auto'; // auto/mpd/ts/hls/unknown
    this.playerType = data.playerType || 'auto'; // auto/shaka/hls/mpegts/native
    this.proxyMode = data.proxyMode || 'auto'; // auto/proxy/direct
    this.drm = data.drm || {};
    this.userAgent = data.userAgent || '';
    this.group = data.group || '';
    this.sourceId = data.sourceId || '';
    this.tvgId = data.tvgId || '';
    this.tvgLogo = data.tvgLogo || '';
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
      streamType: this.streamType,
      playerType: this.playerType,
      proxyMode: this.proxyMode,
      drm: this.drm,
      userAgent: this.userAgent,
      group: this.group,
      sourceId: this.sourceId,
      tvgId: this.tvgId,
      tvgLogo: this.tvgLogo,
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
    if (data.streamType !== undefined) this.streamType = data.streamType;
    if (data.playerType !== undefined) this.playerType = data.playerType;
    if (data.proxyMode !== undefined) this.proxyMode = data.proxyMode;
    if (data.drm !== undefined) this.drm = { ...this.drm, ...data.drm };
    if (data.userAgent !== undefined) this.userAgent = data.userAgent;
    if (data.group !== undefined) this.group = data.group;
    if (data.tvgId !== undefined) this.tvgId = data.tvgId;
    if (data.tvgLogo !== undefined) this.tvgLogo = data.tvgLogo;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * 从 JSON 对象创建频道
   */
  static fromJSON(json) {
    return new Channel(json);
  }
}

module.exports = Channel;
