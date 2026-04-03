    // ========== EPG 管理 ==========
    let epgChannelPage = 1;
    const EPG_CHANNEL_PAGE_SIZE = 10;
    let epgChannelSearchDebounceTimer = null;

    async function loadEpgChannels() {
      const keyword = String(document.getElementById('epgChannelSearch')?.value || '').trim().toLowerCase();
      epgCurrentFilter.keyword = keyword;
      setTableSkeleton('epgChannelTableBody', 8, 4);
      
      try {
        const res = await api('/epg/channels');
        const tableBody = document.getElementById('epgChannelTableBody');
        let rows = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
        
        // 搜索过滤
        if (keyword) {
          rows = rows.filter(ch => String(ch.name || '').toLowerCase().includes(keyword));
        }
        
        // 分组过滤
        if (epgCurrentFilter.group) {
          rows = rows.filter(ch => (ch.group || '未分组') === epgCurrentFilter.group);
        }
        
        // 状态过滤
        if (epgCurrentFilter.status === 'updated') {
          rows = rows.filter(ch => ch.lastUpdate);
        } else if (epgCurrentFilter.status === 'not-updated') {
          rows = rows.filter(ch => !ch.lastUpdate);
        }
        
        // 更新分组下拉框选项
        updateEpgGroupFilter(rows);
        
        if (rows.length) {
          const totalPages = Math.max(1, Math.ceil(rows.length / EPG_CHANNEL_PAGE_SIZE));
          if (epgChannelPage > totalPages) epgChannelPage = totalPages;
          const slice = rows.slice((epgChannelPage - 1) * EPG_CHANNEL_PAGE_SIZE, epgChannelPage * EPG_CHANNEL_PAGE_SIZE);
          
          updateResultCount('epgChannelResultCount', slice.length, rows.length);
          tableBody.innerHTML = slice.map(ch => {
            const strategyLabels = {
              'auto': '自动匹配',
              'manual': '手动绑定',
              'custom': '自定义映射',
              'smart': '智能学习'
            };
            const strategyLabel = strategyLabels[ch.strategy || 'auto'] || '自动匹配';
            const statusClass = ch.lastUpdate ? 'online' : 'offline';
            const statusText = ch.lastUpdate ? '已更新' : '未更新';
            const lastUpdateText = ch.lastUpdate ? new Date(ch.lastUpdate).toLocaleString() : '-';
            const isChecked = epgSelectedIds.includes(ch.id) ? 'checked' : '';
            
            return `<tr>
              <td>
                <input type="checkbox" value="${ch.id}" ${isChecked} onchange="updateEpgSelection('${ch.id}', this.checked)">
              </td>
              <td><b>${esc(ch.name)}</b></td>
              <td><span style="font-size:12px;color:var(--muted);">${esc(ch.group || '未分组')}</span></td>
              <td>${esc(ch.epgSource || '-')}</td>
              <td><span class="badge">${esc(strategyLabel)}</span></td>
              <td><span class="status-dot ${statusClass}"></span>${statusText}</td>
              <td>${lastUpdateText}</td>
              <td class="btn-group">
                <button class="btn btn-sm" onclick="showEpgChannelModal('${ch.id || ''}')">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteEpgChannel('${ch.id || ''}')">删除</button>
              </td>
            </tr>`;
          }).join('');
          
          renderPagination({
            rootId: 'epgChannelPagination',
            totalItems: rows.length,
            pageSize: EPG_CHANNEL_PAGE_SIZE,
            page: epgChannelPage,
            setPage: (v) => { epgChannelPage = v; },
            onChange: loadEpgChannels
          });
        } else {
          setTableEmptyRow('epgChannelTableBody', 8, '暂无 EPG 频道配置', '📺');
          const pagination = document.getElementById('epgChannelPagination');
          if (pagination) {
            pagination.style.display = 'none';
            pagination.innerHTML = '';
          }
        }
      } catch (e) {
        setTableEmptyRow('epgChannelTableBody', 8, '加载 EPG 频道失败', '⚠️');
        updateResultCount('epgChannelResultCount', 0, 0);
        const pagination = document.getElementById('epgChannelPagination');
        if (pagination) {
          pagination.style.display = 'none';
          pagination.innerHTML = '';
        }
        toast('加载 EPG 频道失败', 'error');
      }
    }
    
    /**
     * 更新分组过滤器的选项
     */
    function updateEpgGroupFilter(rows) {
      const groups = [...new Set(rows.map(ch => ch.group || '未分组').filter(Boolean))].sort();
      const select = document.getElementById('epgGroupFilter');
      if (select) {
        const currentValue = select.value;
        const options = '<option value="">全部分组</option>' + 
          groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
        select.innerHTML = options;
        select.value = currentValue;
      }
    }
    
    function handleEpgChannelSearch() {
      clearTimeout(epgChannelSearchDebounceTimer);
      epgChannelSearchDebounceTimer = setTimeout(() => {
        epgChannelPage = 1;
        loadEpgChannels();
      }, 300);
    }

    async function showEpgChannelModal(id) {
      const isEdit = !!id;
      let existingData = {};
      
      if (isEdit) {
        try {
          const res = await api('/epg/channels/' + id);
          if (res && res.ok && res.data) {
            existingData = res.data;
          }
        } catch (e) {
          toast('加载 EPG 频道数据失败', 'error');
          return;
        }
      }
      
      // 加载 EPG 源列表
      let epgSources = [];
      try {
        const res = await api('/sources/epg');
        if (res && res.ok && Array.isArray(res.data)) {
          epgSources = res.data;
        }
      } catch (e) {
        console.error('加载 EPG 源失败:', e);
      }
      
      const epgSourceOptions = epgSources.map(s => 
        `<option value="${esc(s.name)}" ${(existingData.epgSource === s.name) ? 'selected' : ''}>${esc(s.name)}</option>`
      ).join('');
      
      const strategy = existingData.strategy || 'auto';
      const customMapping = existingData.customMapping || '';
      const group = existingData.group || '未分组';
      
      showModal(isEdit ? '编辑 EPG 频道' : '添加 EPG 频道', `
        <div class="form-group">
          <label>频道名称 *</label>
          <input id="epgChannelName" value="${esc(existingData.name || '')}" ${isEdit ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label>分组</label>
          <input id="epgChannelGroup" value="${esc(group)}" placeholder="例如：CCTV、卫视">
        </div>
        <div class="form-group">
          <label>EPG 源</label>
          <select id="epgChannelSource">
            <option value="">自动选择</option>
            ${epgSourceOptions}
          </select>
        </div>
        <div class="form-group">
          <label>加载策略</label>
          <select id="epgChannelStrategy" onchange="toggleCustomMapping(this.value)">
            <option value="auto" ${strategy === 'auto' ? 'selected' : ''}>自动匹配</option>
            <option value="manual" ${strategy === 'manual' ? 'selected' : ''}>手动绑定</option>
            <option value="custom" ${strategy === 'custom' ? 'selected' : ''}>自定义映射</option>
            <option value="smart" ${strategy === 'smart' ? 'selected' : ''}>智能学习</option>
          </select>
        </div>
        <div class="form-group" id="customMappingGroup" style="display: ${strategy === 'custom' ? 'block' : 'none'};">
          <label>EPG ID 映射</label>
          <input id="epgCustomMapping" value="${esc(customMapping)}" placeholder="例如：CCTV1=央视一套">
          <small style="color:var(--muted);margin-top:4px;display:block;">格式：频道名称=EPG ID，多个用逗号分隔</small>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="saveEpgChannel('${id || ''}')">保存</button>
      `);
    }
    
    function toggleCustomMapping(strategy) {
      const group = document.getElementById('customMappingGroup');
      if (group) {
        group.style.display = strategy === 'custom' ? 'block' : 'none';
      }
    }
    
    async function saveEpgChannel(id) {
      const name = document.getElementById('epgChannelName')?.value?.trim();
      const group = document.getElementById('epgChannelGroup')?.value?.trim();
      const epgSource = document.getElementById('epgChannelSource')?.value?.trim();
      const strategy = document.getElementById('epgChannelStrategy')?.value?.trim();
      const customMapping = document.getElementById('epgCustomMapping')?.value?.trim();
      
      if (!name) {
        toast('请输入频道名称', 'error');
        return;
      }
      
      const data = {
        name,
        group: group || '未分组',
        epgSource: epgSource || null,
        strategy: strategy || 'auto',
        customMapping: customMapping || null
      };
      
      try {
        const res = id 
          ? await api('/epg/channels/' + id, { method: 'PUT', body: JSON.stringify(data) })
          : await api('/epg/channels', { method: 'POST', body: JSON.stringify(data) });
        
        if (res && res.ok) {
          toast(id ? '更新成功' : '添加成功', 'success');
          closeModal();
          loadEpgChannels();
        } else {
          toast(res?.message || '操作失败', 'error');
        }
      } catch (e) {
        console.error('保存 EPG 频道失败:', e);
        toast('保存失败', 'error');
      }
    }
    
    async function deleteEpgChannel(id) {
      if (!id) {
        toast('无效的频道 ID', 'error');
        return;
      }
      
      if (!confirm('确定要删除这个 EPG 频道配置吗？')) {
        return;
      }
      
      try {
        const res = await api('/epg/channels/' + id, { method: 'DELETE' });
        if (res && res.ok) {
          toast('删除成功', 'success');
          loadEpgChannels();
        } else {
          toast(res?.message || '删除失败', 'error');
        }
      } catch (e) {
        console.error('删除 EPG 频道失败:', e);
        toast('删除失败', 'error');
      }
    }
    
    async function updateEpgChannelStrategy(id, strategy) {
      // 这个函数可以用于快速更新策略，暂不实现
      toast('请在编辑界面修改加载策略', 'info');
    }
    
    // 全局变量
    let epgSelectedIds = [];
    let epgCurrentFilter = {
      keyword: '',
      group: '',
      status: ''
    };
    let allChannels = []; // 缓存所有频道数据
    let epgGroups = []; // 缓存分组列表

    /**
     * 从频道列表导入 EPG 配置
     */
    async function showImportFromChannelsModal() {
      try {
        // 加载频道列表
        const res = await api('/channels');
        if (res && res.ok && Array.isArray(res.data)) {
          allChannels = res.data;
          
          // 提取分组列表
          const groups = [...new Set(allChannels.map(ch => ch.group || '未分组').filter(Boolean))];
          epgGroups = groups.sort();
          
          // 更新分组下拉框
          const groupOptions = epgGroups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
          
          showModal('从频道列表导入', `
            <div style="margin-bottom:16px;">
              <p style="color:var(--muted);margin-bottom:12px;">选择要导入的频道，系统会自动创建 EPG 配置</p>
              <div style="display:flex;gap:8px;margin-bottom:12px;">
                <select id="importGroupFilter" onchange="filterImportChannels()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-main);font-size:13px;">
                  <option value="">全部分组</option>
                  ${groupOptions}
                </select>
                <input type="text" id="importChannelSearch" placeholder="搜索频道..." oninput="filterImportChannels()" 
                  style="flex:1;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-main);font-size:13px;">
              </div>
              <div style="margin-bottom:8px;font-size:13px;color:var(--muted);">
                已选择 <span id="importSelectedCount" style="color:var(--primary);font-weight:600;">0</span> 个频道
              </div>
            </div>
            <div id="importChannelList" style="max-height:400px;overflow-y:auto;">
              ${renderImportChannelList(allChannels)}
            </div>
          `, `
            <button class="btn" onclick="closeModal()">取消</button>
            <button class="btn btn-primary" onclick="doImportFromChannels()">
              <span>✅</span> 批量导入
            </button>
          `);
        }
      } catch (e) {
        toast('加载频道列表失败', 'error');
      }
    }
    
    function renderImportChannelList(channels) {
      return channels.map(ch => {
        const isChecked = epgSelectedIds.includes(ch.id) ? 'checked' : '';
        return `
          <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">
            <input type="checkbox" value="${ch.id}" data-name="${esc(ch.name)}" ${isChecked} onchange="updateImportSelection(this)">
            <span style="flex:1;">${esc(ch.name)}</span>
            <span style="font-size:12px;color:var(--muted);">${esc(ch.group || '未分组')}</span>
          </div>
        `;
      }).join('');
    }
    
    function filterImportChannels() {
      const group = document.getElementById('importGroupFilter')?.value || '';
      const keyword = document.getElementById('importChannelSearch')?.value?.toLowerCase() || '';
      
      let filtered = allChannels;
      
      if (group) {
        filtered = filtered.filter(ch => (ch.group || '未分组') === group);
      }
      
      if (keyword) {
        filtered = filtered.filter(ch => ch.name.toLowerCase().includes(keyword));
      }
      
      document.getElementById('importChannelList').innerHTML = renderImportChannelList(filtered);
    }
    
    function updateImportSelection(checkbox) {
      const channelId = checkbox.value;
      const index = epgSelectedIds.indexOf(channelId);
      
      if (checkbox.checked) {
        if (index === -1) {
          epgSelectedIds.push(channelId);
        }
      } else {
        if (index !== -1) {
          epgSelectedIds.splice(index, 1);
        }
      }
      
      document.getElementById('importSelectedCount').textContent = epgSelectedIds.length;
    }
    
    async function doImportFromChannels() {
      if (epgSelectedIds.length === 0) {
        toast('请至少选择一个频道', 'error');
        return;
      }
      
      const channelsToImport = allChannels.filter(ch => epgSelectedIds.includes(ch.id));
      let successCount = 0;
      let skipCount = 0;
      
      for (const channel of channelsToImport) {
        try {
          const data = {
            name: channel.name,
            group: channel.group || '未分组',
            strategy: 'auto'
          };
          
          const res = await api('/epg/channels', {
            method: 'POST',
            body: JSON.stringify(data)
          });
          
          if (res && res.ok) {
            successCount++;
          }
        } catch (e) {
          if (e.message && e.message.includes('已存在')) {
            skipCount++;
          }
        }
      }
      
      closeModal();
      epgSelectedIds = [];
      loadEpgChannels();
      
      let msg = `成功导入 ${successCount} 个频道`;
      if (skipCount > 0) {
        msg += `，跳过 ${skipCount} 个已存在的频道`;
      }
      toast(msg, 'success');
    }
    
    /**
     * 全选/取消全选
     */
    function toggleEpgSelectAll(checkbox) {
      const checkboxes = document.querySelectorAll('#epgChannelTableBody input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const channelId = cb.value;
        const index = epgSelectedIds.indexOf(channelId);
        
        if (checkbox.checked && index === -1) {
          epgSelectedIds.push(channelId);
        } else if (!checkbox.checked && index !== -1) {
          epgSelectedIds.splice(index, 1);
        }
      });
    }
    
    /**
     * 更新选中状态
     */
    function updateEpgSelection(channelId, checked) {
      const index = epgSelectedIds.indexOf(channelId);
      if (checked && index === -1) {
        epgSelectedIds.push(channelId);
      } else if (!checked && index !== -1) {
        epgSelectedIds.splice(index, 1);
      }
    }
