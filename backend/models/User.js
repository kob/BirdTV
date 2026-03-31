const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * 用户模型
 */
class User {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.username = data.username;
    this.password = data.password; // bcrypt hash
    this.role = data.role || 'user'; // admin/user/guest
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      role: this.role,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * 验证密码
   */
  async verifyPassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  /**
   * 生成密码哈希
   */
  static async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  /**
   * 从 JSON 对象创建用户
   */
  static fromJSON(json) {
    return new User(json);
  }
}

module.exports = User;
