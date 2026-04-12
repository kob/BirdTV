    // ========== 定时任务 ==========
    let schedulerSourceCache = [];
    let schedulerGroupCache = [];

    async function loadSchedulerTasks() {
      const tbody = document.getElementById('schedulerTableBody');
      const emptyEl = document.getElementById('schedulerEmpty');
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted);">加载中...</td></tr>';

      try {
        const res = await api('/scheduler/tasks');
        if (!res || !res.ok) {
          tbody.innerHTML = '';
          emptyEl.style.display = 'block';
          return;
        }

        const tasks = res.data || [];
        const statusEl = document.getElementById('schedulerStatus');
        if (res.status) {
          const tzInfo = res.status.timezone ? `${res.status.timezone} (${res.status.timezoneOffset})` : res.status.timezoneOffset || '';
          const timeInfo = res.status.serverTimeLocal || '';
          statusEl.innerHTML = `调度器运行中 · ${res.status.activeTasks} 个活跃任务` +
            (tzInfo ? `<br><span style="font-size:11px;color:var(--muted);">服务器时区: ${esc(tzInfo)} · 当前时间: ${esc(timeInfo)}</span>` : '');
        }

        if (!tasks.length) {
          tbody.innerHTML = '';
          emptyEl.style.display = 'block';
          return;
        }

        emptyEl.style.display = 'none';
        tbody.innerHTML = tasks.map(t => {
          const taskType = t.type || 'import';
          const typeLabel = taskType === 'export' ? '导出' : '导入';
          const typeBadge = `<span style="background:${taskType === 'export' ? '#9c27b0' : '#2196f3'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">${typeLabel}</span>`;

          const lastRun = t.lastRunAt
            ? `<span style="font-size:12px;">${new Date(t.lastRunAt).toLocaleString()}</span>` +
              (t.lastResult ? (t.lastResult.success
                ? `<br><span style="color:#4caf50;font-size:12px;">${taskType === 'export' ? '导出' : '导入'} ${taskType === 'export' ? t.lastResult.exported : t.lastResult.imported} 个频道 · ${t.lastResult.duration}ms</span>`
                : `<br><span style="color:#f44336;font-size:12px;">失败: ${esc(t.lastResult.error)}</span>`)
              : '')
            : '<span style="color:var(--muted);font-size:12px;">尚未执行</span>';

          const nextRun = t.enabled && t.nextRunAt
            ? `<span style="font-size:12px;color:var(--muted);">${formatCountdown(new Date(t.nextRunAt) - Date.now())}</span>`
            : '<span style="color:var(--muted);font-size:12px;">-</span>';

          return `<tr>
            <td><b>${esc(t.name)}</b><br>${typeBadge}</td>
            <td style="font-size:13px;">${taskType === 'export' ? (t.exportConfig?.groups || []).join(', ') : esc(t.sourceName || t.sourceId)}</td>
            <td><code style="background:rgba(146,187,255,0.1);padding:2px 8px;border-radius:4px;font-size:12px;">${esc(t.cron)}</code><br><span style="font-size:11px;color:var(--muted);">${esc(describeCronLocal(t.cron))}</span></td>
            <td>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" ${t.enabled ? 'checked' : ''} onchange="toggleSchedulerTask('${t.id}', this.checked)" style="accent-color:var(--brand);">
                <span style="font-size:12px;">${t.enabled ? '启用' : '停用'}</span>
              </label>
            </td>
            <td>${lastRun}</td>
            <td>${nextRun}</td>
            <td class="btn-group">
              <button class="btn btn-sm btn-primary" onclick="runSchedulerTask('${t.id}')">执行</button>
              <button class="btn btn-sm" onclick="showSchedulerTaskModal('${t.id}')">编辑</button>
              <button class="btn btn-sm btn-danger" onclick="deleteSchedulerTask('${t.id}')">删除</button>
            </td>
          </tr>`;
        }).join('');

        // 每分钟刷新倒计时
        clearInterval(window._schedulerRefreshTimer);
        window._schedulerRefreshTimer = setInterval(loadSchedulerTasks, 60000);
      } catch (e) {
        console.error('加载定时任务失败:', e);
        tbody.innerHTML = '';
        toast('加载定时任务失败', 'error');
      }
    }

    function formatCountdown(ms) {
      if (ms <= 0) return '即将执行';
      const totalSec = Math.floor(ms / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      if (days > 0) return `${days}天${hours}小时后`;
      if (hours > 0) return `${hours}小时${mins}分钟后`;
      if (mins > 0) return `${mins}分钟后`;
      return '不到1分钟';
    }

    // 简易 cron 中文描述（前端版）
    function describeCronLocal(expr) {
      try {
        const parts = expr.trim().split(/\s+/);
        if (parts.length !== 5) return expr;
        const [min, hour, day, month, dow] = parts;
        const dowNames = ['日', '一', '二', '三', '四', '五', '六'];
        let desc = '';
        if (month !== '*') desc += month + '月 ';
        if (day !== '*') desc += day + '日 ';
        if (hour !== '*' && min !== '*') {
          desc += String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
        } else if (hour !== '*' && min === '0') {
          desc += '每小时整点';
        } else if (min !== '*' && hour === '*') {
          desc += '每小时第' + min + '分钟';
        }
        if (dow !== '*') {
          desc += ' 周' + dow.split(',').map(d => dowNames[parseInt(d)] || d).join('');
        }
        if (!desc) desc = hour === '*' && min === '*' ? '每分钟' : expr;
        return desc;
      } catch { return expr; }
    }

    async function showSchedulerTaskModal(editId) {
      // 加载节目源列表
      if (!schedulerSourceCache.length) {
        try {
          const srcRes = await api('/sources/m3u');
          schedulerSourceCache = (srcRes && srcRes.ok && srcRes.data) ? srcRes.data : [];
        } catch {
          schedulerSourceCache = [];
        }
      }

      // 加载分组列表
      if (!schedulerGroupCache.length) {
        try {
          const grpRes = await api('/channels/groups');
          schedulerGroupCache = (grpRes && grpRes.ok && grpRes.data) ? grpRes.data : [];
        } catch {
          schedulerGroupCache = [];
        }
      }

      let task = null;
      if (editId) {
        try {
          const res = await api('/scheduler/tasks');
          task = (res && res.data || []).find(t => t.id === editId) || null;
        } catch {}
      }

      const sourceOptions = schedulerSourceCache.map(s =>
        `<option value="${s.id}" ${task && task.sourceId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
      ).join('');

      const groupOptions = schedulerGroupCache.map(g =>
        `<option value="${esc(g)}" ${task && task.exportConfig && task.exportConfig.groups.includes(g) ? 'selected' : ''}>${esc(g)}</option>`
      ).join('');

      const cronPresets = [
        { label: '每小时', value: '0 * * * *' },
        { label: '每天 3:00', value: '0 3 * * *' },
        { label: '每天 6:00', value: '0 6 * * *' },
        { label: '每周一 3:00', value: '0 3 * * 1' },
        { label: '每月 1 号 3:00', value: '0 3 1 * *' },
        { label: '每 6 小时', value: '0 */6 * * *' },
      ];
      const presetBtns = cronPresets.map(p =>
        `<button class="btn btn-sm" type="button" onclick="document.getElementById('taskCron').value='${p.value}';document.getElementById('cronDesc').textContent='${esc(p.label)}'" style="margin:2px;">${p.label}</button>`
      ).join('');

      const taskType = task?.type || 'import';

      showModal(editId ? '编辑定时任务' : '新建定时任务', `
        <div class="form-group">
          <label>任务类型 *</label>
          <select id="taskType" style="width:100%;padding:8px 12px;" onchange="toggleTaskType(this.value)">
            <option value="import" ${taskType === 'import' ? 'selected' : ''}>导入频道</option>
            <option value="export" ${taskType === 'export' ? 'selected' : ''}>导出频道</option>
          </select>
        </div>
        <div class="form-group">
          <label>任务名称</label>
          <input type="text" id="taskName" placeholder="例如：每日更新频道" value="${task ? esc(task.name) : ''}" style="width:100%;padding:8px 12px;">
        </div>
        <div class="form-group" id="sourceGroup">
          <label>节目源 *</label>
          <select id="taskSource" style="width:100%;padding:8px 12px;">
            <option value="">-- 请选择节目源 --</option>
            ${sourceOptions}
          </select>
        </div>
        <div class="form-group" id="exportGroup" style="display:none;">
          <label>选择分组 *</label>
          <select id="taskGroups" multiple style="width:100%;padding:8px 12px;height:120px;">
            ${groupOptions}
          </select>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">按住 Ctrl/Cmd 多选</div>
        </div>
        <div class="form-group" id="exportFilenameGroup" style="display:none;">
          <label>导出文件名</label>
          <input type="text" id="taskFilename" placeholder="例如：channels.m3u" value="${task && task.exportConfig?.filename || ''}" style="width:100%;padding:8px 12px;">
        </div>
        <div class="form-group">
          <label>执行周期 (Cron 表达式) *</label>
          <input type="text" id="taskCron" placeholder="例如: 0 3 * * * (每天3点)" value="${task ? esc(task.cron) : '0 3 * * *'}" style="width:100%;padding:8px 12px;font-family:monospace;" oninput="document.getElementById('cronDesc').textContent=describeCronLocal(this.value)">
          <div style="font-size:12px;color:var(--muted);margin-top:4px;" id="cronDesc">${task ? esc(describeCronLocal(task.cron)) : '每天 03:00'}</div>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${presetBtns}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:8px;">格式: 分 时 日 月 星期（标准 5 段 cron）</div>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="saveSchedulerTask('${editId || ''}')">${editId ? '保存' : '创建'}</button>
      `);

      // 初始化任务类型
      if (task) {
        toggleTaskType(task.type);
      }
    }

    function toggleTaskType(type) {
      const sourceGroup = document.getElementById('sourceGroup');
      const exportGroup = document.getElementById('exportGroup');
      const exportFilenameGroup = document.getElementById('exportFilenameGroup');

      if (type === 'import') {
        sourceGroup.style.display = 'block';
        exportGroup.style.display = 'none';
        exportFilenameGroup.style.display = 'none';
      } else if (type === 'export') {
        sourceGroup.style.display = 'none';
        exportGroup.style.display = 'block';
        exportFilenameGroup.style.display = 'block';
      }
    }

    async function saveSchedulerTask(editId) {
      const name = document.getElementById('taskName').value.trim();
      const type = document.getElementById('taskType').value;
      const sourceId = document.getElementById('taskSource').value;
      const cron = document.getElementById('taskCron').value.trim();

      if (!cron) { toast('请填写 cron 表达式', 'error'); return; }

      let data = { type, name: name || undefined, cron };

      if (type === 'import') {
        if (!sourceId) { toast('请选择节目源', 'error'); return; }
        data.sourceId = sourceId;
      } else if (type === 'export') {
        const groupsSelect = document.getElementById('taskGroups');
        const selectedGroups = Array.from(groupsSelect.selectedOptions).map(opt => opt.value);

        if (selectedGroups.length === 0) { toast('请选择至少一个分组', 'error'); return; }

        const filename = document.getElementById('taskFilename').value.trim();
        if (!filename) { toast('请填写导出文件名', 'error'); return; }

        data.exportConfig = {
          groups: selectedGroups,
          filename: filename
        };
      }

      try {
        let res;
        if (editId) {
          res = await api('/scheduler/tasks/' + editId, {
            method: 'PUT',
            body: JSON.stringify(data)
          });
        } else {
          res = await api('/scheduler/tasks', {
            method: 'POST',
            body: JSON.stringify(data)
          });
        }

        if (res && res.ok) {
          toast(editId ? '任务已更新' : '任务已创建', 'success');
          closeModal();
          loadSchedulerTasks();
        } else {
          toast(res ? res.message : '操作失败', 'error');
        }
      } catch (e) {
        toast('操作失败: ' + (e.message || ''), 'error');
      }
    }

    async function toggleSchedulerTask(id, enabled) {
      try {
        const res = await api('/scheduler/tasks/' + id, {
          method: 'PUT',
          body: JSON.stringify({ enabled })
        });
        if (res && res.ok) {
          toast(enabled ? '任务已启用' : '任务已停用', 'success');
          loadSchedulerTasks();
        } else {
          toast('操作失败', 'error');
          loadSchedulerTasks();
        }
      } catch (e) {
        toast('操作失败', 'error');
        loadSchedulerTasks();
      }
    }

    async function deleteSchedulerTask(id) {
      if (!confirm('确定要删除该定时任务吗？')) return;
      try {
        const res = await api('/scheduler/tasks/' + id, { method: 'DELETE' });
        if (res && res.ok) {
          toast('任务已删除', 'success');
          loadSchedulerTasks();
        } else {
          toast('删除失败', 'error');
        }
      } catch (e) {
        toast('删除失败', 'error');
      }
    }

    async function runSchedulerTask(id) {
      if (!confirm('确定要立即执行该任务吗？')) return;
      toast('正在执行导入任务...', 'info');
      try {
        const res = await api('/scheduler/tasks/' + id + '/run', { method: 'POST' });
        if (res && res.ok) {
          const d = res.data || {};
          if (d.success) {
            toast(`执行成功，导入 ${d.imported} 个频道，耗时 ${d.duration}ms`, 'success');
          } else {
            toast(`执行失败: ${d.error}`, 'error');
          }
          loadSchedulerTasks();
        } else {
          toast(res ? res.message : '执行失败', 'error');
        }
      } catch (e) {
        toast('执行失败: ' + (e.message || ''), 'error');
      }
    }

    async function batchDeleteChannels() {
      if (selectedChannelIds.size === 0) {
        toast('请选择要删除的频道', 'error');
        return;
      }

      const channelIds = Array.from(selectedChannelIds);
      const count = channelIds.length;
      if (!confirm(`确定要删除选中的 ${count} 个频道吗？`)) return;

      showBatchProgressModal('批量删除', ['准备删除数据', '提交到服务器', '完成']);
      updateBatchProgress(1, 3, '正在删除...', '共 ' + count + ' 个频道');

      try {
        updateBatchProgress(2, 3, '正在删除...', '提交删除请求中');
        const res = await api('/channels/batch/delete', {
          method: 'POST',
          body: JSON.stringify({ ids: channelIds })
        });

        if (res && res.ok) {
          channelIds.forEach(id => selectedChannelIds.delete(id));
          setBatchProgressDone('删除完成', '成功删除 ' + count + ' 个频道', true);
        } else {
          setBatchProgressFail('删除失败', res ? res.message : '服务器返回错误');
        }
      } catch (e) {
        setBatchProgressFail('删除失败', '网络请求异常');
      }
    }

