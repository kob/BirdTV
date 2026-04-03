    /**
     * 批量设置策略
     */
    async function batchSetStrategy(strategy) {
      if (epgSelectedIds.length === 0) {
        toast('请先选择要操作的频道', 'error');
        return;
      }
      
      const strategyNames = {
        'auto': '自动匹配',
        'manual': '手动绑定',
        'custom': '自定义映射',
        'smart': '智能学习'
      };
      
      if (!confirm(`确定要将选中的 ${epgSelectedIds.length} 个频道设为"${strategyNames[strategy]}"吗？`)) {
        return;
      }
      
      let successCount = 0;
      for (const id of epgSelectedIds) {
        try {
          await api('/epg/channels/' + id, {
            method: 'PUT',
            body: JSON.stringify({ strategy })
          });
          successCount++;
        } catch (e) {
          console.error('更新失败:', id, e);
        }
      }
      
      epgSelectedIds = [];
      loadEpgChannels();
      toast(`成功更新 ${successCount} 个频道的策略`, 'success');
    }
    
    /**
     * 批量删除
     */
    async function batchDeleteEpgChannels() {
      if (epgSelectedIds.length === 0) {
        toast('请先选择要删除的频道', 'error');
        return;
      }
      
      if (!confirm(`确定要删除选中的 ${epgSelectedIds.length} 个 EPG 频道配置吗？`)) {
        return;
      }
      
      let successCount = 0;
      for (const id of epgSelectedIds) {
        try {
          await api('/epg/channels/' + id, { method: 'DELETE' });
          successCount++;
        } catch (e) {
          console.error('删除失败:', id, e);
        }
      }
      
      epgSelectedIds = [];
      loadEpgChannels();
      toast(`成功删除 ${successCount} 个频道配置`, 'success');
    }
    
    /**
     * 分组过滤
     */
    function handleEpgGroupFilter() {
      epgCurrentFilter.group = document.getElementById('epgGroupFilter')?.value || '';
      epgPage = 1;
      loadEpgChannels();
    }
    
    /**
     * 状态过滤
     */
    function handleEpgStatusFilter() {
      epgCurrentFilter.status = document.getElementById('epgStatusFilter')?.value || '';
      epgPage = 1;
      loadEpgChannels();
    }
    
    /**
     * 显示批量设置分组模态框
     */
    async function showBatchSetGroupModal() {
      if (epgSelectedIds.length === 0) {
        toast('请先选择要设置的频道', 'error');
        return;
      }
      
      try {
        // 获取所有分组
        const res = await api('/epg/groups');
        let groups = [];
        if (res && res.ok && Array.isArray(res.data)) {
          groups = res.data;
        }
        
        // 添加预设分组
        const presetGroups = ['CCTV', '卫视', '地方台', '港澳', '国际', '影视', '体育', '新闻', '少儿', '其他'];
        const allGroups = [...new Set([...groups, ...presetGroups])].sort();
        
        const groupOptions = allGroups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
        
        showModal('批量设置分组', `
          <div style="margin-bottom:16px;">
            <p style="color:var(--muted);margin-bottom:12px;">已选择 <span style="color:var(--primary);font-weight:600;">${epgSelectedIds.length}</span> 个频道</p>
          </div>
          <div class="form-group">
            <label>选择分组 *</label>
            <select id="batchGroupSelect">
              <option value="">请选择分组</option>
              ${groupOptions}
              <option value="custom">-- 自定义分组 --</option>
            </select>
          </div>
          <div class="form-group" id="customGroupInput" style="display:none;">
            <label>自定义分组名称</label>
            <input type="text" id="customGroupName" placeholder="输入分组名称">
          </div>
        `, `
          <button class="btn" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="doBatchSetGroup()">
            <span>✅</span> 确认设置
          </button>
        `);
        
        // 监听下拉框变化
        setTimeout(() => {
          const select = document.getElementById('batchGroupSelect');
          if (select) {
            select.addEventListener('change', function() {
              const customDiv = document.getElementById('customGroupInput');
              if (customDiv) {
                customDiv.style.display = this.value === 'custom' ? 'block' : 'none';
              }
            });
          }
        }, 100);
      } catch (e) {
        toast('加载分组失败', 'error');
      }
    }
    
    /**
     * 执行批量设置分组
     */
    async function doBatchSetGroup() {
      const select = document.getElementById('batchGroupSelect');
      const customInput = document.getElementById('customGroupName');
      
      let group = select?.value;
      if (group === 'custom') {
        group = customInput?.value?.trim();
        if (!group) {
          toast('请输入自定义分组名称', 'error');
          return;
        }
      }
      
      if (!group) {
        toast('请选择或输入分组名称', 'error');
        return;
      }
      
      try {
        const res = await api('/epg/batch-set-group', {
          method: 'POST',
          body: JSON.stringify({
            ids: epgSelectedIds,
            group
          })
        });
        
        if (res && res.ok) {
          toast(res.message || '设置成功', 'success');
          closeModal();
          epgSelectedIds = [];
          loadEpgChannels();
        } else {
          toast(res?.message || '操作失败', 'error');
        }
      } catch (e) {
        console.error('批量设置分组失败:', e);
        toast('操作失败', 'error');
      }
    }
    
    /**
     * 显示分组管理模态框
     */
    async function showGroupManageModal() {
      try {
        // 获取所有分组
        const res = await api('/epg/groups');
        let groups = [];
        if (res && res.ok && Array.isArray(res.data)) {
          groups = res.data;
        }
        
        // 预设分组
        const presetGroups = ['CCTV', '卫视', '地方台', '港澳', '国际', '影视', '体育', '新闻', '少儿', '其他'];
        const allGroups = [...new Set([...groups, ...presetGroups])].sort();
        
        showModal('分组管理', `
          <div style="margin-bottom:16px;">
            <p style="color:var(--muted);margin-bottom:12px;">管理系统预设分组和已有分组</p>
          </div>
          <div class="form-group">
            <label>添加新分组</label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="newGroupName" placeholder="输入分组名称" 
                style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-main);">
              <button class="btn btn-primary btn-sm" onclick="addNewGroup()">
                <span>➕</span> 添加
              </button>
            </div>
          </div>
          <div style="margin-top:16px;">
            <label style="display:block;margin-bottom:8px;">已有分组 (${allGroups.length}个)</label>
            <div id="groupList" style="max-height:300px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:8px;">
              ${allGroups.map(g => `
                <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.08);border-radius:6px;font-size:13px;">
                  <span>${esc(g)}</span>
                  ${!presetGroups.includes(g) ? `
                    <button onclick="deleteGroup('${esc(g)}')" 
                      style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:14px;"
                      title="删除分组">✕</button>
                  ` : `
                    <span style="color:var(--muted);font-size:11px;" title="预设分组">📌</span>
                  `}
                </div>
              `).join('')}
            </div>
          </div>
          <div style="margin-top:16px;padding:12px;background:rgba(122,193,255,0.1);border-radius:6px;font-size:12px;color:var(--muted);">
            <strong>💡 说明：</strong><br>
            • 预设分组（📌）不可删除，用于快速设置<br>
            • 可添加自定义分组，无频道使用时可删除<br>
            • 删除分组不会影响已关联的频道，只会重置为"未分组"
          </div>
        `, `
          <button class="btn" onclick="closeModal()">关闭</button>
        `);
      } catch (e) {
        toast('加载分组失败', 'error');
      }
    }
    
    /**
     * 添加新分组
     */
    async function addNewGroup() {
      const input = document.getElementById('newGroupName');
      const groupName = input?.value?.trim();
      
      if (!groupName) {
        toast('请输入分组名称', 'error');
        return;
      }
      
      // 检查是否已存在
      const res = await api('/epg/groups');
      if (res && res.ok && Array.isArray(res.data)) {
        if (res.data.includes(groupName)) {
          toast('该分组已存在', 'error');
          return;
        }
      }
      
      // 添加到任意频道来创建分组（临时方案）
      // 实际上分组是自动从频道中提取的，不需要单独存储
      toast('分组已添加到预设列表', 'success');
      input.value = '';
      showGroupManageModal(); // 刷新显示
    }
    
    /**
     * 删除分组
     */
    async function deleteGroup(groupName) {
      if (!confirm(`确定要删除分组"${groupName}"吗？\n\n注意：已关联该分组的频道将被设置为"未分组"`)) {
        return;
      }
      
      try {
        // 获取该分组下的所有频道
        const res = await api('/epg/channels');
        if (res && res.ok && Array.isArray(res.data)) {
          const channelsInGroup = res.data.filter(ch => ch.group === groupName);
          
          if (channelsInGroup.length > 0) {
            // 批量设置为未分组
            const ids = channelsInGroup.map(ch => ch.id);
            await api('/epg/batch-set-group', {
              method: 'POST',
              body: JSON.stringify({ ids, group: '未分组' })
            });
          }
          
          toast(`分组"${groupName}"已删除`, 'success');
          showGroupManageModal(); // 刷新显示
        }
      } catch (e) {
        console.error('删除分组失败:', e);
        toast('删除分组失败', 'error');
      }
    }

    let currentEditingSource = null; // 用于存储当前编辑的源信息

    async function showSourceModal(type, id) {
      const label = type === 'm3u' ? '节目' : 'EPG';
      const isEdit = !!id;
      let existingData = {};

      // 如果是编辑模式，加载现有数据
      if (isEdit) {
        try {
          const res = await api('/sources/' + type + '/' + id);
          if (res && res.ok && res.data) {
            existingData = res.data;
          }
        } catch (e) {
          toast('加载源数据失败', 'error');
          return;
        }
      }

      let extraFields = '';
      if (type === 'm3u') {
        const playerType = existingData.defaultPlayerType || 'auto';
        const proxyMode = existingData.proxyMode || 'auto';
        const userAgent = existingData.userAgent || '';
        extraFields = `
          <div class="form-group">
            <label>默认播放器</label>
            <select id="srcPlayerType">
              <option value="auto" ${playerType === 'auto' ? 'selected' : ''}>自动检测</option>
              <option value="vlc-proxy" ${playerType === 'vlc-proxy' ? 'selected' : ''}>VLC代理链接</option>
              <option value="vlc-direct" ${playerType === 'vlc-direct' ? 'selected' : ''}>VLC直链</option>
              <option value="shaka" ${playerType === 'shaka' ? 'selected' : ''}>Shaka Player (MPD/DASH)</option>
              <option value="hls" ${playerType === 'hls' ? 'selected' : ''}>ArtPlayer (HLS/m3u8)</option>
              <option value="mpegts" ${playerType === 'mpegts' ? 'selected' : ''}>mpegts.js (TS直播)</option>
              <option value="native" ${playerType === 'native' ? 'selected' : ''}>原生视频元素</option>
            </select>
          </div>
          <div class="form-group">
            <label>代理模式</label>
            <select id="srcProxyMode">
              <option value="auto" ${proxyMode === 'auto' ? 'selected' : ''}>自动识别</option>
              <option value="proxy" ${proxyMode === 'proxy' ? 'selected' : ''}>代理优先</option>
              <option value="direct" ${proxyMode === 'direct' ? 'selected' : ''}>直连优先</option>
            </select>
          </div>
          <div class="form-group">
            <label>User Agent (请求该节目源时使用)</label>
            <select id="srcUserAgent" onchange="if(this.value==='__custom__'){document.getElementById('srcUserAgentCustom').style.display='block';}else{document.getElementById('srcUserAgentCustom').style.display='none';}">
              <option value="" ${!userAgent ? 'selected' : ''}>使用全局默认</option>
              <option value="okhttp" ${userAgent === 'okhttp' ? 'selected' : ''}>默认 (okhttp)</option>
              <option value="VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7" ${userAgent === 'VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7' ? 'selected' : ''}>VLC for Android</option>
              <option value="MXPlayer/1.58.1" ${userAgent === 'MXPlayer/1.58.1' ? 'selected' : ''}>MX Player</option>
              <option value="IPTV Smarters Pro/4.2" ${userAgent === 'IPTV Smarters Pro/4.2' ? 'selected' : ''}>IPTV Smarters</option>
              <option value="Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36" ${userAgent === 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36' ? 'selected' : ''}>Chrome Mobile</option>
              <option value="Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1" ${userAgent === 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1' ? 'selected' : ''}>Safari iOS</option>
              <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" ${userAgent === 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' ? 'selected' : ''}>Windows Chrome</option>
              <option value="__custom__" ${userAgent && !['okhttp', 'VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7', 'MXPlayer/1.58.1', 'IPTV Smarters Pro/4.2', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'].includes(userAgent) ? 'selected' : ''}>自定义...</option>
            </select>
            <input id="srcUserAgentCustom" value="${userAgent && !['okhttp', 'VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7', 'MXPlayer/1.58.1', 'IPTV Smarters Pro/4.2', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'].includes(userAgent) ? esc(userAgent) : ''}" placeholder="输入自定义UA" style="margin-top:8px;display:${userAgent && !['okhttp', 'VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7', 'MXPlayer/1.58.1', 'IPTV Smarters Pro/4.2', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'].includes(userAgent) ? 'block' : 'none'};">
          </div>
        `;
      }

      showModal((isEdit ? '编辑' : '添加') + label + '源', `
        <div class="form-group" id="srcNameGroup"><label>名称 *</label><input id="srcName" value="${esc(existingData.name || '')}" oninput="document.getElementById('srcNameGroup').classList.remove('has-error');var e=document.getElementById('srcNameError');if(e){e.textContent='';e.classList.remove('show');}"><div class="form-error" id="srcNameError"></div></div>
        <div class="form-group"><label>URL *</label><input id="srcUrl" value="${esc(existingData.url || '')}" placeholder="http://..."></div>
        ${extraFields}
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveSource('${type}'${isEdit ? `,'${id}'` : ''})">${isEdit ? '更新' : '添加'}</button>`);

      // 存储当前编辑的源 ID 和类型
      if (isEdit) {
        currentEditingSource = { type, id, data: existingData };
      } else {
        currentEditingSource = null;
      }
    }

    async function saveSource(type, id) {
      const srcNameGroup = document.getElementById('srcNameGroup');
      const srcNameError = document.getElementById('srcNameError');
      // 清除之前的错误状态
      srcNameGroup?.classList.remove('has-error');
      if (srcNameError) { srcNameError.textContent = ''; srcNameError.classList.remove('show'); }

      const data = { name: document.getElementById('srcName').value.trim(), url: document.getElementById('srcUrl').value.trim() };
      if (!data.name || !data.url) { toast('名称和URL为必填项', 'error'); return; }
      // 前端重名检查：添加模式下检查是否已存在同名源，编辑模式下排除自身
      try {
        const checkRes = await api('/sources/' + type);
        if (checkRes && checkRes.ok && Array.isArray(checkRes.data)) {
          const dup = checkRes.data.find(s => s.id !== id && s.name && s.name.trim().toLowerCase() === data.name.toLowerCase());
          if (dup) {
            if (srcNameGroup) srcNameGroup.classList.add('has-error');
            if (srcNameError) { srcNameError.textContent = '已存在相同名称的' + (type === 'm3u' ? '节目' : 'EPG') + '源'; srcNameError.classList.add('show'); }
            return;
          }
        }
      } catch (_) {}
      if (type === 'm3u') {
        data.defaultPlayerType = document.getElementById('srcPlayerType').value;
        data.proxyMode = document.getElementById('srcProxyMode').value;
        // 获取UA设置
        const uaSelect = document.getElementById('srcUserAgent');
        const uaCustom = document.getElementById('srcUserAgentCustom');
        if (uaSelect && uaSelect.value === '__custom__' && uaCustom) {
          data.userAgent = uaCustom.value.trim();
        } else if (uaSelect) {
          data.userAgent = uaSelect.value;
        }
      }

      const isEdit = !!id;
      const res = await api('/sources/' + type + (isEdit ? '/' + id : ''), { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(data) });
      if (res && res.ok) { toast(isEdit ? '更新成功' : '添加成功', 'success'); closeModal(); loadSources(); } else toast(res ? res.message : (isEdit ? '更新失败' : '添加失败'), 'error');
    }

    async function deleteSource(type, id) {
      if (!confirm('确定删除？')) return;
      const res = await api('/sources/' + type + '/' + id, { method: 'DELETE' });
      if (res && res.ok) { toast('删除成功', 'success'); loadSources(); } else toast('删除失败', 'error');
    }

