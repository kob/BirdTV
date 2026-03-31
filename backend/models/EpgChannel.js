/**
 * EpgChannel Model - EPG 频道管理
 * 管理频道与 EPG 源的映射关系和加载策略
 */

const fs = require('fs');
const path = require('path');

class EpgChannel {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.dataFile = path.join(this.dataDir, 'epg-channels.json');
    this.ensureDataDirectory();
    this.ensureDataFile();
  }

  /**
   * 确保数据目录存在
   */
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * 确保数据文件存在
   */
  ensureDataFile() {
    if (!fs.existsSync(this.dataFile)) {
      fs.writeFileSync(this.dataFile, JSON.stringify([], null, 2), 'utf8');
    }
  }

  /**
   * 读取所有 EPG 频道配置
   */
  read() {
    try {
      const data = fs.readFileSync(this.dataFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('读取 EPG 频道配置失败:', error);
      return [];
    }
  }

  /**
   * 写入所有 EPG 频道配置
   */
  write(data) {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('写入 EPG 频道配置失败:', error);
      return false;
    }
  }

  /**
   * 获取所有 EPG 频道
   */
  getAll() {
    return this.read();
  }

  /**
   * 根据 ID 获取 EPG 频道
   */
  getById(id) {
    const channels = this.read();
    return channels.find(ch => ch.id === id);
  }

  /**
   * 根据频道名称获取 EPG 频道
   */
  getByName(name) {
    const channels = this.read();
    return channels.find(ch => ch.name === name);
  }

  /**
   * 添加 EPG 频道
   */
  add(channelData) {
    const channels = this.read();
    
    // 检查是否已存在
    const existing = channels.find(ch => ch.name === channelData.name);
    if (existing) {
      throw new Error('该频道已存在 EPG 配置');
    }

    const newChannel = {
      id: `epg_ch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: channelData.name,
      group: channelData.group || '未分组',
      epgSource: channelData.epgSource || null,
      strategy: channelData.strategy || 'auto', // auto, manual, custom, smart
      customMapping: channelData.customMapping || null,
      lastUpdate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    channels.push(newChannel);
    this.write(channels);
    return newChannel;
  }

  /**
   * 更新 EPG 频道
   */
  update(id, channelData) {
    const channels = this.read();
    const index = channels.findIndex(ch => ch.id === id);
    
    if (index === -1) {
      throw new Error('未找到该 EPG 频道配置');
    }

    channels[index] = {
      ...channels[index],
      ...channelData,
      updatedAt: new Date().toISOString()
    };

    this.write(channels);
    return channels[index];
  }

  /**
   * 删除 EPG 频道
   */
  delete(id) {
    const channels = this.read();
    const filtered = channels.filter(ch => ch.id !== id);
    
    if (filtered.length === channels.length) {
      throw new Error('未找到该 EPG 频道配置');
    }

    this.write(filtered);
    return true;
  }

  /**
   * 更新频道的最后更新时间
   */
  updateLastUpdate(id) {
    const channels = this.read();
    const index = channels.findIndex(ch => ch.id === id);
    
    if (index !== -1) {
      channels[index].lastUpdate = new Date().toISOString();
      this.write(channels);
      return true;
    }
    
    return false;
  }

  /**
   * 根据策略获取 EPG 频道列表
   */
  getByStrategy(strategy) {
    const channels = this.read();
    return channels.filter(ch => ch.strategy === strategy);
  }

  /**
   * 获取所有分组
   */
  getAllGroups() {
    const channels = this.read();
    const groups = [...new Set(channels.map(ch => ch.group || '未分组').filter(Boolean))];
    return groups.sort();
  }

  /**
   * 批量设置分组
   */
  batchSetGroup(ids, group) {
    const channels = this.read();
    let updatedCount = 0;
    
    for (const id of ids) {
      const index = channels.findIndex(ch => ch.id === id);
      if (index !== -1) {
        channels[index].group = group || '未分组';
        channels[index].updatedAt = new Date().toISOString();
        updatedCount++;
      }
    }
    
    this.write(channels);
    return updatedCount;
  }

  /**
   * 解析自定义映射
   */
  parseCustomMapping(channel) {
    if (!channel.customMapping) {
      return {};
    }

    const mapping = {};
    const pairs = channel.customMapping.split(',');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (key && value) {
        mapping[key] = value;
      }
    }

    return mapping;
  }
}

module.exports = new EpgChannel();
