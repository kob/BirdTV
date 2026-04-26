const crypto = require('crypto');

/**
 * 定时导入调度服务
 * 支持标准 5 段 cron 表达式，使用 setTimeout 精确调度
 */
class SchedulerService {
  constructor(storageService, sourceController, exportController) {
    this.storage = storageService;
    this.sourceController = sourceController;
    this.exportController = exportController;
    this.timers = new Map(); // taskId -> { timeout, nextRun }
    this.running = false;
  }

  /**
   * 启动调度器，加载已启用的任务
   */
  async start() {
    const tasks = await this.getTasks();
    let started = 0;
    for (const task of tasks) {
      if (task.enabled) {
        this.scheduleTask(task);
        started++;
      }
    }
    this.running = true;
    console.log(`[Scheduler] 已启动，共加载 ${started} 个定时任务`);
  }

  /**
   * 停止所有定时器
   */
  stop() {
    for (const [id, timer] of this.timers) {
      if (timer.timeout) clearTimeout(timer.timeout);
    }
    this.timers.clear();
    this.running = false;
    console.log('[Scheduler] 已停止');
  }

  /**
   * 获取所有任务
   */
  async getTasks() {
    const settings = await this.storage.getSettings();
    return settings.scheduledTasks || [];
  }

  /**
   * 保存任务列表
   */
  async _saveTasks(tasks) {
    const settings = await this.storage.getSettings();
    settings.scheduledTasks = tasks;
    await this.storage.saveSettings(settings);
  }

  /**
   * 创建定时任务
   */
  async createTask(data) {
    const { type = 'import', sourceId, cron, name, enabled = true, exportConfig, importConfig } = data;

    if (!type || !cron) {
      throw new Error('type 和 cron 为必填项');
    }
    if (!isValidCron(cron)) {
      throw new Error('cron 表达式格式无效');
    }

    let taskName = name;
    let taskData = { type };

    if (type === 'import') {
      if (!sourceId) {
        throw new Error('导入任务需要指定节目源');
      }
      // 验证节目源存在
      const sources = await this.storage.getSources();
      const source = (sources.m3u || []).find(s => s.id === sourceId || s._id === sourceId);
      if (!source) {
        throw new Error('节目源不存在');
      }
      taskData.sourceId = sourceId;
      taskData.sourceName = source.name;
      if (importConfig) taskData.importConfig = importConfig;
      taskName = taskName || `定时导入 - ${source.name}`;
    } else if (type === 'export') {
      if (!exportConfig) {
        throw new Error('导出任务需要指定导出配置');
      }
      if (!exportConfig.groups || exportConfig.groups.length === 0) {
        throw new Error('导出任务需要指定至少一个分组');
      }
      taskData.exportConfig = exportConfig;
      taskName = taskName || `定时导出 - ${exportConfig.filename || 'channels.m3u'}`;
    }

    const task = {
      id: crypto.randomBytes(8).toString('hex'),
      name: taskName,
      cron,
      enabled,
      lastRunAt: null,
      lastResult: null,
      nextRunAt: getNextCronDate(cron).toISOString(),
      createdAt: new Date().toISOString(),
      ...taskData
    };

    const tasks = await this.getTasks();
    tasks.push(task);
    await this._saveTasks(tasks);

    if (task.enabled) {
      this.scheduleTask(task);
    }

    console.log(`[Scheduler] 创建任务: ${task.name} (${task.cron})`);
    return task;
  }

  /**
   * 更新任务
   */
  async updateTask(id, data) {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) throw new Error('任务不存在');

    const old = tasks[index];

    if (data.cron !== undefined && data.cron !== old.cron) {
      if (!isValidCron(data.cron)) throw new Error('cron 表达式格式无效');
    }

    if (data.sourceId && data.sourceId !== old.sourceId) {
      const sources = await this.storage.getSources();
      const source = (sources.m3u || []).find(s => s.id === data.sourceId || s._id === data.sourceId);
      if (!source) throw new Error('节目源不存在');
      data.sourceName = source.name;
    }

    // 停止旧定时器
    this.cancelTask(id);

    Object.assign(old, data, { updatedAt: new Date().toISOString() });
    old.nextRunAt = getNextCronDate(old.cron).toISOString();
    tasks[index] = old;
    await this._saveTasks(tasks);

    if (old.enabled) {
      this.scheduleTask(old);
    }

    console.log(`[Scheduler] 更新任务: ${old.name}`);
    return old;
  }

  /**
   * 删除任务
   */
  async deleteTask(id) {
    this.cancelTask(id);
    const tasks = await this.getTasks();
    const filtered = tasks.filter(t => t.id !== id);
    await this._saveTasks(filtered);
    console.log(`[Scheduler] 删除任务: ${id}`);
  }

  /**
   * 手动执行任务
   */
  async runTask(id) {
    const tasks = await this.getTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error('任务不存在');

    const result = await this._executeTask(task);

    // 手动执行后重新调度定时器，确保下次定时执行不受影响
    if (task.enabled) {
      const freshTasks = await this.getTasks();
      const freshTask = freshTasks.find(t => t.id === id);
      if (freshTask && freshTask.enabled) {
        this.scheduleTask(freshTask);
      }
    }

    return result;
  }

  /**
   * 取消任务定时器
   */
  cancelTask(id) {
    const timer = this.timers.get(id);
    if (timer && timer.timeout) {
      clearTimeout(timer.timeout);
      this.timers.delete(id);
    }
  }

  /**
   * 调度单个任务
   */
  scheduleTask(task) {
    this.cancelTask(task.id);

    let nextMs = getNextCronDate(task.cron).getTime() - Date.now();
    if (nextMs < 0) {
      // 极端情况下计算出的时间已过，重新计算（getNextCronDate 从下一分钟开始，不应出现此情况）
      console.warn(`[Scheduler] 任务 ${task.name} 下次执行时间异常 (nextMs=${nextMs})，重新计算`);
      nextMs = getNextCronDate(task.cron).getTime() - Date.now();
      if (nextMs < 0) {
        // 仍然为负，1秒后重试
        nextMs = 1000;
      }
    }

    const nextDate = new Date(Date.now() + nextMs);
    console.log(`[Scheduler] 调度任务: ${task.name}, 下次执行: ${nextDate.toLocaleString('zh-CN', { hour12: false })} (${Math.round(nextMs / 1000 / 60)}分钟后)`);

    // Node.js setTimeout 最大延迟约 24.8 天 (2^31-1 ms)，超过会立即触发
    // 如果超过最大值，使用轮询等待
    const MAX_TIMEOUT = 2147483647;
    const taskId = task.id;
    const scheduleWithMaxTimeout = (remaining) => {
      if (remaining <= MAX_TIMEOUT) {
        const tid = setTimeout(async () => {
          this.timers.delete(taskId);
          try {
            // 从存储读取最新任务配置，确保使用最新的 importConfig 等设置
            const latestTasks = await this.getTasks();
            const latestTask = latestTasks.find(t => t.id === taskId) || task;
            await this._executeTask(latestTask);
          } catch (e) {
            console.error(`[Scheduler] 任务执行异常: ${task.name}`, e);
          }
          // 执行完后，重新调度下一次（从存储中重新读取任务）
          try {
            const tasks = await this.getTasks();
            const freshTask = tasks.find(t => t.id === taskId);
            if (freshTask && freshTask.enabled) {
              this.scheduleTask(freshTask);
            }
          } catch (e) {
            console.error(`[Scheduler] 重新调度失败: ${task.name}`, e);
            // 存储读取失败时，用旧 task 重新调度，避免任务永久丢失
            this.scheduleTask(task);
          }
        }, remaining);
        this.timers.set(taskId, { timeout: tid, nextRun: Date.now() + remaining });
      } else {
        // 超过最大延迟，先等待最大值后再重新计算
        const tid = setTimeout(() => {
          // 检查任务是否仍在此定时器中（可能已被 cancelTask 取消）
          if (this.timers.has(taskId)) {
            scheduleWithMaxTimeout(remaining - MAX_TIMEOUT);
          }
        }, MAX_TIMEOUT);
        this.timers.set(taskId, { timeout: tid, nextRun: Date.now() + remaining });
      }
    };

    scheduleWithMaxTimeout(nextMs);
  }

  /**
   * 执行导入任务
   */
  async _executeTask(task) {
    console.log(`[Scheduler] 开始执行任务: ${task.name}`);
    const startTime = Date.now();

    try {
      if (task.type === 'import') {
        return await this._executeImportTask(task);
      } else if (task.type === 'export') {
        return await this._executeExportTask(task);
      } else {
        throw new Error(`未知任务类型: ${task.type}`);
      }
    } catch (error) {
      const result = {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
      await this._updateTaskResult(task.id, result);
      console.error(`[Scheduler] 任务失败: ${task.name}`, error.message);
      return result;
    }
  }

  /**
   * 执行导入任务
   */
  async _executeImportTask(task) {
    const startTime = Date.now();

    try {
      const sources = await this.storage.getSources();
      const source = (sources.m3u || []).find(s => s.id === task.sourceId || s._id === task.sourceId);
      if (!source) {
        throw new Error('节目源已被删除');
      }

      const importConfig = task.importConfig || {};
      const imported = await this.sourceController._importChannelsFromM3U(
        source.url, source.id || source._id, importConfig.userAgent || source.userAgent,
        { proxyMode: importConfig.proxyMode, playerType: importConfig.playerType, group: importConfig.group, duplicateMode: importConfig.duplicateMode }
      );

      const result = {
        success: true,
        imported: imported.length,
        duration: Date.now() - startTime
      };

      // 更新任务状态
      await this._updateTaskResult(task.id, result);
      console.log(`[Scheduler] 导入任务完成: ${task.name}, 导入 ${imported.length} 个频道, 耗时 ${result.duration}ms`);
      return result;
    } catch (error) {
      const result = {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
      await this._updateTaskResult(task.id, result);
      console.error(`[Scheduler] 导入任务失败: ${task.name}`, error.message);
      return result;
    }
  }

  /**
   * 执行导出任务
   */
  async _executeExportTask(task) {
    const startTime = Date.now();

    try {
      const { groups, filename, description } = task.exportConfig;

      // 获取所有频道
      const allChannels = await this.storage.getChannels();

      // 根据分组过滤频道
      const exportedChannels = allChannels.filter(channel => {
        return groups.includes(channel.group || '未分组');
      });

      if (exportedChannels.length === 0) {
        throw new Error('没有找到符合条件的频道');
      }

      // 构造导出请求对象
      // 从设置中获取外部访问地址，避免硬编码 localhost
      // 优先级：settings.m3uRemoteBaseUrl > 环境变量 BIRDTV_REMOTE_BASE_URL > 默认 localhost
      let exportBaseUrl = 'http://localhost:8771';
      try {
        const settings = await this.storage.getSettings();
        if (settings && settings.m3uRemoteBaseUrl) {
          exportBaseUrl = settings.m3uRemoteBaseUrl.replace(/\/+$/, '');
        } else if (process.env.BIRDTV_REMOTE_BASE_URL || process.env.M3U_REMOTE_BASE_URL) {
          exportBaseUrl = (process.env.BIRDTV_REMOTE_BASE_URL || process.env.M3U_REMOTE_BASE_URL).replace(/\/+$/, '');
        }
      } catch (e) {
        console.warn('[Scheduler] 获取外部地址失败，使用默认值', e.message);
      }
      console.log(`[Scheduler] 导出使用外部地址: ${exportBaseUrl}`);

      const exportRequest = {
        body: {
          channelIds: exportedChannels.map(ch => ch.id),
          description: description || `${task.name} - ${new Date().toLocaleString()}`,
          useShortLink: false,
          filename: filename || `${task.name}.m3u`
        },
        user: { username: 'scheduler' },
        headers: {},
        protocol: exportBaseUrl.split('://')[0] || 'http',
        get: () => exportBaseUrl.split('://')[1] || 'localhost:8771'
      };

      // 构造响应对象
      const responseObj = {
        json: (data) => { exportRequest._result = data; },
        status: () => responseObj
      };

      // 调用导出控制器
      await this.exportController.exportChannels(exportRequest, responseObj);

      const result = {
        success: true,
        exported: exportedChannels.length,
        filename: filename || `${task.name}.m3u`,
        duration: Date.now() - startTime
      };

      // 更新任务状态
      await this._updateTaskResult(task.id, result);
      console.log(`[Scheduler] 导出任务完成: ${task.name}, 导出 ${exportedChannels.length} 个频道, 耗时 ${result.duration}ms`);
      return result;
    } catch (error) {
      const result = {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
      await this._updateTaskResult(task.id, result);
      console.error(`[Scheduler] 导出任务失败: ${task.name}`, error.message);
      return result;
    }
  }

  /**
   * 更新任务执行结果
   */
  async _updateTaskResult(id, result) {
    const tasks = await this.getTasks();
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.lastRunAt = new Date().toISOString();
      task.lastResult = result;
      task.nextRunAt = getNextCronDate(task.cron).toISOString();
      await this._saveTasks(tasks);
    }
  }

  /**
   * 获取调度器状态摘要
   */
  getStatus() {
    const now = new Date();
    const tzOffset = -now.getTimezoneOffset();
    const tzHours = Math.floor(Math.abs(tzOffset) / 60);
    const tzMins = Math.abs(tzOffset) % 60;
    const tzSign = tzOffset >= 0 ? '+' : '-';
    const tzString = `UTC${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMins).padStart(2, '0')}`;
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || tzString;
    return {
      running: this.running,
      activeTasks: this.timers.size,
      serverTime: now.toISOString(),
      serverTimeLocal: now.toLocaleString('zh-CN', { hour12: false }),
      timezone: tzName,
      timezoneOffset: tzString,
      tasks: Array.from(this.timers.entries()).map(([id, timer]) => ({
        id,
        nextRunIn: Math.max(0, timer.nextRun - Date.now())
      }))
    };
  }
}

// ==================== Cron 表达式解析 ====================

/**
 * 验证 cron 表达式格式（5 段标准格式）
 * 分 时 日 月 星期
 */
function isValidCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  return parts.every((part, i) => isValidField(part, ranges[i][0], ranges[i][1]));
}

function isValidField(field, min, max) {
  // 支持: * , - / 以及数字
  if (field === '*') return true;
  // 逗号分隔多个值
  return field.split(',').every(segment => {
    // 支持 step: */5, 1-10/2
    const stepParts = segment.split('/');
    if (stepParts.length > 2) return false;
    if (stepParts.length === 2) {
      if (!/^\d+$/.test(stepParts[1]) || parseInt(stepParts[1]) < 1) return false;
    }
    // 范围: 1-10
    const range = stepParts[0];
    if (range.includes('-')) {
      const [lo, hi] = range.split('-');
      return /^\d+$/.test(lo) && /^\d+$/.test(hi) &&
        parseInt(lo) >= min && parseInt(hi) <= max && parseInt(lo) <= parseInt(hi);
    }
    if (range === '*') return true;
    // 单个数字
    return /^\d+$/.test(range) && parseInt(range) >= min && parseInt(range) <= max;
  });
}

/**
 * 计算下一个 cron 执行时间
 */
function getNextCronDate(expr) {
  const parts = expr.trim().split(/\s+/);
  const [cronMin, cronHour, cronDay, cronMonth, cronDow] = parts;

  const now = new Date();
  // 从下一分钟开始搜索
  let candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

  // 最多搜索 4 年
  const maxIterations = 525960; // 4年的分钟数
  for (let i = 0; i < maxIterations; i++) {
    if (
      fieldMatches(cronMonth, candidate.getMonth() + 1, 1, 12) &&
      fieldMatches(cronDay, candidate.getDate(), 1, 31) &&
      fieldMatches(cronDow, candidate.getDay(), 0, 6) &&
      fieldMatches(cronHour, candidate.getHours(), 0, 23) &&
      fieldMatches(cronMin, candidate.getMinutes(), 0, 59)
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error('无法在合理范围内找到下次执行时间');
}

function fieldMatches(field, value, min, max) {
  if (field === '*') return true;
  return field.split(',').some(segment => {
    const stepParts = segment.split('/');
    const step = stepParts.length === 2 ? parseInt(stepParts[1]) : 1;
    let range = stepParts[0];

    let lo, hi;
    if (range === '*') {
      lo = min; hi = max;
    } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map(Number);
    } else {
      lo = hi = parseInt(range);
    }

    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

/**
 * 生成 cron 表达式的可读描述（中文）
 */
function describeCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, day, month, dow] = parts;

  const dowNames = ['日', '一', '二', '三', '四', '五', '六'];
  let desc = '';

  // 月
  if (month !== '*') desc += month + '月 ';
  // 日
  if (day !== '*') desc += day + '日 ';

  // 时分
  if (hour !== '*' && min !== '*') {
    desc += `${hour}:${String(min).padStart(2, '0')}`;
  } else if (hour !== '*') {
    desc += `每小时的第 ${min} 分钟`;
  } else if (min !== '*') {
    desc += `每小时的第 ${min} 分钟`;
  }

  // 星期
  if (dow !== '*') {
    desc += ' 周' + dow.split(',').map(d => dowNames[parseInt(d)] || d).join('');
  }

  if (!desc) {
    if (hour === '*' && min === '*') desc = '每分钟';
    else if (min === '0' && hour === '*') desc = '每小时整点';
    else if (min === '*' && hour === '*') desc = '每分钟';
  }

  return desc || expr;
}

module.exports = { SchedulerService, isValidCron, getNextCronDate, describeCron };
