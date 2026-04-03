    // ========== 频道管理 ==========
    async function loadChannels() {
      const searchType = document.getElementById('channelSearchType')?.value || 'name';
      const q = (document.getElementById('channelSearch')?.value || '').toLowerCase();
      const sourceFilter = document.getElementById('channelSourceFilter')?.value || '';
      const tbody = document.getElementById('channelTableBody');
      const empty = document.getElementById('channelEmpty');
      const pagination = document.getElementById('channelPagination');
      setTableSkeleton('channelTableBody', 11, 8);
      if (empty) empty.style.display = 'none';
      if (pagination) pagination.style.display = 'none';
      try {
        const res = await api('/channels');
        let rows = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
        
        // 填充源名称下拉选项
        const sourceNames = [...new Set(rows.map(c => c.sourceName).filter(Boolean))].sort();
        const sourceSelect = document.getElementById('channelSourceFilter');
        if (sourceSelect) {
          const prev = sourceSelect.value;
          sourceSelect.innerHTML = '<option value="">全部</option>' + sourceNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
          sourceSelect.value = prev;
        }

        // 根据搜索类型和关键词过滤频道
        if (q && searchType !== 'source') {
          rows = rows.filter(c => {
            if (searchType === 'name') {
              return c.name.toLowerCase().includes(q);
            } else if (searchType === 'group') {
              return (c.group || '').toLowerCase().includes(q);
            }
            return true;
          });
        }

        // 源名称下拉过滤
        if (sourceFilter) {
          rows = rows.filter(c => (c.sourceName || '') === sourceFilter);
        }
        
        const total = rows.length;
        updateChannelResultCount(total, total);

        if (!rows.length) {
          tbody.innerHTML = '';
          if (empty) {
            empty.innerHTML = '<div class="empty-illustration">📺</div><p>暂无频道数据，点击右上角添加</p>';
            empty.style.display = 'block';
          }
          if (pagination) {
            pagination.style.display = 'none';
            pagination.innerHTML = '';
          }
          return;
        }

        const effectivePageSize = CHANNEL_PAGE_SIZE || total;
        const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
        if (channelPage > totalPages) {
          channelPage = totalPages;
        }
        const start = (channelPage - 1) * effectivePageSize;
        const end = start + effectivePageSize;
        const pageRows = rows.slice(start, end);
        updateChannelResultCount(pageRows.length, total);

        if (empty) empty.style.display = 'none';
        tbody.innerHTML = pageRows.map(c => {
          // 显示原始URL，与数据目录中存储的一致
          const displayUrl = c.url;
          const checked = selectedChannelIds.has(c.id) ? 'checked' : '';
          return `<tr>
          <td><input type="checkbox" class="channel-checkbox" value="${c.id}" ${checked}></td>
          <td>${c.tvgLogo ? `<img src="${esc(c.tvgLogo)}" style="width:40px;height:40px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">` : '-'}</td>
          <td><b>${esc(c.name)}</b></td>
          <td>${esc(c.tvgId || '-')}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(displayUrl)}">${esc(displayUrl)}</td>
          <td>${esc(c.group || '-')}</td>
          <td>${esc(c.sourceName || '-')}</td>
          <td><span class="tag tag-blue">${esc(c.proxyMode || 'auto')}</span></td>
          <td><span class="tag tag-green">${esc(c.playerType || 'auto')}</span></td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.drm ? JSON.stringify(c.drm) : '-'}">${c.drm ? JSON.stringify(c.drm) : '-'}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.userAgent || '-'} ">${c.userAgent || '-'}</td>
          <td class="btn-group">
            <button class="btn btn-sm" onclick="editChannel('${c.id}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteChannel('${c.id}')">删除</button>
          </td>
        </tr>`
        }).join('');

        // 绑定全选/取消全选事件（仅操作当前页，跨页选中状态保留）
        const selectAllCheckbox = document.getElementById('selectAllChannels');
        const pageIds = pageRows.map(c => c.id);
        const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selectedChannelIds.has(id));
        const pagePartialSelected = !pageAllSelected && pageIds.some(id => selectedChannelIds.has(id));
        
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = pageAllSelected;
          selectAllCheckbox.indeterminate = pagePartialSelected;
          selectAllCheckbox.addEventListener('change', function() {
            pageIds.forEach(id => {
              if (this.checked) selectedChannelIds.add(id);
              else selectedChannelIds.delete(id);
            });
            document.querySelectorAll('.channel-checkbox').forEach(cb => {
              cb.checked = this.checked;
            });
            selectAllCheckbox.indeterminate = false;
            updateBatchDeleteButton();
          });
        }
        
        const channelCheckboxes = document.querySelectorAll('.channel-checkbox');
        channelCheckboxes.forEach(cb => {
          cb.addEventListener('change', function() {
            if (this.checked) selectedChannelIds.add(this.value);
            else selectedChannelIds.delete(this.value);
            updateBatchDeleteButton();
          });
        });

        function updateBatchDeleteButton() {
          const checkedCount = selectedChannelIds.size;
          const batchDeleteBtn = document.getElementById('batchDeleteBtn');
          const batchExportBtn = document.getElementById('batchExportBtn');
          const batchEditBtn = document.getElementById('batchEditBtn');
          if (batchDeleteBtn) {
            batchDeleteBtn.style.display = checkedCount > 0 ? 'inline-flex' : 'none';
          }
          if (batchExportBtn) {
            batchExportBtn.style.display = checkedCount > 0 ? 'inline-flex' : 'none';
          }
          if (batchEditBtn) {
            batchEditBtn.style.display = checkedCount > 0 ? 'inline-flex' : 'none';
          }
        }
        renderChannelPagination(total);
      } catch (e) {
        if (empty) empty.style.display = 'none';
        updateChannelResultCount(0, 0);
        if (pagination) {
          pagination.style.display = 'none';
          pagination.innerHTML = '';
        }
        setTableEmptyRow('channelTableBody', 11, '加载频道失败，请稍后重试', '⚠️');
        toast('加载频道失败', 'error');
      }
    }

    function showChannelModal(data) {
      const isEdit = !!data;
      const d = data || {};

      // 处理 URL 显示：如果是代理地址，还原为原始 URL
      let displayUrl = d.url || '';
      if (displayUrl && (d.proxyMode === 'proxy' || d.proxyMode === 'auto')) {
        try {
          const urlObj = new URL(displayUrl);
          const urlParam = urlObj.searchParams.get('url');
          if (urlParam) {
            displayUrl = decodeURIComponent(urlParam);
          }
        } catch (e) {
          // URL 解析失败，保持原样
        }
      }

      showModal(isEdit ? '编辑频道' : '添加频道', `
        <div class="form-group"><label>频道名称 *</label><input id="chName" value="${esc(d.name || '')}"></div>
        <div class="form-group"><label>URL *</label><input id="chUrl" value="${esc(displayUrl)}" placeholder="http://..."></div>
        <div class="form-row">
          <div class="form-group"><label>代理方式</label><select id="chProxyMode"><option value="auto" ${d.proxyMode==='auto'?'selected':''}>自动</option><option value="proxy" ${d.proxyMode==='proxy'?'selected':''}>代理</option><option value="direct" ${d.proxyMode==='direct'?'selected':''}>直连</option></select></div>
          <div class="form-group"><label>播放器</label><select id="chPlayer"><option value="auto" ${d.playerType==='auto'?'selected':''}>自动</option><option value="shaka" ${d.playerType==='shaka'?'selected':''}>Shaka</option><option value="artplayer" ${d.playerType==='artplayer'?'selected':''}>ArtPlayer</option><option value="hlsjs" ${d.playerType==='hlsjs'?'selected':''}>HLS.js</option></select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>流类型</label><select id="chStreamType"><option value="auto" ${d.streamType==='auto'?'selected':''}>自动</option><option value="dash" ${d.streamType==='dash'?'selected':''}>DASH</option><option value="hls" ${d.streamType==='hls'?'selected':''}>HLS</option><option value="ts" ${d.streamType==='ts'?'selected':''}>MPEG-TS</option></select></div>
          <div class="form-group"><label>分组</label><input id="chGroup" value="${esc(d.group || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>TVG ID</label><input id="chTvgId" value="${esc(d.tvgId || '')}"></div>
          <div class="form-group"><label>Logo URL (tvg-logo)</label><input id="chTvgLogo" value="${esc(d.tvgLogo || '')}" placeholder="https://..."></div>
        </div>
        <div class="form-group"><label>DRM 信息 (JSON 格式)</label><textarea id="chDrm" rows="3" placeholder='{"clearKeys":{"kid":"key"}}'>${esc(JSON.stringify(d.drm || {}))}</textarea></div>
        <div class="form-group"><label>User Agent</label><input id="chUserAgent" value="${esc(d.userAgent || '')}" placeholder="自定义 UA"></div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveChannel('${d.id || ''}')">${isEdit ? '保存' : '添加'}</button>`);
    }

    function editChannel(id) {
      api('/channels/' + id).then(res => { if (res && res.ok) showChannelModal(res.data); });
    }

    async function saveChannel(id) {
      let drmData = {};
      try {
        drmData = JSON.parse(document.getElementById('chDrm').value.trim()) || {};
      } catch (e) {
        toast('DRM 信息格式错误', 'error');
        return;
      }

      const proxyMode = document.getElementById('chProxyMode').value;
      let url = document.getElementById('chUrl').value.trim();

      // 如果代理方式是 proxy 或 auto，将 URL 转换为代理地址
      if (proxyMode === 'proxy' || proxyMode === 'auto') {
        url = `${location.origin}/m3u-proxy?url=${encodeURIComponent(url)}`;
      }

      const data = {
        name: document.getElementById('chName').value.trim(),
        url: url,
        proxyMode: proxyMode,
        group: document.getElementById('chGroup').value.trim(),
        playerType: document.getElementById('chPlayer').value,
        streamType: document.getElementById('chStreamType').value,
        tvgId: document.getElementById('chTvgId').value.trim(),
        tvgLogo: document.getElementById('chTvgLogo').value.trim(),
        drm: drmData,
        userAgent: document.getElementById('chUserAgent').value.trim()
      };
      if (!data.name || !data.url) { toast('名称和URL为必填项', 'error'); return; }
      const res = id ? await api('/channels/' + id, { method: 'PUT', body: JSON.stringify(data) }) : await api('/channels', { method: 'POST', body: JSON.stringify(data) });
      if (res && res.ok) { toast(id ? '更新成功' : '添加成功', 'success'); closeModal(); loadChannels(); }
      else toast(res ? res.message : '操作失败', 'error');
    }

    async function deleteChannel(id) {
      if (!confirm('确定要删除该频道吗？')) return;
      const res = await api('/channels/' + id, { method: 'DELETE' });
      if (res && res.ok) { selectedChannelIds.delete(id); toast('删除成功', 'success'); loadChannels(); } else toast('删除失败', 'error');
    }
