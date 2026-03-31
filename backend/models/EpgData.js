/**
 * EpgData Model - EPG 数据获取和解析
 * 负责从 EPG 源获取和解析节目单数据
 */

const axios = require('axios');
const xml2js = require('xml2js');

class EpgData {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 分钟缓存
  }

  /**
   * 获取 EPG 源配置
   */
  async getEpgSources() {
    try {
      const response = await axios.get('http://localhost:8771/api/sources/epg');
      if (response.data && response.data.ok) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('获取 EPG 源失败:', error.message);
      return [];
    }
  }

  /**
   * 从 XMLTV 格式解析 EPG 数据
   */
  async parseXmltv(xmlContent) {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlContent);
      
      const programs = [];
      
      if (result.tv && result.tv.programme) {
        for (const programme of result.tv.programme) {
          programs.push({
            channel: programme.$.channel,
            start: programme.$.start,
            stop: programme.$.stop,
            title: Array.isArray(programme.title) ? programme.title[0] : programme.title,
            desc: programme.desc ? (Array.isArray(programme.desc) ? programme.desc[0] : programme.desc) : null,
            icon: programme.icon ? programme.icon[0].$.src : null
          });
        }
      }
      
      return programs;
    } catch (error) {
      console.error('解析 XMLTV 失败:', error);
      return [];
    }
  }

  /**
   * 从 URL 获取 EPG 数据
   */
  async fetchFromUrl(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'BirdTV-EPG/1.0'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`获取 EPG 数据失败 (${url}):`, error.message);
      return null;
    }
  }

  /**
   * 获取频道节目单
   * @param {string} channelName - 频道名称
   * @param {string} strategy - 加载策略
   * @param {string} epgSource - EPG 源名称
   * @param {object} customMapping - 自定义映射
   */
  async getChannelPrograms(channelName, strategy = 'auto', epgSource = null, customMapping = null) {
    const cacheKey = `${channelName}_${strategy}_${epgSource}`;
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // 获取 EPG 源
      const sources = await this.getEpgSources();
      let targetSource = null;
      
      if (epgSource) {
        targetSource = sources.find(s => s.name === epgSource);
      } else {
        // 自动选择第一个可用的 EPG 源
        targetSource = sources[0];
      }

      if (!targetSource) {
        console.warn('未找到可用的 EPG 源');
        return [];
      }

      // 获取 EPG 数据
      const xmlContent = await this.fetchFromUrl(targetSource.url);
      if (!xmlContent) {
        return [];
      }

      // 解析 EPG 数据
      const allPrograms = await this.parseXmltv(xmlContent);
      
      // 根据策略筛选节目
      let channelPrograms = [];
      
      if (strategy === 'custom' && customMapping) {
        // 使用自定义映射
        const mappingKeys = Object.keys(customMapping);
        for (const key of mappingKeys) {
          const epgChannelId = customMapping[key];
          const programs = allPrograms.filter(p => p.channel === epgChannelId);
          channelPrograms = channelPrograms.concat(programs);
        }
      } else {
        // 自动匹配或手动绑定
        channelPrograms = allPrograms.filter(p => 
          this.matchChannel(channelName, p.channel, strategy === 'manual')
        );
      }

      // 转换为标准格式
      const programs = channelPrograms.map(p => ({
        title: p.title,
        start: this.parseTime(p.start),
        end: this.parseTime(p.stop),
        desc: p.desc,
        icon: p.icon
      }));

      // 按时间排序
      programs.sort((a, b) => new Date(a.start) - new Date(b.start));

      // 缓存结果
      this.cache.set(cacheKey, {
        data: programs,
        timestamp: Date.now()
      });

      return programs;
    } catch (error) {
      console.error(`获取频道 ${channelName} 的 EPG 数据失败:`, error);
      return [];
    }
  }

  /**
   * 匹配频道名称
   */
  matchChannel(channelName, epgChannelId, isManual = false) {
    // 标准化频道名称
    const normalize = (str) => {
      return str.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[-_]/g, '')
        .replace(/cctv(\d+)/g, '央视$1')
        .replace(/tvb/g, '无线');
    };

    const normalizedChannel = normalize(channelName);
    const normalizedEpg = normalize(epgChannelId);

    // 精确匹配
    if (normalizedChannel === normalizedEpg) {
      return true;
    }

    // 模糊匹配（非手动模式）
    if (!isManual) {
      // 检查是否包含
      if (normalizedChannel.includes(normalizedEpg) || 
          normalizedEpg.includes(normalizedChannel)) {
        return true;
      }

      // 常见频道别名映射
      const aliases = {
        'cctv1': ['央视一套', 'cctv1综合'],
        'cctv2': ['央视二套', 'cctv2财经'],
        'cctv3': ['央视三套', 'cctv3综艺'],
        'cctv4': ['央视四套', 'cctv4中文国际'],
        'cctv5': ['央视五套', 'cctv5体育'],
        'cctv5plus': ['央视五套+', 'cctv5+'],
        'cctv6': ['央视六套', 'cctv6电影'],
        'cctv7': ['央视七套', 'cctv7国防军事'],
        'cctv8': ['央视八套', 'cctv8电视剧'],
        'cctv9': ['央视九套', 'cctv9记录'],
        'cctv10': ['央视十套', 'cctv10科教'],
        'cctv11': ['央视十一套', 'cctv11戏曲'],
        'cctv12': ['央视十二套', 'cctv12社会与法'],
        'cctv13': ['央视十三套', 'cctv13新闻'],
        'cctv14': ['央视十四套', 'cctv14少儿'],
        'cctv15': ['央视十五套', 'cctv15音乐'],
        'btv1': ['北京卫视', '北京一套'],
        'dftv': ['东方卫视', '东方'],
        'jstv': ['江苏卫视', '江苏'],
        'zjtv': ['浙江卫视', '浙江'],
        'hntv': ['湖南卫视', '湖南'],
        'sdtv': ['山东卫视', '山东'],
        'gdtv': ['广东卫视', '广东']
      };

      for (const [key, values] of Object.entries(aliases)) {
        if (normalizedChannel.includes(key) || normalizedEpg.includes(key)) {
          return true;
        }
        if (values.some(v => normalizedChannel.includes(v) || normalizedEpg.includes(v))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 解析 XMLTV 时间格式
   */
  parseTime(timeStr) {
    if (!timeStr) return null;
    
    // XMLTV 格式：20260331183000 +0800
    const match = timeStr.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    }
    
    return timeStr;
  }

  /**
   * 获取当前正在播放的节目
   */
  getCurrentProgram(programs) {
    const now = new Date();
    
    return programs.find(p => {
      const start = new Date(p.start);
      const end = new Date(p.end);
      return now >= start && now < end;
    });
  }

  /**
   * 获取下一个节目
   */
  getNextProgram(programs) {
    const now = new Date();
    
    return programs.find(p => {
      const start = new Date(p.start);
      return start > now;
    });
  }

  /**
   * 清理过期缓存
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }
}

module.exports = new EpgData();
