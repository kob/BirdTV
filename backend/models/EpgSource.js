const crypto = require('crypto');

/**
 * EPG 源模型
 */
class EpgSource {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.url = data.url;
    this.enabled = data.enabled !== undefined ? data.enabled : true;
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
      enabled: this.enabled,
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
    if (data.enabled !== undefined) this.enabled = data.enabled;
    if (data.lastSyncAt !== undefined) this.lastSyncAt = data.lastSyncAt;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * 从 JSON 对象创建 EPG 源
   */
  static fromJSON(json) {
    return new EpgSource(json);
  }
}

module.exports = EpgSource;
