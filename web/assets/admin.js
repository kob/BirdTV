    // ========== API 工具 ==========
    const API = '/api';
    
    // XSS 防护函数
    function esc(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
    const token = localStorage.getItem('authToken');
    let CHANNEL_PAGE_SIZE = 12;
    const SOURCE_PAGE_SIZE = 8;
    const USER_PAGE_SIZE = 10;
    let channelPage = 1;
    let m3uPage = 1;
    let epgPage = 1;
    let userPage = 1;
    let channelSearchDebounceTimer = null;
    let m3uSearchDebounceTimer = null;
    let epgSearchDebounceTimer = null;
    let userSearchDebounceTimer = null;

    async function api(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const res = await fetch(API + path, { ...opts, headers });
      if (res.status === 401) { localStorage.removeItem('authToken'); window.location.href = '/login.html'; return null; }
      return res.json();
    }

    // ========== Toast ==========
    function toast(msg, type = 'info') {
      const el = document.createElement('div');
      el.className = 'toast toast-' + type;
      el.textContent = msg;
      document.getElementById('toastContainer').appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }

    // ========== 模态框 ==========
    function showModal(title, bodyHtml, footerHtml) {
      var overlay = document.getElementById('modalOverlay');
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalBody').innerHTML = bodyHtml;
      document.getElementById('modalFooter').innerHTML = footerHtml;
      overlay.classList.add('show');
      overlay.style.cssText = 'display:flex !important; position:fixed !important; inset:0 !important; z-index:99999 !important; align-items:center !important; justify-content:center !important; background:rgba(0,0,0,0.65) !important; padding:16px !important;';
    }
    function closeModal() {
      var overlay = document.getElementById('modalOverlay');
      overlay.classList.remove('show');
      overlay.style.cssText = '';
    }

    function setTableSkeleton(tbodyId, columns, rows = 4) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      const out = [];
      for (let i = 0; i < rows; i += 1) {
        out.push('<tr>');
        for (let j = 0; j < columns; j += 1) {
          const kind = j % 3 === 0 ? 'long' : (j % 2 === 0 ? 'mid' : 'short');
          out.push(`<td><div class="skeleton-line ${kind}"></div></td>`);
        }
        out.push('</tr>');
      }
      tbody.innerHTML = out.join('');
    }

    function setTableEmptyRow(tbodyId, columns, message, emoji = '📭') {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      tbody.innerHTML = `<tr><td colspan="${columns}"><div class="empty"><div class="empty-illustration">${emoji}</div><p>${esc(message)}</p></div></td></tr>`;
    }

    function updateChannelResultCount(visibleCount, totalCount) {
      const el = document.getElementById('channelResultCount');
      if (!el) return;
      if (totalCount === visibleCount) {
        el.textContent = `${totalCount} 条`;
      } else {
        el.textContent = `${visibleCount}/${totalCount} 条`;
      }
    }

    function updateResultCount(elementId, visibleCount, totalCount) {
      const el = document.getElementById(elementId);
      if (!el) return;
      if (totalCount === visibleCount) {
        el.textContent = `${totalCount} 条`;
      } else {
        el.textContent = `${visibleCount}/${totalCount} 条`;
      }
    }

    function renderChannelPagination(totalItems) {
      const root = document.getElementById('channelPagination');
      if (!root) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / CHANNEL_PAGE_SIZE));
      channelPage = Math.min(channelPage, totalPages);

      if (totalItems <= CHANNEL_PAGE_SIZE) {
        root.style.display = 'none';
        root.innerHTML = '';
        return;
      }

      root.style.display = 'flex';
      root.innerHTML = [
        `<div class="pagination-meta">第 ${channelPage}/${totalPages} 页，共 ${totalItems} 条</div>`,
        '<div class="pagination-actions">',
        `<select id="channelPageSize" style="margin-right:12px;padding:4px 8px;border:1px solid var(--line);border-radius:4px;background:var(--bg-1);color:var(--text);">`,
        `  <option value="10" ${CHANNEL_PAGE_SIZE === 10 ? 'selected' : ''}>10条/页</option>`,
        `  <option value="20" ${CHANNEL_PAGE_SIZE === 20 ? 'selected' : ''}>20条/页</option>`,
        `  <option value="50" ${CHANNEL_PAGE_SIZE === 50 ? 'selected' : ''}>50条/页</option>`,
        `  <option value="100" ${CHANNEL_PAGE_SIZE === 100 ? 'selected' : ''}>100条/页</option>`,
        `</select>`,
        `<button type="button" class="page-btn" id="channelPrevPage" ${channelPage <= 1 ? 'disabled' : ''}>上一页</button>`,
        `<button type="button" class="page-btn" id="channelNextPage" ${channelPage >= totalPages ? 'disabled' : ''}>下一页</button>`,
        '</div>'
      ].join('');

      const prevBtn = document.getElementById('channelPrevPage');
      const nextBtn = document.getElementById('channelNextPage');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (channelPage > 1) {
            channelPage -= 1;
            loadChannels();
          }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (channelPage < totalPages) {
            channelPage += 1;
            loadChannels();
          }
        });
      }

      const pageSizeSelect = document.getElementById('channelPageSize');
      if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', () => {
          const newSize = parseInt(pageSizeSelect.value);
          if (newSize !== CHANNEL_PAGE_SIZE) {
            CHANNEL_PAGE_SIZE = newSize;
            channelPage = 1; // Reset to first page when changing page size
            loadChannels();
          }
        });
      }
    }

    function renderPagination(options) {
      const {
        rootId,
        totalItems,
        pageSize,
        page,
        setPage,
        onChange
      } = options;
      const root = document.getElementById(rootId);
      if (!root) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const safePage = Math.min(Math.max(1, page), totalPages);
      setPage(safePage);

      if (totalItems <= pageSize) {
        root.style.display = 'none';
        root.innerHTML = '';
        return;
      }

      root.style.display = 'flex';
      root.innerHTML = [
        `<div class="pagination-meta">第 ${safePage}/${totalPages} 页，共 ${totalItems} 条</div>`,
        '<div class="pagination-actions">',
        `<button type="button" class="page-btn" id="${rootId}Prev" ${safePage <= 1 ? 'disabled' : ''}>上一页</button>`,
        `<button type="button" class="page-btn" id="${rootId}Next" ${safePage >= totalPages ? 'disabled' : ''}>下一页</button>`,
        '</div>'
      ].join('');

      const prevBtn = document.getElementById(`${rootId}Prev`);
      const nextBtn = document.getElementById(`${rootId}Next`);
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (safePage > 1) {
            setPage(safePage - 1);
            onChange();
          }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (safePage < totalPages) {
            setPage(safePage + 1);
            onChange();
          }
        });
      }
    }

    function setupChannelSearchDebounce() {
      const input = document.getElementById('channelSearch');
      if (!input) return;
      input.addEventListener('input', () => {
        channelPage = 1;
        if (channelSearchDebounceTimer) {
          clearTimeout(channelSearchDebounceTimer);
        }
        channelSearchDebounceTimer = setTimeout(() => {
          loadChannels();
        }, 260);
      });
    }

    function onChannelSearchTypeChange() {
      const type = document.getElementById('channelSearchType')?.value;
      const textInput = document.getElementById('channelSearch');
      const sourceSelect = document.getElementById('channelSourceFilter');
      if (type === 'source') {
        if (textInput) textInput.style.display = 'none';
        if (sourceSelect) sourceSelect.style.display = '';
      } else {
        if (textInput) textInput.style.display = '';
        if (sourceSelect) sourceSelect.style.display = 'none';
      }
      channelPage = 1;
      loadChannels();
    }

    function setupSearchDebounce(inputId, timerRefName, resetPage, loadFn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('input', () => {
        resetPage();
        const currentTimer = timerRefName === 'm3u' ? m3uSearchDebounceTimer : timerRefName === 'epg' ? epgSearchDebounceTimer : userSearchDebounceTimer;
        if (currentTimer) {
          clearTimeout(currentTimer);
        }
        const nextTimer = setTimeout(() => {
          loadFn();
        }, 260);
        if (timerRefName === 'm3u') m3uSearchDebounceTimer = nextTimer;
        else if (timerRefName === 'epg') epgSearchDebounceTimer = nextTimer;
        else userSearchDebounceTimer = nextTimer;
      });
    }

    // ========== 批量操作进度模态 ==========
    function showBatchProgressModal(title, steps) {
      showModal(title, `
        <div id="batchProgressArea" style="text-align:center;padding:24px 0;">
          <div class="import-progress-icon running"><div class="spinner"></div></div>
          <h3 id="batchProgressTitle" style="margin-bottom:4px;">${esc(title)}</h3>
          <p id="batchProgressSub" style="font-size:13px;color:var(--muted);margin-bottom:16px;"></p>
          <div class="import-progress-bar-track"><div class="import-progress-bar-fill" id="batchProgressBar"></div></div>
          <div id="batchProgressSteps" style="text-align:left;margin-top:20px;padding:0 20px;">
            ${steps.map((s, i) => `<div class="import-progress-step${i === 0 ? ' active' : ''}" id="batchStep${i+1}"><span class="step-dot"></span>${esc(s)}</div>`).join('')}
          </div>
        </div>
      `, '');
      const footer = document.getElementById('modalFooter');
      if (footer) footer.style.display = 'none';
    }

    function updateBatchProgress(stepNum, totalSteps, title, sub) {
      for (let i = 1; i <= totalSteps; i++) {
        const el = document.getElementById('batchStep' + i);
        if (el) { el.classList.remove('active', 'completed'); if (i < stepNum) el.classList.add('completed'); else if (i === stepNum) el.classList.add('active'); }
      }
      const bar = document.getElementById('batchProgressBar');
      if (bar) bar.style.width = Math.round((stepNum - 1) / (totalSteps - 1) * 100) + '%';
      const t = document.getElementById('batchProgressTitle');
      if (t && title) t.textContent = title;
      const s = document.getElementById('batchProgressSub');
      if (s && sub) s.textContent = sub;
    }

    function setBatchProgressDone(title, sub, autoClose) {
      const bar = document.getElementById('batchProgressBar');
      if (bar) bar.style.width = '100%';
      const t = document.getElementById('batchProgressTitle');
      if (t && title) t.textContent = title;
      const s = document.getElementById('batchProgressSub');
      if (s && sub) s.textContent = sub;
      const icon = document.querySelector('#batchProgressArea .import-progress-icon');
      if (icon) { icon.className = 'import-progress-icon done'; icon.innerHTML = '&#10003;'; }
      if (autoClose) setTimeout(() => { closeModal(); loadChannels(); }, 1200);
    }

    function setBatchProgressFail(title, sub) {
      const bar = document.getElementById('batchProgressBar');
      if (bar) bar.style.background = '#f44336';
      const t = document.getElementById('batchProgressTitle');
      if (t && title) t.textContent = title;
      const s = document.getElementById('batchProgressSub');
      if (s && sub) s.textContent = sub;
      const icon = document.querySelector('#batchProgressArea .import-progress-icon');
      if (icon) { icon.className = 'import-progress-icon fail'; icon.innerHTML = '&#10007;'; }
      const footer = document.getElementById('modalFooter');
      if (footer) { footer.style.display = 'flex'; footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>'; }
    }

    // ========== 页面切换 ==========
    function switchPage(page) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('page-' + page).classList.add('active');
      document.querySelector('[data-page="' + page + '"]').classList.add('active');
      if (page === 'dashboard') loadDashboard();
      if (page === 'channels') loadChannels();
      if (page === 'sources') loadSources();
      if (page === 'epg') loadEpgChannels();
      if (page === 'users') loadUsers();
      if (page === 'settings') loadSettings();
      if (page === 'groupua') loadGroupUaPage();
      if (page === 'playtest') loadPlayTestPage();
      if (page === 'exports') loadExports();
      if (page === 'scheduler') loadSchedulerTasks();
      if (page === 'links') loadLinks();
    }

    // ========== 仪表盘 ==========
    async function loadDashboard() {
      try {
        const [channelsRes, sourcesRes, healthRes, settingsRes] = await Promise.all([
          api('/channels').catch(() => ({ ok: false })),
          api('/sources/m3u').catch(() => ({ ok: false })),
          fetch('/health').then(r => r.json()).catch(() => null),
          api('/settings').catch(() => ({ ok: false }))
        ]);
        document.getElementById('statChannels').textContent = channelsRes.ok ? channelsRes.data.length : '-';
        document.getElementById('statSources').textContent = sourcesRes.ok ? sourcesRes.data.length : '-';
        document.getElementById('statUsers').textContent = '-';
        
        // 系统鉴权状态
        document.getElementById('statSystemAuth').textContent = healthRes ? 
          (healthRes.authEnabled ? '✅ 已启用' : '❌ 已禁用') : '-';
        
        // 代理鉴权状态
        document.getElementById('statProxyAuth').textContent = settingsRes.ok ? 
          (settingsRes.data.m3uProxyAuth ? '✅ 已启用' : '❌ 已禁用') : '-';
        
        if (healthRes) {
          document.getElementById('infoUrl').textContent = location.origin;
        document.getElementById('infoDataDir').textContent = healthRes.dataDir || '-';
        document.getElementById('infoNode').textContent = '-';
        }
        document.getElementById('infoUptime').textContent = new Date().toLocaleString();
      } catch (e) { console.error(e); }
    }

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

        const totalPages = Math.max(1, Math.ceil(total / CHANNEL_PAGE_SIZE));
        if (channelPage > totalPages) {
          channelPage = totalPages;
        }
        const start = (channelPage - 1) * CHANNEL_PAGE_SIZE;
        const end = start + CHANNEL_PAGE_SIZE;
        const pageRows = rows.slice(start, end);
        updateChannelResultCount(pageRows.length, total);

        if (empty) empty.style.display = 'none';
        tbody.innerHTML = pageRows.map(c => {
          // 显示原始URL，与数据目录中存储的一致
          const displayUrl = c.url;
          return `<tr>
          <td><input type="checkbox" class="channel-checkbox" value="${c.id}"></td>
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

        // 绑定全选/取消全选事件
        const selectAllCheckbox = document.getElementById('selectAllChannels');
        const channelCheckboxes = document.querySelectorAll('.channel-checkbox');
        
        if (selectAllCheckbox) {
          selectAllCheckbox.addEventListener('change', function() {
            channelCheckboxes.forEach(cb => {
              cb.checked = this.checked;
            });
            updateBatchDeleteButton();
          });
        }
        
        channelCheckboxes.forEach(cb => {
          cb.addEventListener('change', updateBatchDeleteButton);
        });

        function updateBatchDeleteButton() {
          const checkedCount = document.querySelectorAll('.channel-checkbox:checked').length;
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
      if (res && res.ok) { toast('删除成功', 'success'); loadChannels(); } else toast('删除失败', 'error');
    }

    // ========== 导入菜单 ==========
    function showImportMenuModal() {
      showModal('导入频道', `
        <div style="display:flex;flex-direction:column;gap:16px;padding:20px 0;">
          <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
            <div onclick="closeModal();showManualImportModal();" style="cursor:pointer;padding:24px;border:2px solid var(--border);border-radius:12px;text-align:center;min-width:200px;transition:all 0.3s;" onmouseover="this.style.borderColor='#7ac1ff';this.style.background='rgba(122,193,255,0.1)';" onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent';">
              <div style="font-size:48px;margin-bottom:12px;">📁</div>
              <div style="font-weight:700;font-size:16px;color:var(--text-main);margin-bottom:8px;">手动导入</div>
              <div style="font-size:13px;color:var(--muted);">上传 M3U 文件<br>或手动添加频道</div>
            </div>
            <div onclick="closeModal();importChannelsFromSource();" style="cursor:pointer;padding:24px;border:2px solid var(--border);border-radius:12px;text-align:center;min-width:200px;transition:all 0.3s;" onmouseover="this.style.borderColor='#7ac1ff';this.style.background='rgba(122,193,255,0.1)';" onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent';">
              <div style="font-size:48px;margin-bottom:12px;">📡</div>
              <div style="font-weight:700;font-size:16px;color:var(--text-main);margin-bottom:8px;">从节目源导入</div>
              <div style="font-size:13px;color:var(--muted);">从已配置的<br>节目源导入频道</div>
            </div>
          </div>
        </div>
      `);
    }

    // ========== 导入频道 ==========
    function showManualImportModal() {
      showModal('导入频道', `
        <div style="padding:16px 0;">
          <div class="form-group">
            <label>选择 M3U 文件 *</label>
            <input type="file" id="manualM3uFile" accept=".m3u,.m3u8" style="padding:8px;border:1px solid var(--border);border-radius:6px;width:100%;">
            <p style="font-size:12px;color:var(--muted);margin-top:6px;">支持 .m3u 和 .m3u8 格式的播放列表文件</p>
          </div>
          <div id="manualFilePreview" style="display:none;margin-top:16px;">
            <h4 style="margin-bottom:12px;">频道预览</h4>
            <div id="manualFileChannelList" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:12px;"></div>
          </div>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" id="manualImportSubmitBtn" onclick="submitManualImport()" style="display:none;">导入</button>
      `);
      
      setTimeout(() => {
        const fileInput = document.getElementById('manualM3uFile');
        if (fileInput) {
          fileInput.addEventListener('change', handleManualFileSelect);
        }
      }, 100);
    }

    function switchManualImportTab(tab) {}

    async function handleManualFileSelect(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetch('/api/sources/m3u/upload', {
          method: 'POST',
          body: formData
        });
        const result = await res.json();
        
        if (result && result.ok && result.data) {
          const channels = result.data;
          const previewDiv = document.getElementById('manualFilePreview');
          const listDiv = document.getElementById('manualFileChannelList');
          
          listDiv.innerHTML = channels.map((c, i) => `
            <div style="display:flex;align-items:center;padding:8px;border-bottom:1px solid var(--border);" class="manual-channel-item">
              <input type="checkbox" checked data-idx="${i}" style="margin-right:12px;">
              <div style="flex:1;">
                <div style="font-weight:600;">${esc(c.name || '未命名')}</div>
                <div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">${esc(c.url || '')}</div>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-left:12px;">${esc(c.group || '未分组')}</div>
            </div>
          `).join('');
          
          previewDiv.style.display = 'block';
          
          // 显示导入按钮
          const submitBtn = document.getElementById('manualImportSubmitBtn');
          if (submitBtn) {
            submitBtn.style.display = 'inline-flex';
            submitBtn.textContent = `导入选中 (${channels.length})`;
            submitBtn.onclick = submitManualFileImport;
          }
        } else {
          toast('解析文件失败', 'error');
        }
      } catch (err) {
        console.error('解析文件失败:', err);
        toast('解析文件失败', 'error');
      }
    }

    async function submitManualFileImport() {
      const checkboxes = document.querySelectorAll('.manual-channel-item input[type="checkbox"]:checked');
      if (checkboxes.length === 0) {
        toast('请选择要导入的频道', 'error');
        return;
      }
      
      // 获取所有频道数据
      const listDiv = document.getElementById('manualFileChannelList');
      const allItems = listDiv.querySelectorAll('.manual-channel-item');
      const channelsToImport = [];
      
      allItems.forEach((item, idx) => {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && cb.checked) {
          // 从显示的内容中提取数据
          const nameEl = item.querySelector('div > div:first-child');
          const urlEl = item.querySelector('div > div:nth-child(2)');
          const groupEl = item.querySelector('div:last-child');
          
          channelsToImport.push({
            name: nameEl ? nameEl.textContent : '',
            url: urlEl ? urlEl.textContent : '',
            group: groupEl ? groupEl.textContent : '',
            streamType: 'live'
          });
        }
      });
      
      if (channelsToImport.length === 0) {
        toast('请选择要导入的频道', 'error');
        return;
      }
      
      try {
        const res = await api('/channels/batch', {
          method: 'POST',
          body: JSON.stringify({ channels: channelsToImport })
        });
        
        if (res && res.ok) {
          const d = res.data || {};
          const parts = [];
          if (d.created) parts.push('新增 ' + d.created + ' 个');
          if (d.updated) parts.push('更新 ' + d.updated + ' 个');
          toast(parts.length ? '导入完成：' + parts.join('，') : ('成功导入 ' + channelsToImport.length + ' 个频道'), 'success');
          closeModal();
          loadChannels();
        } else {
          toast('导入失败', 'error');
        }
      } catch (err) {
        console.error('导入失败:', err);
        toast('导入失败', 'error');
      }
    }

    async function submitManualSingleImport() {
      const name = document.getElementById('manualSingleName')?.value?.trim();
      const url = document.getElementById('manualSingleUrl')?.value?.trim();
      const group = document.getElementById('manualSingleGroup')?.value?.trim();
      const logo = document.getElementById('manualSingleLogo')?.value?.trim();
      
      if (!name || !url) {
        toast('请填写频道名称和播放地址', 'error');
        return;
      }
      
      const data = {
        name,
        url,
        group: group || '未分组',
        logo: logo || '',
        streamType: 'live'
      };
      
      try {
        const res = await api('/channels', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        
        if (res && res.ok) {
          toast('添加成功', 'success');
          closeModal();
          loadChannels();
        } else {
          toast('添加失败', 'error');
        }
      } catch (err) {
        console.error('添加失败:', err);
        toast('添加失败', 'error');
      }
    }

    async function importChannelsFromSource(defaultSourceId) {
      try {
        const sourcesRes = await api('/sources/m3u');
        if (!sourcesRes || !sourcesRes.ok || !sourcesRes.data || !sourcesRes.data.length) {
          toast('暂无节目源，请先添加节目源', 'error');
          return;
        }

        const sources = sourcesRes.data;
        let sourceOptions = sources.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

        showModal('从节目源导入频道', `
          <div id="importFormArea">
          <div class="form-group">
            <label>选择节目源 *</label>
            <select id="importSourceSelect">
              <option value="">-- 请选择节目源 --</option>
              ${sourceOptions}
            </select>
          </div>
          <div class="form-group">
            <label>代理模式</label>
            <select id="sourceProxyMode" style="width:100%;">
              <option value="auto">自动</option>
              <option value="proxy">代理</option>
              <option value="direct">直连</option>
            </select>
          </div>
          <div id="channelListContainer" style="margin-top:16px;max-height:400px;overflow-y:auto;display:none;">
            <h4 style="margin-bottom:12px;">频道列表</h4>
            <div id="channelListContent"></div>
          </div>
          </div>
          <div id="importProgressArea" style="display:none;text-align:center;padding:24px 0;">
            <div class="import-progress-icon running"><div class="spinner"></div></div>
            <h3 id="importProgressTitle" style="margin-bottom:4px;">正在导入...</h3>
            <p id="importProgressSub" style="font-size:13px;color:var(--muted);margin-bottom:16px;"></p>
            <div class="import-progress-bar-track"><div class="import-progress-bar-fill" id="importProgressBar"></div></div>
            <div id="importProgressSteps" style="text-align:left;margin-top:20px;padding:0 20px;"></div>
          </div>
        `, `
          <button class="btn" onclick="closeModal()">取消</button>
          <button class="btn" id="loadChannelsBtn" onclick="loadSourceChannels()">加载频道</button>
          <button class="btn btn-primary" id="importBtn" onclick="doImportChannels()" style="display:none;">导入选中</button>
        `);

        document.getElementById('importSourceSelect').addEventListener('change', function() {
          document.getElementById('loadChannelsBtn').style.display = this.value ? 'inline-flex' : 'none';
          document.getElementById('importBtn').style.display = 'none';
          document.getElementById('channelListContainer').style.display = 'none';
        });

        // 如果传入了默认源ID，自动选中并加载
        if (defaultSourceId) {
          const sel = document.getElementById('importSourceSelect');
          sel.value = defaultSourceId;
          document.getElementById('loadChannelsBtn').style.display = 'inline-flex';
          loadSourceChannels();
        }
      } catch (e) {
        toast('加载节目源失败', 'error');
      }
    }

    function importChannelsFromFile() {
      showModal('从文件导入频道', `
        <div class="form-group">
          <label>选择M3U文件 *</label>
          <input type="file" id="m3uFile" accept=".m3u,.m3u8" style="padding:8px 0;">
          <p style="font-size:12px;color:var(--muted);margin-top:4px;">支持 .m3u 和 .m3u8 格式</p>
        </div>
        <div class="form-group">
          <label>代理模式</label>
          <select id="fileProxyMode" style="width:100%;">
            <option value="auto">自动</option>
            <option value="proxy">代理</option>
            <option value="direct">直连</option>
          </select>
        </div>
        <div id="fileChannelListContainer" style="margin-top:16px;max-height:400px;overflow-y:auto;display:none;">
          <h4 style="margin-bottom:12px;">频道列表</h4>
          <div id="fileChannelListContent"></div>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn" id="loadFileChannelsBtn" onclick="loadFileChannels()">解析文件</button>
        <button class="btn btn-primary" id="importFileBtn" onclick="doImportFileChannels()" style="display:none;">导入选中</button>
      `);
    }

    async function loadFileChannels() {
      const fileInput = document.getElementById('m3uFile');
      const file = fileInput.files[0];
      if (!file) {
        toast('请选择M3U文件', 'error');
        return;
      }

      try {
        // 显示加载状态
        const loadingToast = document.createElement('div');
        loadingToast.className = 'toast toast-info';
        loadingToast.textContent = '正在解析文件...';
        document.getElementById('toastContainer').appendChild(loadingToast);

        // 创建FormData对象
        const formData = new FormData();
        formData.append('file', file);

        // 发送文件上传请求
        const res = await fetch('/api/sources/m3u/upload', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token
          },
          body: formData
        });

        const result = await res.json();
        loadingToast.remove();

        if (result.ok) {
          const channels = result.data;
          const channelListContent = document.getElementById('fileChannelListContent');
          channelListContent.innerHTML = channels.map(c => `
            <div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid rgba(146, 187, 255, 0.1);">
              <input type="checkbox" class="import-file-channel-checkbox" value="${c.id}" data-name="${esc(c.name)}" data-url="${esc(c.url)}" data-group="${esc(c.group || '')}" data-clearKeys='${JSON.stringify(c.drm && c.drm.clearKeys ? c.drm.clearKeys : {})}' data-tvgid="${esc(c.tvgId || '')}" data-tvglogo="${esc(c.tvgLogo || '')}" data-streamtype="${esc(c.streamType || '')}" data-playertype="${esc(c.playerType || '')}" data-drm='${JSON.stringify(c.drm || {})}' data-useragent="${esc(c.userAgent || '')}">
              <div style="margin-left:12px;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                  ${c.tvgLogo ? `<img src="${esc(c.tvgLogo)}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">` : ''}
                  <div>
                    <div><b>${esc(c.name)}</b></div>
                    ${c.tvgId ? `<div style="font-size:11px;color:var(--muted);">TVG ID: ${esc(c.tvgId)}</div>` : ''}
                  </div>
                </div>
                <div style="font-size:12px;color:var(--muted);margin-top:4px;">${esc(c.url)}</div>
                <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">
                  ${c.group ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">分组: ${esc(c.group)}</span>` : ''}
                  ${c.streamType ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">类型: ${esc(c.streamType)}</span>` : ''}
                  ${c.playerType ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">播放器: ${esc(c.playerType)}</span>` : ''}
                  ${c.drm && c.drm.clearKeys ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">ClearKeys: ${Object.keys(c.drm.clearKeys).length} 个</span>` : ''}
                </div>
              </div>
            </div>
          `).join('');

          // Add select all button
          const selectAllButton = document.createElement('div');
          selectAllButton.style.display = 'flex';
          selectAllButton.style.alignItems = 'center';
          selectAllButton.style.padding = '8px 0';
          selectAllButton.style.borderBottom = '1px solid rgba(146, 187, 255, 0.1)';
          selectAllButton.style.marginBottom = '8px';
          selectAllButton.innerHTML = `
            <input type="checkbox" id="selectAllFileChannels" style="margin-right:12px;">
            <div style="font-weight:bold;">全选</div>
          `;
          channelListContent.insertBefore(selectAllButton, channelListContent.firstChild);

          // Add event listener for select all button
          document.getElementById('selectAllFileChannels').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.import-file-channel-checkbox');
            checkboxes.forEach(cb => {
              cb.checked = this.checked;
            });
          });

          document.getElementById('fileChannelListContainer').style.display = 'block';
          document.getElementById('importFileBtn').style.display = 'inline-flex';
        } else {
          toast(result.message || '解析文件失败', 'error');
        }
      } catch (e) {
        console.error('解析文件失败:', e);
        toast('解析文件失败: ' + (e.message || '未知错误'), 'error');
      }
    }

    async function doImportFileChannels() {
      const checkboxes = document.querySelectorAll('.import-file-channel-checkbox:checked');
      if (checkboxes.length === 0) {
        toast('请选择要导入的频道', 'error');
        return;
      }

      const proxyMode = document.getElementById('fileProxyMode').value;

      const channelsToImport = Array.from(checkboxes).map(cb => {
        // 根据代理模式决定存储的 URL
        let channelUrl = cb.dataset.url;
        if (proxyMode === 'proxy' || proxyMode === 'auto') {
          channelUrl = `${location.origin}/m3u-proxy?url=${encodeURIComponent(cb.dataset.url)}`;
        }
        
        const channel = {
          name: cb.dataset.name,
          url: channelUrl,
          group: cb.dataset.group || '',
          tvgId: cb.dataset.tvgid || '',
          tvgLogo: cb.dataset.tvglogo || '',
          streamType: cb.dataset.streamtype || 'auto',
          playerType: cb.dataset.playertype || 'auto',
          userAgent: cb.dataset.useragent || '',
          proxyMode: proxyMode
        };
        
        // 如果有DRM信息，使用解析的DRM
        if (cb.dataset.drm) {
          try {
            const drmData = JSON.parse(cb.dataset.drm);
            if (drmData) {
              channel.drm = drmData;
            }
          } catch (e) {
            console.error('解析DRM数据失败:', e);
          }
        }
        
        // 如果设置了Shaka播放器且没有指定DRM，添加clearKeys支持
        if (channel.playerType === 'shaka' && !channel.drm) {
          try {
            const clearKeysData = JSON.parse(cb.dataset.clearkeys || '{}');
            if (Object.keys(clearKeysData).length > 0) {
              channel.drm = { clearKeys: clearKeysData };
            }
          } catch (e) {
            console.error('解析clearKeys数据失败:', e);
          }
        }
        
        return channel;
      });

      try {
        const res = await api('/channels/batch', {
          method: 'POST',
          body: JSON.stringify({ channels: channelsToImport })
        });

        if (res && res.ok) {
          const d = res.data || {};
          const parts = [];
          if (d.created) parts.push('新增 ' + d.created + ' 个');
          if (d.updated) parts.push('更新 ' + d.updated + ' 个');
          toast(parts.length ? '导入完成：' + parts.join('，') : ('成功导入 ' + channelsToImport.length + ' 个频道'), 'success');
          closeModal();
          loadChannels();
        } else {
          toast('导入失败', 'error');
        }
      } catch (e) {
        toast('导入失败', 'error');
      }
    }

    async function loadSourceChannels() {
      const sourceId = document.getElementById('importSourceSelect').value;
      if (!sourceId) return;

      try {
        // 先获取节目源详情，获取其M3U链接
        const sourceRes = await api('/sources/m3u/' + sourceId);
        if (!sourceRes || !sourceRes.ok || !sourceRes.data) {
          toast('获取节目源信息失败', 'error');
          return;
        }

        const m3uUrl = sourceRes.data.url;
        if (!m3uUrl) {
          toast('节目源没有配置M3U链接', 'error');
          return;
        }

        // 使用POST请求解析M3U链接
        const res = await api('/sources/m3u/parse', {
          method: 'POST',
          body: JSON.stringify({ url: m3uUrl })
        });
        if (!res || !res.ok || !res.data || !res.data.length) {
          toast('该节目源暂无频道', 'error');
          return;
        }

        const channels = res.data;
        const channelListContent = document.getElementById('channelListContent');
        channelListContent.innerHTML = channels.map(c => `
          <div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid rgba(146, 187, 255, 0.1);">
            <input type="checkbox" class="import-channel-checkbox" value="${c.id}" data-name="${esc(c.name)}" data-url="${esc(c.url)}" data-group="${esc(c.group || '')}" data-clearKeys='${JSON.stringify(c.drm && c.drm.clearKeys ? c.drm.clearKeys : {})}' data-tvgid="${esc(c.tvgId || '')}" data-tvglogo="${esc(c.tvgLogo || '')}" data-streamtype="${esc(c.streamType || '')}" data-playertype="${esc(c.playerType || '')}" data-drm='${JSON.stringify(c.drm || {})}' data-useragent="${esc(c.userAgent || '')}">
            <div style="margin-left:12px;flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${c.tvgLogo ? `<img src="${esc(c.tvgLogo)}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">` : ''}
                <div>
                  <div><b>${esc(c.name)}</b></div>
                  ${c.tvgId ? `<div style="font-size:11px;color:var(--muted);">TVG ID: ${esc(c.tvgId)}</div>` : ''}
                </div>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:4px;">${esc(c.url)}</div>
              <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">
                ${c.group ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">分组: ${esc(c.group)}</span>` : ''}
                ${c.streamType ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">类型: ${esc(c.streamType)}</span>` : ''}
                ${c.playerType ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">播放器: ${esc(c.playerType)}</span>` : ''}
                ${c.drm && c.drm.clearKeys ? `<span style="font-size:11px;color:var(--muted);background:rgba(146,187,255,0.1);padding:2px 6px;border-radius:4px;">ClearKeys: ${Object.keys(c.drm.clearKeys).length} 个</span>` : ''}
              </div>
            </div>
          </div>
        `).join('');

        document.getElementById('channelListContainer').style.display = 'block';
        document.getElementById('importBtn').style.display = 'inline-flex';
        
        // Add select all button
        const selectAllButton = document.createElement('div');
        selectAllButton.style.display = 'flex';
        selectAllButton.style.alignItems = 'center';
        selectAllButton.style.padding = '8px 0';
        selectAllButton.style.borderBottom = '1px solid rgba(146, 187, 255, 0.1)';
        selectAllButton.style.marginBottom = '8px';
        selectAllButton.innerHTML = `
          <input type="checkbox" id="selectAllImportChannels" style="margin-right:12px;">
          <div style="font-weight:bold;">全选</div>
        `;
        channelListContent.insertBefore(selectAllButton, channelListContent.firstChild);
        
        // Add event listener for select all button
        document.getElementById('selectAllImportChannels').addEventListener('change', function() {
          const checkboxes = document.querySelectorAll('.import-channel-checkbox');
          checkboxes.forEach(cb => {
            cb.checked = this.checked;
          });
        });
      } catch (e) {
        toast('加载频道失败', 'error');
      }
    }

    async function doImportChannels() {
      const checkboxes = document.querySelectorAll('.import-channel-checkbox:checked');
      if (checkboxes.length === 0) {
        toast('请选择要导入的频道', 'error');
        return;
      }

      const totalCount = checkboxes.length;
      const sourceId = document.getElementById('importSourceSelect').value;
      const proxyMode = document.getElementById('sourceProxyMode').value;
      let sourcePlayerType = 'auto';

      // 切换到进度面板
      const formArea = document.getElementById('importFormArea');
      const progressArea = document.getElementById('importProgressArea');
      const progressBar = document.getElementById('importProgressBar');
      const progressTitle = document.getElementById('importProgressTitle');
      const progressSub = document.getElementById('importProgressSub');
      const progressSteps = document.getElementById('importProgressSteps');
      if (formArea) formArea.style.display = 'none';
      if (progressArea) progressArea.style.display = 'block';
      if (progressBar) progressBar.style.width = '0%';
      if (progressTitle) progressTitle.textContent = '正在导入...';
      if (progressSub) progressSub.textContent = '共 ' + totalCount + ' 个频道待导入';
      if (progressSteps) progressSteps.innerHTML = `
        <div class="import-progress-step active" id="importStep1"><span class="step-dot"></span>获取节目源配置</div>
        <div class="import-progress-step" id="importStep2"><span class="step-dot"></span>组装频道数据</div>
        <div class="import-progress-step" id="importStep3"><span class="step-dot"></span>提交到服务器</div>
        <div class="import-progress-step" id="importStep4"><span class="step-dot"></span>完成</div>
      `;
      // 隐藏底栏按钮
      const footer = document.getElementById('modalFooter');
      if (footer) footer.style.display = 'none';

      function setStep(stepNum) {
        for (let i = 1; i <= 4; i++) {
          const el = document.getElementById('importStep' + i);
          if (el) { el.classList.remove('active', 'completed'); if (i < stepNum) el.classList.add('completed'); else if (i === stepNum) el.classList.add('active'); }
        }
        if (progressBar) progressBar.style.width = Math.round((stepNum - 1) / 3 * 100) + '%';
      }

      try {
        setStep(1);
        const sourceRes = await api('/sources/m3u/' + sourceId);
        if (sourceRes && sourceRes.ok && sourceRes.data) {
          sourcePlayerType = sourceRes.data.defaultPlayerType || 'auto';
        }
      } catch (e) {
        console.error('获取节目源信息失败:', e);
      }

      setStep(2);

      const channelsToImport = Array.from(checkboxes).map(cb => {
        let channelUrl = cb.dataset.url;
        if (proxyMode === 'proxy' || proxyMode === 'auto') {
          channelUrl = `${location.origin}/m3u-proxy?url=${encodeURIComponent(cb.dataset.url)}`;
        }
        
        const channel = {
          name: cb.dataset.name,
          url: channelUrl,
          group: cb.dataset.group || '',
          tvgId: cb.dataset.tvgid || '',
          tvgLogo: cb.dataset.tvglogo || '',
          proxyMode: proxyMode,
          playerType: cb.dataset.playertype || sourcePlayerType,
          streamType: cb.dataset.streamtype || 'auto',
          userAgent: cb.dataset.useragent || '',
          sourceId: sourceId
        };
        
        if (cb.dataset.drm) {
          try {
            const drmData = JSON.parse(cb.dataset.drm);
            if (drmData) channel.drm = drmData;
          } catch (e) { console.error('解析DRM数据失败:', e); }
        }
        
        if (channel.playerType === 'shaka' && !channel.drm) {
          try {
            const clearKeysData = JSON.parse(cb.dataset.clearkeys || '{}');
            if (Object.keys(clearKeysData).length > 0) channel.drm = { clearKeys: clearKeysData };
          } catch (e) { console.error('解析ClearKeys数据失败:', e); }
        }
        
        return channel;
      });

      if (progressSub) progressSub.textContent = '共 ' + totalCount + ' 个频道待导入 · 数据已就绪';

      setStep(3);
      try {
        const res = await api('/channels/batch', {
          method: 'POST',
          body: JSON.stringify({ channels: channelsToImport })
        });

        if (res && res.ok) {
          setStep(4);
          if (progressBar) progressBar.style.width = '100%';
          if (progressTitle) progressTitle.textContent = '导入完成';
          const d = res.data || {};
          const parts = [];
          if (d.created) parts.push('新增 ' + d.created + ' 个');
          if (d.updated) parts.push('更新 ' + d.updated + ' 个');
          if (progressSub) progressSub.textContent = parts.length ? parts.join('，') : ('成功导入 ' + totalCount + ' 个频道');
          const icon = progressArea?.querySelector('.import-progress-icon');
          if (icon) { icon.className = 'import-progress-icon done'; icon.innerHTML = '&#10003;'; }
          setTimeout(() => { closeModal(); loadChannels(); }, 1500);
        } else {
          if (progressTitle) progressTitle.textContent = '导入失败';
          if (progressSub) progressSub.textContent = res ? res.message : '服务器返回错误';
          const icon = progressArea?.querySelector('.import-progress-icon');
          if (icon) { icon.className = 'import-progress-icon fail'; icon.innerHTML = '&#10007;'; }
          if (footer) footer.style.display = 'flex';
          if (footer) footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>';
        }
      } catch (e) {
        if (progressTitle) progressTitle.textContent = '导入失败';
        if (progressSub) progressSub.textContent = '网络请求异常，请检查连接';
        const icon = progressArea?.querySelector('.import-progress-icon');
        if (icon) { icon.className = 'import-progress-icon fail'; icon.innerHTML = '&#10007;'; }
        if (footer) footer.style.display = 'flex';
        if (footer) footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>';
      }
    }

    let currentExportChannelIds = [];

    async function batchExportChannels() {
      const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
      if (checkboxes.length === 0) {
        toast('请选择要导出的频道', 'error');
        return;
      }

      currentExportChannelIds = Array.from(checkboxes).map(cb => cb.value);

      // 显示导出选项弹窗（添加简介窗口）
      showModal('批量导出设置', `
        <div class="form-group">
          <label>选中频道数</label>
          <input type="text" value="${currentExportChannelIds.length} 个频道" disabled>
        </div>
        <div class="form-group">
          <label>导出简介</label>
          <textarea id="exportDescription" rows="3" placeholder="请输入本次导出的说明，例如：家庭用户频道列表"></textarea>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="doBatchExport()">开始导出</button>
      `);
    }

    async function doBatchExport() {
      try {
        const channelIds = currentExportChannelIds;
        const count = channelIds.length;
        const description = document.getElementById('exportDescription').value || '';

        showBatchProgressModal('批量导出', ['准备导出数据', '生成导出文件', '完成']);
        updateBatchProgress(1, 3, '正在导出...', '共 ' + count + ' 个频道');

        const res = await api('/exports/export', {
          method: 'POST',
          body: JSON.stringify({ channelIds, description })
        });

        if (res && res.ok) {
          const data = res.data;
          setBatchProgressDone('导出完成', `文件 ${data.filename}（${(data.fileSize / 1024).toFixed(2)}KB）`, false);
          const footer = document.getElementById('modalFooter');
          if (footer) {
            footer.style.display = 'flex';
            footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeModal();loadChannels();switchPage(\'links\')">前往用户链接管理</button>';
          }
        } else {
          setBatchProgressFail('导出失败', res ? res.message : '服务器返回错误');
        }
      } catch (e) {
        console.error('批量导出失败:', e);
        setBatchProgressFail('导出失败', '网络请求异常');
      }
    }

    async function batchEditChannels() {
      const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
      if (checkboxes.length === 0) {
        toast('请选择要修改的频道', 'error');
        return;
      }

      try {
        const res = await api('/channels/groups');
        let groups = [];
        if (res && res.ok && Array.isArray(res.data)) {
          groups = res.data;
        }
        const presetGroups = ['CCTV', '卫视', '地方台', '港澳', '国际', '影视', '体育', '新闻', '少儿', '其他'];
        const allGroups = [...new Set([...groups, ...presetGroups])].sort();

        const UA_PRESETS = [
          { name: "默认 (okhttp)", value: "okhttp" },
          { name: "VLC for Android", value: "VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7" },
          { name: "MX Player", value: "MXPlayer/1.58.1" },
          { name: "IPTV Smarters", value: "IPTV Smarters Pro/4.2" },
          { name: "Chrome Mobile", value: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36" },
          { name: "Safari iOS", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1" },
          { name: "Windows Chrome", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
          { name: "Firefox", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
          { name: "Edge", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91" },
          { name: "curl", value: "curl/8.4.0" }
        ];

        showModal('批量修改频道', `
          <div class="form-row">
            <div class="form-group"><label>代理方式</label><select id="batchProxyMode"><option value="">保持不变</option><option value="auto">自动</option><option value="proxy">代理</option><option value="direct">直连</option></select></div>
            <div class="form-group"><label>播放器</label><select id="batchPlayer"><option value="">保持不变</option><option value="auto">自动</option><option value="shaka">Shaka</option><option value="artplayer">ArtPlayer</option><option value="hlsjs">HLS.js</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>分组</label>
              <select id="batchGroup">
                <option value="">保持不变</option>
                ${allGroups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}
                <option value="未分组">未分组</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>User Agent</label>
            <select id="batchUserAgent">
              <option value="">保持不变</option>
              ${UA_PRESETS.map(ua => `<option value="${esc(ua.value)}">${esc(ua.name)}</option>`).join('')}
            </select>
          </div>
        `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchEdit()">确定修改</button>`);
      } catch (e) {
        console.error('加载分组失败:', e);
        toast('加载分组失败', 'error');
      }
    }

    async function doBatchEdit() {
      const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
      const count = checkboxes.length;
      const channelIds = Array.from(checkboxes).map(cb => cb.value);
      const proxyMode = document.getElementById('batchProxyMode').value;
      const playerType = document.getElementById('batchPlayer').value;
      const group = document.getElementById('batchGroup').value;
      const userAgent = document.getElementById('batchUserAgent').value.trim();

      const hasChanges = proxyMode || playerType || group || userAgent;
      if (!hasChanges) { toast('未做任何修改', 'error'); return; }

      showBatchProgressModal('批量修改', ['组装修改数据', '提交到服务器', '完成']);
      updateBatchProgress(1, 3, '正在修改...', '共 ' + count + ' 个频道');

      try {
        updateBatchProgress(2, 3, '正在修改...', '提交修改请求中');
        const updateData = { 
          ids: channelIds, 
          data: { 
            ...(proxyMode ? { proxyMode } : {}),
            ...(playerType ? { playerType } : {}),
            ...(group ? { group } : {}),
            ...(userAgent ? { userAgent } : {})
          } 
        };

        const res = await api('/channels/batch/update', {
          method: 'POST',
          body: JSON.stringify(updateData)
        });

        if (res && res.ok) {
          setBatchProgressDone('修改完成', '成功修改 ' + count + ' 个频道', true);
        } else {
          setBatchProgressFail('修改失败', res ? res.message : '服务器返回错误');
        }
      } catch (e) {
        console.error('批量修改频道失败:', e);
        setBatchProgressFail('修改失败', '网络请求异常');
      }
    }

    // 导出管理页面逻辑
    async function loadExports() {
      const tbody = document.getElementById('exportTableBody');
      const empty = document.getElementById('exportEmpty');
      const loading = document.getElementById('exportLoading');
      const resultCount = document.getElementById('exportResultCount');

      loading.style.display = 'block';
      empty.style.display = 'none';

      try {
        const res = await api('/exports/list');
        if (res && res.ok) {
          const exports = res.data;
          resultCount.textContent = `${exports.length} 条`;

          if (exports.length === 0) {
            empty.style.display = 'block';
            tbody.innerHTML = '';
          } else {
            tbody.innerHTML = exports.map(exp => {
              return `
                <tr>
                  <td><b>${exp.filename}</b></td>
                  <td>${exp.userId || 'admin'}</td>
                  <td>${new Date(exp.createdAt).toLocaleString()}</td>
                  <td>${exp.description || '无'}</td>
                  <td>${(exp.fileSize / 1024).toFixed(2)}KB</td>
                  <td class="btn-group">
                    <button class="btn btn-sm" onclick="showExportDetails('${exp.id}')">详情</button>
                    <button class="btn btn-sm" onclick="showCreateLinkModal('${exp.id}')">生成链接</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteExport('${exp.id}')">删除</button>
                  </td>
                </tr>
              `;
            }).join('');
          }
        } else {
          empty.style.display = 'block';
          resultCount.textContent = '0 条';
        }
      } catch (e) {
        console.error('加载导出记录失败:', e);
        empty.style.display = 'block';
        resultCount.textContent = '0 条';
      } finally {
        loading.style.display = 'none';
      }
    }

    // 用户链接管理相关函数
    async function loadLinks() {
      const tbody = document.getElementById('linkTableBody');
      const empty = document.getElementById('linkEmpty');
      const loading = document.getElementById('linkLoading');
      const resultCount = document.getElementById('linkResultCount');

      loading.style.display = 'block';
      empty.style.display = 'none';

      try {
        const res = await api('/exports/links');
        if (res && res.ok) {
          const links = res.data;
          resultCount.textContent = `${links.length} 条`;

          if (links.length === 0) {
            empty.style.display = 'block';
            tbody.innerHTML = '';
          } else {
            tbody.innerHTML = links.map(link => {
              const now = new Date();
              const expiresAt = new Date(link.expiresAt);
              const isExpired = now > expiresAt;
              const isLimitReached = link.downloadCount >= link.maxDownloads;
              let status = '有效';
              let statusClass = 'tag-success';

              if (isExpired) {
                status = '已过期';
                statusClass = 'tag-error';
              } else if (isLimitReached) {
                status = '已达上限';
                statusClass = 'tag-warning';
              }

              const shortLink = `${location.origin}/link/${link.shortCode}`;

              return `
                <tr>
                  <td><a href="${shortLink}" target="_blank">${link.shortCode}</a></td>
                  <td>${link.username || '未指定'}</td>
                  <td>${link.filename}</td>
                  <td>${new Date(link.createdAt).toLocaleString()}</td>
                  <td>${new Date(link.expiresAt).toLocaleString()}</td>
                  <td>${link.downloadCount}/${link.maxDownloads}</td>
                  <td><span class="tag ${statusClass}">${status}</span></td>
                  <td class="btn-group">
                    <button class="btn btn-sm" onclick="showLinkDetails('${link.id}')">详情</button>
                    <button class="btn btn-sm" onclick="showUpdateLinkModal('${link.id}')">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteLink('${link.id}')">删除</button>
                  </td>
                </tr>
              `;
            }).join('');
          }
        } else {
          empty.style.display = 'block';
          resultCount.textContent = '0 条';
        }
      } catch (e) {
        console.error('加载链接记录失败:', e);
        empty.style.display = 'block';
        resultCount.textContent = '0 条';
      } finally {
        loading.style.display = 'none';
      }
    }

    async function showCreateLinkModal(exportId = null) {
      let exportOptions = '';
      
      try {
        const res = await api('/exports/list');
        if (res && res.ok && res.data.length > 0) {
          exportOptions = res.data.map(exp => `
            <option value="${exp.id}" ${exportId === exp.id ? 'selected' : ''}>
              ${exp.filename} (${exp.description || '无'})
            </option>
          `).join('');
        }
      } catch (e) {
        console.error('加载导出记录失败:', e);
      }

      showModal('创建用户链接', `
        <div class="form-group">
          <label>选择导出文件 *</label>
          <select id="linkExportId">
            <option value="">-- 请选择导出文件 --</option>
            ${exportOptions}
          </select>
        </div>
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="linkUsername" placeholder="例如：family">
        </div>
        <div class="form-group">
          <label>链接简介</label>
          <textarea id="linkDescription" rows="2" placeholder="例如：家庭用户专用链接"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>有效期 (小时)</label>
            <input type="number" id="linkExpiresIn" value="24" min="1" max="168">
          </div>
          <div class="form-group">
            <label>最大下载次数</label>
            <input type="number" id="linkMaxDownloads" value="5" min="1" max="50">
          </div>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="linkIpBinding"> IP绑定 (仅允许当前IP访问)</label>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="createLink()">创建链接</button>
      `);
    }

    async function createLink() {
      try {
        const exportId = document.getElementById('linkExportId').value;
        const username = document.getElementById('linkUsername').value;
        const description = document.getElementById('linkDescription').value;
        const expiresIn = parseInt(document.getElementById('linkExpiresIn').value) || 24;
        const maxDownloads = parseInt(document.getElementById('linkMaxDownloads').value) || 5;
        const ipBinding = document.getElementById('linkIpBinding').checked;

        if (!exportId) {
          toast('请选择导出文件', 'error');
          return;
        }

        closeModal();

        // 显示加载状态
        const loadingToast = document.createElement('div');
        loadingToast.className = 'toast toast-info';
        loadingToast.textContent = '正在创建链接...';
        document.getElementById('toastContainer').appendChild(loadingToast);

        // 调用后端 API
        const res = await api('/exports/link', {
          method: 'POST',
          body: JSON.stringify({
            exportId,
            username,
            description,
            expiresIn,
            maxDownloads,
            ipBinding
          })
        });

        loadingToast.remove();

        if (res && res.ok) {
          const data = res.data;
          // 使用优化后的短链接路径
          const optimizedShortLink = `${location.origin}/link/${data.shortCode}`;
          
          // 显示创建成功弹窗
          showModal('链接创建成功', `
            <div style="margin-bottom:16px;">
              <p><b>短链接:</b> <a href="${optimizedShortLink}" target="_blank">${optimizedShortLink}</a></p>
              <p><b>短码:</b> ${data.shortCode}</p>
              <p><b>用户名:</b> ${data.username || '未指定'}</p>
              <p><b>有效期:</b> ${data.expiresAt}</p>
              <p><b>最大下载:</b> ${data.maxDownloads}次</p>
            </div>
            <div class="form-group">
              <label>链接地址</label>
              <input type="text" value="${optimizedShortLink}" readonly style="cursor:pointer;" onclick="this.select()">
              <p style="font-size:12px;color:var(--muted);margin-top:4px;">点击链接可复制</p>
            </div>
          `, `
            <button class="btn" onclick="closeModal()">关闭</button>
          `);

          toast('链接创建成功', 'success');
          loadLinks();
        } else {
          toast(res ? res.message : '创建链接失败', 'error');
        }
      } catch (e) {
        console.error('创建链接失败:', e);
        toast('创建链接失败: ' + (e.message || '未知错误'), 'error');
      }
    }

    async function showLinkDetails(id) {
      try {
        const res = await api('/exports/links');
        if (res && res.ok) {
          const link = res.data.find(e => e.id === id);
          if (link) {
            const shortLink = `${location.origin}/link/${link.shortCode}`;

            showModal('链接详情', `
              <div style="margin-bottom:16px;">
                <p><b>短链接:</b> <a href="${shortLink}" target="_blank">${shortLink}</a></p>
                <p><b>短码:</b> ${link.shortCode}</p>
                <p><b>用户名:</b> ${link.username || '未指定'}</p>
                <p><b>导出文件:</b> ${link.filename}</p>
                <p><b>生成时间:</b> ${new Date(link.createdAt).toLocaleString()}</p>
                <p><b>过期时间:</b> ${new Date(link.expiresAt).toLocaleString()}</p>
                <p><b>下载次数:</b> ${link.downloadCount}/${link.maxDownloads}</p>
                <p><b>简介:</b> ${link.description || '无'}</p>
              </div>
            `, `
              <button class="btn" onclick="closeModal()">关闭</button>
            `);
          }
        }
      } catch (e) {
        console.error('获取链接详情失败:', e);
        toast('获取详情失败', 'error');
      }
    }

    async function deleteLink(id) {
      if (!confirm('确定要删除该链接吗？')) return;

      try {
        const res = await api('/exports/link/' + id, { method: 'DELETE' });
        if (res && res.ok) {
          toast('删除成功', 'success');
          loadLinks();
        } else {
          toast('删除失败', 'error');
        }
      } catch (e) {
        console.error('删除链接失败:', e);
        toast('删除失败', 'error');
      }
    }

    async function showUpdateLinkModal(linkId) {
      try {
        // 获取链接信息
        const res = await api('/exports/links');
        if (!res || !res.ok) {
          toast('获取链接信息失败', 'error');
          return;
        }

        const link = res.data.find(l => l.id === linkId);
        if (!link) {
          toast('链接不存在', 'error');
          return;
        }

        // 计算剩余有效期（小时）
        const now = new Date();
        const expiresAt = new Date(link.expiresAt);
        const remainingHours = Math.ceil((expiresAt - now) / (1000 * 60 * 60));

        showModal('编辑链接授权', `
          <input type="hidden" id="updateLinkId" value="${linkId}">
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="updateLinkUsername" value="${esc(link.username || '')}" placeholder="请输入用户名">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea id="updateLinkDescription" placeholder="请输入描述">${esc(link.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label>有效期（小时）</label>
            <input type="number" id="updateLinkExpiresIn" value="${remainingHours}" min="1" max="720">
          </div>
          <div class="form-group">
            <label>最大下载次数</label>
            <input type="number" id="updateLinkMaxDownloads" value="${link.maxDownloads}" min="1" max="100">
          </div>
          <div class="form-group">
            <label>IP绑定</label>
            <select id="updateLinkIpBinding">
              <option value="false" ${!link.ipBinding ? 'selected' : ''}>不绑定</option>
              <option value="true" ${link.ipBinding ? 'selected' : ''}>绑定当前IP</option>
            </select>
          </div>
        `, `
          <button class="btn" onclick="closeModal()">取消</button>
          <button class="btn btn-primary" onclick="updateLink()">保存</button>
        `);
      } catch (e) {
        console.error('加载链接信息失败:', e);
        toast('加载失败', 'error');
      }
    }

    async function updateLink() {
      const linkId = document.getElementById('updateLinkId').value;
      const username = document.getElementById('updateLinkUsername').value;
      const description = document.getElementById('updateLinkDescription').value;
      const expiresIn = document.getElementById('updateLinkExpiresIn').value;
      const maxDownloads = document.getElementById('updateLinkMaxDownloads').value;
      const ipBinding = document.getElementById('updateLinkIpBinding').value === 'true';

      try {
        const res = await api('/exports/link/' + linkId, {
          method: 'PUT',
          body: JSON.stringify({
            username,
            description,
            expiresIn,
            maxDownloads,
            ipBinding
          })
        });

        if (res && res.ok) {
          toast('链接已更新', 'success');
          closeModal();
          loadLinks();
        } else {
          toast('更新失败', 'error');
        }
      } catch (e) {
        console.error('更新链接失败:', e);
        toast('更新失败', 'error');
      }
    }

    async function showExportDetails(id) {
      try {
        const res = await api('/exports/list');
        if (res && res.ok) {
          const exp = res.data.find(e => e.id === id);
          if (exp) {
            // 生成下载链接
            const token = btoa(JSON.stringify({
              exportId: exp.id,
              filename: exp.filename,
              exp: new Date(exp.expiresAt).getTime(),
              sig: 'dummy' // 实际应该由后端生成
            }));
            const downloadUrl = `${location.origin}/api/exports/download?file=${exp.filename}&token=${token}`;

            showModal('导出详情', `
              <div style="margin-bottom:16px;">
                <p><b>文件名:</b> ${exp.filename}</p>
                <p><b>导出人:</b> ${exp.userId || 'admin'}</p>
                <p><b>生成时间:</b> ${new Date(exp.createdAt).toLocaleString()}</p>
                <p><b>过期时间:</b> ${new Date(exp.expiresAt).toLocaleString()}</p>
                <p><b>下载次数:</b> ${exp.downloadCount}/${exp.maxDownloads}</p>
                <p><b>文件大小:</b> ${(exp.fileSize / 1024).toFixed(2)}KB</p>
              </div>
              <div class="form-group">
                <label>下载链接</label>
                <input type="text" value="${downloadUrl}" readonly style="cursor:pointer;" onclick="this.select()">
                <p style="font-size:12px;color:var(--muted);margin-top:4px;">点击链接可复制</p>
              </div>
            `, `
              <button class="btn" onclick="closeModal()">关闭</button>
              <a href="${downloadUrl}" class="btn btn-primary" download>下载</a>
            `);
          }
        }
      } catch (e) {
        console.error('获取导出详情失败:', e);
        toast('获取详情失败', 'error');
      }
    }

    async function deleteExport(id) {
      if (!confirm('确定要删除该导出记录吗？')) return;

      try {
        const res = await api('/exports/' + id, { method: 'DELETE' });
        if (res && res.ok) {
          toast('删除成功', 'success');
          loadExports();
        } else {
          toast('删除失败', 'error');
        }
      } catch (e) {
        console.error('删除导出失败:', e);
        toast('删除失败', 'error');
      }
    }

    async function cleanupExpiredExports() {
      if (!confirm('确定要清理过期的导出记录吗？')) return;

      try {
        const res = await api('/exports/cleanup', { method: 'POST' });
        if (res && res.ok) {
          toast('清理成功', 'success');
          loadExports();
        } else {
          toast('清理失败', 'error');
        }
      } catch (e) {
        console.error('清理过期导出失败:', e);
        toast('清理失败', 'error');
      }
    }

    // ========== 定时任务 ==========
    let schedulerSourceCache = [];

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
          statusEl.textContent = `调度器运行中 · ${res.status.activeTasks} 个活跃任务`;
        }

        if (!tasks.length) {
          tbody.innerHTML = '';
          emptyEl.style.display = 'block';
          return;
        }

        emptyEl.style.display = 'none';
        tbody.innerHTML = tasks.map(t => {
          const lastRun = t.lastRunAt
            ? `<span style="font-size:12px;">${new Date(t.lastRunAt).toLocaleString()}</span>` +
              (t.lastResult ? (t.lastResult.success
                ? `<br><span style="color:#4caf50;font-size:12px;">导入 ${t.lastResult.imported} 个频道 · ${t.lastResult.duration}ms</span>`
                : `<br><span style="color:#f44336;font-size:12px;">失败: ${esc(t.lastResult.error)}</span>`)
              : '')
            : '<span style="color:var(--muted);font-size:12px;">尚未执行</span>';

          const nextRun = t.enabled && t.nextRunAt
            ? `<span style="font-size:12px;color:var(--muted);">${formatCountdown(new Date(t.nextRunAt) - Date.now())}</span>`
            : '<span style="color:var(--muted);font-size:12px;">-</span>';

          return `<tr>
            <td><b>${esc(t.name)}</b></td>
            <td style="font-size:13px;">${esc(t.sourceName || t.sourceId)}</td>
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

      showModal(editId ? '编辑定时任务' : '新建定时任务', `
        <div class="form-group">
          <label>任务名称</label>
          <input type="text" id="taskName" placeholder="例如：每日更新频道" value="${task ? esc(task.name) : ''}" style="width:100%;padding:8px 12px;">
        </div>
        <div class="form-group">
          <label>节目源 *</label>
          <select id="taskSource" style="width:100%;padding:8px 12px;">
            <option value="">-- 请选择节目源 --</option>
            ${sourceOptions}
          </select>
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
    }

    async function saveSchedulerTask(editId) {
      const name = document.getElementById('taskName').value.trim();
      const sourceId = document.getElementById('taskSource').value;
      const cron = document.getElementById('taskCron').value.trim();

      if (!sourceId) { toast('请选择节目源', 'error'); return; }
      if (!cron) { toast('请填写 cron 表达式', 'error'); return; }

      try {
        let res;
        if (editId) {
          res = await api('/scheduler/tasks/' + editId, {
            method: 'PUT',
            body: JSON.stringify({ name: name || undefined, sourceId, cron })
          });
        } else {
          res = await api('/scheduler/tasks', {
            method: 'POST',
            body: JSON.stringify({ name: name || undefined, sourceId, cron })
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

    // 暴露到全局作用域
    window.loadSourceChannels = loadSourceChannels;
    window.doImportChannels = doImportChannels;
    window.importChannelsFromSource = importChannelsFromSource;
    window.batchExportChannels = batchExportChannels;
    window.doBatchExport = doBatchExport;
    window.batchDeleteChannels = batchDeleteChannels;
    window.batchEditChannels = batchEditChannels;
    window.doBatchEdit = doBatchEdit;
    window.switchPage = switchPage;
    window.openPlayer = openPlayer;
    window.handleLogout = handleLogout;
    window.showChannelModal = showChannelModal;
    window.saveChannel = saveChannel;
    window.editChannel = editChannel;
    window.deleteChannel = deleteChannel;
    window.showSourceModal = showSourceModal;
    window.deleteSource = deleteSource;
    window.saveSource = saveSource;
    window.showUserModal = showUserModal;
    window.confirmDeleteUser = confirmDeleteUser;
    window.doDeleteUser = doDeleteUser;
    window.confirmResetPassword = confirmResetPassword;
    window.doResetPassword = doResetPassword;
    window.createUser = createUser;
    window.saveSettings = saveSettings;
    window.saveGlobalUa = saveGlobalUa;
    window.resetGlobalUa = resetGlobalUa;
    window.showChannelUaModal = showChannelUaModal;
    window.addCustomUa = addCustomUa;
    window.cancelAddCustomUa = cancelAddCustomUa;
    window.testPlay = testPlay;
    window.openPlayerWithTest = openPlayerWithTest;
    window.clearTestForm = clearTestForm;
    window.importTestJson = importTestJson;
    window.exportTestJson = exportTestJson;
    window.loadCurrentChannelsJson = loadCurrentChannelsJson;
    window.closeModal = closeModal;
    window.saveChannelUaFromModal = saveChannelUaFromModal;
    window.updateChannelUa = updateChannelUa;
    window.deleteCustomUa = deleteCustomUa;
    window.deleteChannelUa = deleteChannelUa;
    window.loadExports = loadExports;
    window.showExportDetails = showExportDetails;
    window.deleteExport = deleteExport;
    window.cleanupExpiredExports = cleanupExpiredExports;
    window.importChannelsFromFile = importChannelsFromFile;
    window.loadFileChannels = loadFileChannels;
    window.doImportFileChannels = doImportFileChannels;
    window.loadEpgChannels = loadEpgChannels;
    window.showEpgChannelModal = showEpgChannelModal;
    window.saveEpgChannel = saveEpgChannel;
    window.deleteEpgChannel = deleteEpgChannel;
    window.updateEpgChannelStrategy = updateEpgChannelStrategy;

    async function batchDeleteChannels() {
      const checkboxes = document.querySelectorAll('.channel-checkbox:checked');
      if (checkboxes.length === 0) {
        toast('请选择要删除的频道', 'error');
        return;
      }

      const count = checkboxes.length;
      if (!confirm(`确定要删除选中的 ${count} 个频道吗？`)) return;

      showBatchProgressModal('批量删除', ['准备删除数据', '提交到服务器', '完成']);
      updateBatchProgress(1, 3, '正在删除...', '共 ' + count + ' 个频道');

      const channelIds = Array.from(checkboxes).map(cb => cb.value);

      try {
        updateBatchProgress(2, 3, '正在删除...', '提交删除请求中');
        const res = await api('/channels/batch/delete', {
          method: 'POST',
          body: JSON.stringify({ ids: channelIds })
        });

        if (res && res.ok) {
          setBatchProgressDone('删除完成', '成功删除 ' + count + ' 个频道', true);
        } else {
          setBatchProgressFail('删除失败', res ? res.message : '服务器返回错误');
        }
      } catch (e) {
        setBatchProgressFail('删除失败', '网络请求异常');
      }
    }

    // ========== 源配置 ==========
    async function loadSources() {
      const m3uKeyword = String(document.getElementById('m3uSearch')?.value || '').trim().toLowerCase();
      const epgKeyword = String(document.getElementById('epgSearch')?.value || '').trim().toLowerCase();
      setTableSkeleton('m3uSourceTableBody', 5, 4);
      setTableSkeleton('epgSourceTableBody', 4, 4);
      try {
        const [m3uRes, epgRes] = await Promise.all([api('/sources/m3u'), api('/sources/epg')]);
        const m3uBody = document.getElementById('m3uSourceTableBody');
        const epgBody = document.getElementById('epgSourceTableBody');
        const m3uRows = (m3uRes && m3uRes.ok && Array.isArray(m3uRes.data))
          ? m3uRes.data.filter((s) => String(s.name || '').toLowerCase().includes(m3uKeyword) || String(s.url || '').toLowerCase().includes(m3uKeyword))
          : [];
        const epgRows = (epgRes && epgRes.ok && Array.isArray(epgRes.data))
          ? epgRes.data.filter((s) => String(s.name || '').toLowerCase().includes(epgKeyword) || String(s.url || '').toLowerCase().includes(epgKeyword))
          : [];

        updateResultCount('m3uResultCount', Math.min(SOURCE_PAGE_SIZE, m3uRows.length), m3uRows.length);
        updateResultCount('epgResultCount', Math.min(SOURCE_PAGE_SIZE, epgRows.length), epgRows.length);

        if (m3uRows.length) {
          const m3uTotalPages = Math.max(1, Math.ceil(m3uRows.length / SOURCE_PAGE_SIZE));
          if (m3uPage > m3uTotalPages) m3uPage = m3uTotalPages;
          const m3uSlice = m3uRows.slice((m3uPage - 1) * SOURCE_PAGE_SIZE, m3uPage * SOURCE_PAGE_SIZE);
          updateResultCount('m3uResultCount', m3uSlice.length, m3uRows.length);
          m3uBody.innerHTML = m3uSlice.map(s => `<tr>
            <td><b>${esc(s.name)}</b></td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.url)}</td>
            <td><span class="status-dot online"></span>正常</td>
            <td>${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-'}</td>
            <td class="btn-group">
              <button class="btn btn-sm" onclick="showSourceModal('m3u','${s.id}')">编辑</button>
              <button class="btn btn-sm btn-primary" onclick="importChannelsFromSource('${s.id}')">导入</button>
              <button class="btn btn-sm btn-danger" onclick="deleteSource('m3u','${s.id}')">删除</button>
            </td>
          </tr>`).join('');
            renderPagination({
              rootId: 'm3uPagination',
              totalItems: m3uRows.length,
              pageSize: SOURCE_PAGE_SIZE,
              page: m3uPage,
              setPage: (v) => { m3uPage = v; },
              onChange: loadSources
            });
        } else {
          setTableEmptyRow('m3uSourceTableBody', 5, '暂无节目源配置', '🛰️');
            const m3uPagination = document.getElementById('m3uPagination');
            if (m3uPagination) {
              m3uPagination.style.display = 'none';
              m3uPagination.innerHTML = '';
            }
        }
          if (epgRows.length) {
            const epgTotalPages = Math.max(1, Math.ceil(epgRows.length / SOURCE_PAGE_SIZE));
            if (epgPage > epgTotalPages) epgPage = epgTotalPages;
            const epgSlice = epgRows.slice((epgPage - 1) * SOURCE_PAGE_SIZE, epgPage * SOURCE_PAGE_SIZE);
            updateResultCount('epgResultCount', epgSlice.length, epgRows.length);
            epgBody.innerHTML = epgSlice.map(s => `<tr>
            <td><b>${esc(s.name)}</b></td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.url)}</td>
            <td><span class="status-dot online"></span>正常</td>
            <td class="btn-group">
              <button class="btn btn-sm" onclick="showSourceModal('epg','${s.id}')">编辑</button>
              <button class="btn btn-sm btn-danger" onclick="deleteSource('epg','${s.id}')">删除</button>
            </td>
          </tr>`).join('');
            renderPagination({
              rootId: 'epgPagination',
              totalItems: epgRows.length,
              pageSize: SOURCE_PAGE_SIZE,
              page: epgPage,
              setPage: (v) => { epgPage = v; },
              onChange: loadSources
            });
        } else {
          setTableEmptyRow('epgSourceTableBody', 4, '暂无 EPG 源配置', '🗂️');
            const epgPagination = document.getElementById('epgPagination');
            if (epgPagination) {
              epgPagination.style.display = 'none';
              epgPagination.innerHTML = '';
            }
        }
      } catch (e) {
        setTableEmptyRow('m3uSourceTableBody', 5, '加载节目源失败', '⚠️');
        setTableEmptyRow('epgSourceTableBody', 4, '加载 EPG 源失败', '⚠️');
          updateResultCount('m3uResultCount', 0, 0);
          updateResultCount('epgResultCount', 0, 0);
        const m3uPagination = document.getElementById('m3uPagination');
        const epgPagination = document.getElementById('epgPagination');
        if (m3uPagination) {
          m3uPagination.style.display = 'none';
          m3uPagination.innerHTML = '';
        }
        if (epgPagination) {
          epgPagination.style.display = 'none';
          epgPagination.innerHTML = '';
        }
        toast('加载源配置失败', 'error');
      }
    }

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

    // ========== 用户管理 ==========
    async function loadUsers() {
      const keyword = String(document.getElementById('userSearch')?.value || '').trim().toLowerCase();
      setTableSkeleton('userTableBody', 3, 4);
      try {
        const res = await api('/auth/users');
        const tbody = document.getElementById('userTableBody');
        if (!res || !res.ok) {
          setTableEmptyRow('userTableBody', 3, '无法加载用户列表（需要管理员权限且鉴权已启用）', '🔐');
          updateResultCount('userResultCount', 0, 0);
          return;
        }
        const rows = Array.isArray(res.data)
          ? res.data.filter((u) => String(u.username || u.userId || '').toLowerCase().includes(keyword) || String(u.role || '').toLowerCase().includes(keyword))
          : [];
        if (!rows.length) {
          setTableEmptyRow('userTableBody', 3, '暂无用户数据', '👤');
          updateResultCount('userResultCount', 0, 0);
          const userPagination = document.getElementById('userPagination');
          if (userPagination) {
            userPagination.style.display = 'none';
            userPagination.innerHTML = '';
          }
          return;
        }

        const totalPages = Math.max(1, Math.ceil(rows.length / USER_PAGE_SIZE));
        if (userPage > totalPages) userPage = totalPages;
        const pageRows = rows.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
        updateResultCount('userResultCount', pageRows.length, rows.length);

        tbody.innerHTML = pageRows.map(u => `<tr>
          <td><b>${esc(u.username || '-')}</b></td>
          <td><span class="tag ${u.role === 'admin' ? 'tag-warning' : 'tag-success'}">${esc(u.role || 'user')}</span></td>
          <td class="btn-group">
            <button class="btn btn-sm" onclick='showChangePassword(${JSON.stringify(u.username)})'>改密</button>
            <button class="btn btn-sm" onclick='confirmResetPassword(${JSON.stringify(u.username)}, ${JSON.stringify(u.id)})'>重置</button>
            <button class="btn btn-sm btn-danger" onclick="confirmDeleteUser(${JSON.stringify(u.username)}, '${u.id}')">删除</button>
          </td>
        </tr>`).join('');

        renderPagination({
          rootId: 'userPagination',
          totalItems: rows.length,
          pageSize: USER_PAGE_SIZE,
          page: userPage,
          setPage: (v) => { userPage = v; },
          onChange: loadUsers
        });
      } catch (e) {
        setTableEmptyRow('userTableBody', 3, '加载用户列表失败', '⚠️');
        updateResultCount('userResultCount', 0, 0);
        const userPagination = document.getElementById('userPagination');
        if (userPagination) {
          userPagination.style.display = 'none';
          userPagination.innerHTML = '';
        }
      }
    }

    function showUserModal() {
      showModal('添加用户', `
        <div class="form-group"><label>用户名 *</label><input id="newUsername"></div>
        <div class="form-group"><label>密码 *</label><input id="newPassword" type="password"></div>
        <div class="form-group"><label>角色</label><select id="newRole"><option value="user">普通用户</option><option value="admin">管理员</option></select></div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="createUser()">创建</button>`);
    }

    async function createUser() {
      const data = { username: document.getElementById('newUsername').value.trim(), password: document.getElementById('newPassword').value, role: document.getElementById('newRole').value };
      if (!data.username || !data.password) { toast('用户名和密码不能为空', 'error'); return; }
      const res = await api('/auth/users', { method: 'POST', body: JSON.stringify(data) });
      if (res && res.ok) { toast('创建成功', 'success'); closeModal(); loadUsers(); } else toast(res ? res.message : '创建失败', 'error');
    }

    let currentChangePasswordUsername = null;

    function showChangePassword(username) {
      currentChangePasswordUsername = username;
      showModal('修改密码 - ' + username, `<div class="form-group"><label>新密码 *</label><input id="cpPassword" type="password"></div>`,
        `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" id="cpSaveBtn">保存</button>`);
      // 绑定保存按钮事件
      setTimeout(() => {
        const saveBtn = document.getElementById('cpSaveBtn');
        if (saveBtn) {
          saveBtn.onclick = changePassword;
        }
      }, 0);
    }

    async function changePassword() {
      const pwInput = document.getElementById('cpPassword');
      if (!pwInput) { toast('密码输入框不存在', 'error'); return; }
      const pw = pwInput.value;
      if (!pw) { toast('密码不能为空', 'error'); return; }
      if (!currentChangePasswordUsername) { toast('用户名错误', 'error'); return; }

      // 先获取用户列表找到对应的用户 ID
      try {
        const res = await api('/auth/users');
        if (!res || !res.ok) { toast('无法获取用户列表: ' + (res?.message || '未知错误'), 'error'); return; }

        const user = res.data.find(u => u.username === currentChangePasswordUsername);
        if (!user) { toast('用户不存在: ' + currentChangePasswordUsername, 'error'); return; }

        // 调用更新用户 API 修改密码
        const updateRes = await api('/auth/users/' + user.id, {
          method: 'PUT',
          body: JSON.stringify({ password: pw })
        });

        if (updateRes && updateRes.ok) {
          toast('密码修改成功', 'success');
          closeModal();
          currentChangePasswordUsername = null;
        } else {
          toast(updateRes ? updateRes.message : '密码修改失败', 'error');
        }
      } catch (e) {
        toast('密码修改失败: ' + (e?.message || String(e)), 'error');
      }
    }

    function confirmDeleteUser(username, id) {
      showModal('确认删除', `
        <div style="padding:16px 0;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
          <p style="font-size:15px;color:var(--text-main);">确定要删除用户 <b style="color:#ff6b6b;">${esc(username)}</b> 吗？</p>
          <p style="font-size:13px;color:var(--muted);margin-top:8px;">此操作不可撤销</p>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-danger" onclick="doDeleteUser('${id}')">确认删除</button>
      `);
    }

    async function doDeleteUser(id) {
      const res = await api('/auth/users/' + id, { method: 'DELETE' });
      if (res && res.ok) { toast('删除成功', 'success'); closeModal(); loadUsers(); } else toast(res ? res.message : '删除失败', 'error');
    }

    function confirmResetPassword(username, id) {
      showModal('确认重置密码', `
        <div style="padding:16px 0;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🔑</div>
          <p style="font-size:15px;color:var(--text-main);">确定要重置用户 <b style="color:#7ac1ff;">${esc(username)}</b> 的密码吗？</p>
          <p style="font-size:13px;color:var(--muted);margin-top:8px;">密码将被重置为 <code style="background:var(--bg-2);padding:2px 8px;border-radius:4px;font-size:13px;">123456</code></p>
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="doResetPassword('${id}', ${JSON.stringify(username)})">确认重置</button>
      `);
    }

    async function doResetPassword(id, username) {
      try {
        const res = await api('/auth/users/' + id, {
          method: 'PUT',
          body: JSON.stringify({ password: '123456' })
        });
        if (res && res.ok) {
          toast(`用户 ${username} 的密码已重置为 123456`, 'success');
          closeModal();
        } else {
          toast(res ? res.message : '重置失败', 'error');
        }
      } catch (e) {
        toast('重置失败', 'error');
      }
    }

    // ========== 系统设置 ==========
    async function loadSettings() {
      try {
        const res = await api('/settings');
        if (res && res.ok) {
          const s = res.data;
          if (s.defaultPlayer) document.getElementById('settingPlayer').value = s.defaultPlayer;
          if (s.cacheM3uTtl) document.getElementById('settingCacheM3u').value = s.cacheM3uTtl;
          if (s.cacheEpgTtl) document.getElementById('settingCacheEpg').value = s.cacheEpgTtl;
          if (s.timeout) document.getElementById('settingTimeout').value = s.timeout;
          if (s.playbackMode) document.getElementById('settingPlaybackMode').value = s.playbackMode;
          if (s.m3uProxyAuth !== undefined) document.getElementById('settingM3uProxyAuth').value = String(s.m3uProxyAuth);
        }
      } catch (e) {}
    }

    async function saveSettings() {
      try {
        const data = {
          defaultPlayer: document.getElementById('settingPlayer').value,
          cacheM3uTtl: parseInt(document.getElementById('settingCacheM3u').value) || 10,
          cacheEpgTtl: parseInt(document.getElementById('settingCacheEpg').value) || 30,
          timeout: parseInt(document.getElementById('settingTimeout').value) || 40,
          playbackMode: document.getElementById('settingPlaybackMode').value,
          m3uProxyAuth: document.getElementById('settingM3uProxyAuth').value === 'true'
        };
        
        console.log('[Settings] 保存设置:', data);
        
        const res = await api('/settings', { method: 'PUT', body: JSON.stringify(data) });
        
        console.log('[Settings] 响应:', res);
        
        if (res && res.ok) {
          toast('设置已保存', 'success');
          // 重新加载设置以确保显示最新值
          loadSettings();
        } else {
          console.error('[Settings] 保存失败:', res);
          toast('保存失败：' + (res?.message || '未知错误'), 'error');
        }
      } catch (error) {
        console.error('[Settings] 保存异常:', error);
        toast('保存失败：' + error.message, 'error');
      }
    }

    // ========== 分组与 UA 管理 ==========
    const PRESET_GROUPS = ['CCTV', '卫视', '地方台', '港澳', '国际', '影视', '体育', '新闻', '少儿', '其他'];

    async function loadGroupManageList() {
      try {
        const res = await api('/channels/groups');
        let groups = [];
        if (res && res.ok && Array.isArray(res.data)) {
          groups = res.data;
        }
        const allGroups = [...new Set([...groups, ...PRESET_GROUPS])].sort();

        const listEl = document.getElementById('groupManageList');
        const emptyEl = document.getElementById('groupManageEmpty');
        
        if (!listEl) return;

        if (allGroups.length === 0) {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'block';
          return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        listEl.innerHTML = allGroups.map(g => {
          const isPreset = PRESET_GROUPS.includes(g);
          return `
            <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.08);border-radius:6px;font-size:13px;">
              <span>${esc(g)}</span>
              ${isPreset ? `
                <span style="color:var(--muted);font-size:11px;" title="预设分组">📌</span>
              ` : `
                <button onclick="deleteGroup('${esc(g)}')" 
                  style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:14px;"
                  title="删除分组">✕</button>
              `}
            </div>
          `;
        }).join('');
      } catch (e) {
        console.error('加载分组列表失败:', e);
      }
    }

    function showAddGroupModal() {
      showModal('添加分组', `
        <div class="form-group">
          <label>分组名称</label>
          <input type="text" id="newGroupName" placeholder="输入分组名称" 
            style="padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-main);width:100%;">
        </div>
        <div style="margin-top:12px;padding:12px;background:rgba(122,193,255,0.1);border-radius:6px;font-size:12px;color:var(--muted);">
          <strong>💡 提示：</strong>添加分组后，可以在频道管理中进行关联
        </div>
      `, `
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="addNewGroup()">确定添加</button>
      `);
    }

    async function addNewGroup() {
      const input = document.getElementById('newGroupName');
      const groupName = input?.value?.trim();
      
      if (!groupName) {
        toast('请输入分组名称', 'error');
        return;
      }
      
      // 检查是否已存在
      const res = await api('/channels/groups');
      if (res && res.ok && Array.isArray(res.data)) {
        if (res.data.includes(groupName)) {
          toast('该分组已存在', 'error');
          return;
        }
      }
      
      // 分组是自动从频道中提取的，这里只是提示用户
      toast('分组已添加，可以在频道管理中关联', 'success');
      closeModal();
      loadGroupManageList();
    }
    
    async function deleteGroup(groupName) {
      if (!confirm(`确定要删除分组"${groupName}"吗？\n\n注意：已关联该分组的频道将被设置为"未分组"`)) {
        return;
      }
      
      try {
        // 获取该分组下的所有频道
        const res = await api('/channels');
        if (res && res.ok && Array.isArray(res.data)) {
          const channelsInGroup = res.data.filter(ch => ch.group === groupName);
          
          if (channelsInGroup.length > 0) {
            // 批量设置为未分组
            const ids = channelsInGroup.map(ch => ch.id);
            await api('/channels/batch/update', {
              method: 'POST',
              body: JSON.stringify({ ids, data: { group: '未分组' } })
            });
          }
          
          toast(`分组"${groupName}"已删除`, 'success');
          loadGroupManageList();
        }
      } catch (e) {
        console.error('删除分组失败:', e);
        toast('删除分组失败', 'error');
      }
    }

    // ========== UA 管理 ==========
    const UA_PRESETS = [
      { name: "默认 (okhttp)", value: "okhttp" },
      { name: "VLC for Android", value: "VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7" },
      { name: "MX Player", value: "MXPlayer/1.58.1" },
      { name: "IPTV Smarters", value: "IPTV Smarters Pro/4.2" },
      { name: "Chrome Mobile", value: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36" },
      { name: "Safari iOS", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1" },
      { name: "Windows Chrome", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      { name: "Firefox", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
      { name: "Edge", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91" },
      { name: "curl", value: "curl/8.4.0" }
    ];

    const CUSTOM_UA_STORAGE_KEY = 'admin.customUas';

    function loadCustomUas() {
      try { return JSON.parse(localStorage.getItem(CUSTOM_UA_STORAGE_KEY)) || []; } catch { return []; }
    }

    function saveCustomUas(list) {
      localStorage.setItem(CUSTOM_UA_STORAGE_KEY, JSON.stringify(list));
    }

    function fillPresetSelect(selectEl) {
      if (!selectEl) return;
      selectEl.innerHTML = '<option value="">-- 选择预设 --</option>';
      UA_PRESETS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.value;
        opt.textContent = p.name;
        selectEl.appendChild(opt);
      });
      const customs = loadCustomUas();
      if (customs.length) {
        const group = document.createElement('optgroup');
        group.label = '自定义预设';
        customs.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.value;
          opt.textContent = c.name;
          group.appendChild(opt);
        });
        selectEl.appendChild(group);
      }
    }

    function renderCustomPresetsList() {
      const list = document.getElementById('uaCustomPresetsList');
      const empty = document.getElementById('uaCustomPresetsEmpty');
      const customs = loadCustomUas();
      if (!list) return;
      if (!customs.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      list.innerHTML = '<table><thead><tr><th>名称</th><th>User-Agent</th><th>操作</th></tr></thead><tbody>' +
        customs.map((c, i) => `<tr>
          <td><b>${esc(c.name)}</b></td>
          <td style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(c.value)}">${esc(c.value)}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteCustomUa(${i})">删除</button></td>
        </tr>`).join('') + '</tbody></table>';
    }

    function deleteCustomUa(index) {
      const customs = loadCustomUas();
      if (index < 0 || index >= customs.length) return;
      if (!confirm('确定删除自定义预设 "' + customs[index].name + '"？')) return;
      customs.splice(index, 1);
      saveCustomUas(customs);
      fillPresetSelect(document.getElementById('uaPresetSelect'));
      renderCustomPresetsList();
      toast('已删除自定义预设', 'success');
    }

    function addCustomUa() {
      const nameInput = document.getElementById('customUaName');
      const valueInput = document.getElementById('customUaValue');
      if (!nameInput || !valueInput) return;
      const name = nameInput.value.trim();
      const value = valueInput.value.trim();
      if (!name || !value) { toast('请填写名称和 UA 字符串', 'error'); return; }
      const customs = loadCustomUas();
      if (customs.some(c => c.value === value)) { toast('该 UA 已存在', 'error'); return; }
      customs.push({ name, value });
      saveCustomUas(customs);
      nameInput.value = '';
      valueInput.value = '';
      document.getElementById('customUaInputRow').style.display = 'none';
      fillPresetSelect(document.getElementById('uaPresetSelect'));
      renderCustomPresetsList();
      toast('自定义预设已添加', 'success');
    }

    function setupCustomUaInput() {
      const btn = document.getElementById('btnAddUaPreset');
      const inputRow = document.getElementById('customUaInputRow');
      const nameInput = document.getElementById('customUaName');
      const valueInput = document.getElementById('customUaValue');
      if (!btn || !inputRow) return;

      btn.onclick = () => {
        const visible = inputRow.style.display !== 'none';
        inputRow.style.display = visible ? 'none' : 'block';
        if (!visible && nameInput) nameInput.focus();
      };
    }

    function cancelAddCustomUa() {
      const inputRow = document.getElementById('customUaInputRow');
      const nameInput = document.getElementById('customUaName');
      const valueInput = document.getElementById('customUaValue');
      if (inputRow) inputRow.style.display = 'none';
      if (nameInput) nameInput.value = '';
      if (valueInput) valueInput.value = '';
    }

    async function loadGroupUaPage() {
      // 加载分组列表
      loadGroupManageList();

      // 填充预设下拉（包含自定义）
      fillPresetSelect(document.getElementById('uaPresetSelect'));

      // 加载全局 UA
      try {
        const res = await api('/settings/ua/global');
        const input = document.getElementById('uaGlobalInput');
        if (res && res.ok && input) {
          input.value = res.userAgent || '';
        }
      } catch (e) {}

      // 预设选择 → 填充到输入框
      const presetSelect = document.getElementById('uaPresetSelect');
      if (presetSelect) {
        presetSelect.onchange = () => {
          const input = document.getElementById('uaGlobalInput');
          if (input && presetSelect.value) {
            input.value = presetSelect.value;
          }
        };
      }

      // 自定义预设输入
      setupCustomUaInput();

      // 渲染自定义预设列表
      renderCustomPresetsList();

      // 加载频道 UA 列表
      loadChannelUaList();
    }

    async function loadChannelUaList() {
      const tbody = document.getElementById('uaChannelTableBody');
      const empty = document.getElementById('uaChannelEmpty');
      if (!tbody) return;

      try {
        // 获取所有频道
        const channelsRes = await api('/channels?search=');
        const channels = (channelsRes && channelsRes.ok && Array.isArray(channelsRes.data)) ? channelsRes.data : [];

        // 获取设置中的频道 UA 映射
        const settingsRes = await api('/settings');
        const channelUaMap = (settingsRes && settingsRes.ok && settingsRes.data && settingsRes.data.channelUserAgents) ? settingsRes.data.channelUserAgents : {};

        // 过滤出有自定义 UA 的频道
        const rows = [];
        for (const ch of channels) {
          const ua = channelUaMap[ch.id];
          if (ua) {
            rows.push({ name: ch.name, id: ch.id, userAgent: ua });
          }
        }

        if (!rows.length) {
          tbody.innerHTML = '';
          if (empty) empty.style.display = 'block';
          return;
        }

        if (empty) empty.style.display = 'none';
        tbody.innerHTML = rows.map(r => `<tr>
          <td><b>${esc(r.name)}</b></td>
          <td style="font-family:monospace;font-size:12px;color:var(--muted);">${esc(r.id)}</td>
          <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.userAgent)}">${esc(r.userAgent)}</td>
          <td class="btn-group">
            <button class="btn btn-sm" onclick="editChannelUa('${esc(r.id)}','${esc(r.name)}','${esc(r.userAgent)}')">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="deleteChannelUa('${esc(r.id)}','${esc(r.name)}')">删除</button>
          </td>
        </tr>`).join('');
      } catch (e) {
        toast('加载频道 UA 列表失败', 'error');
      }
    }

    async function saveGlobalUa() {
      const input = document.getElementById('uaGlobalInput');
      if (!input) return;
      const ua = input.value.trim();
      const res = await api('/settings/ua/global', { method: 'POST', body: JSON.stringify({ userAgent: ua || 'okhttp' }) });
      if (res && res.ok) { toast('全局 UA 已保存', 'success'); } else toast('保存失败', 'error');
    }

    async function resetGlobalUa() {
      const res = await api('/settings/ua/global', { method: 'POST', body: JSON.stringify({ userAgent: 'okhttp' }) });
      if (res && res.ok) {
        const input = document.getElementById('uaGlobalInput');
        if (input) input.value = 'okhttp';
        toast('已恢复默认 UA', 'success');
      } else toast('操作失败', 'error');
    }

    function showChannelUaModal() {
      showModal('设置频道 UA', `
        <div class="form-group"><label>频道 UA 列表为空，请使用下方预设快速设置</label></div>
        <div style="padding:12px;border:1px dashed rgba(146,187,255,0.3);border-radius:8px;margin-bottom:12px;">
          <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">提示：频道 UA 需要在前端播放页面的频道编辑中设置，或直接通过 API 操作。</p>
          <div class="form-group"><label>频道 ID</label><input id="chUaId" placeholder="输入频道 ID"></div>
          <div class="form-group"><label>User-Agent</label><input id="chUaValue" placeholder="输入 UA 字符串"></div>
          <div class="form-group"><label>或选择预设</label>
            <select id="chUaPreset"><option value="">-- 选择预设 --</option>${UA_PRESETS.map(p => `<option value="${p.value}">${p.name}</option>`).join('')}${loadCustomUas().map(c => `<option value="${c.value}">${esc(c.name)}</option>`).join('')}</select>
          </div>
        </div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveChannelUaFromModal()">保存</button>`);

      setTimeout(() => {
        const preset = document.getElementById('chUaPreset');
        const valueInput = document.getElementById('chUaValue');
        if (preset && valueInput) {
          preset.onchange = () => { if (preset.value) valueInput.value = preset.value; };
        }
      }, 50);
    }

    async function saveChannelUaFromModal() {
      const channelId = document.getElementById('chUaId')?.value.trim();
      const userAgent = document.getElementById('chUaValue')?.value.trim();
      if (!channelId) { toast('请输入频道 ID', 'error'); return; }
      if (!userAgent) { toast('请输入 UA 字符串', 'error'); return; }
      const res = await api('/settings/ua/channel', { method: 'PUT', body: JSON.stringify({ channelId, userAgent }) });
      if (res && res.ok) { toast('频道 UA 已保存', 'success'); closeModal(); loadChannelUaList(); } else toast('保存失败', 'error');
    }

    function editChannelUa(id, name, currentUa) {
      showModal('编辑频道 UA - ' + name, `
        <div class="form-group"><label>频道</label><input value="${esc(name)}" disabled></div>
        <div class="form-group"><label>User-Agent</label><input id="editChUaValue" value="${esc(currentUa)}"></div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="updateChannelUa('${esc(id)}')">保存</button>`);
    }

    async function updateChannelUa(channelId) {
      const userAgent = document.getElementById('editChUaValue')?.value.trim();
      const res = await api('/settings/ua/channel', { method: 'PUT', body: JSON.stringify({ channelId, userAgent: userAgent || null }) });
      if (res && res.ok) { toast('频道 UA 已更新', 'success'); closeModal(); loadChannelUaList(); } else toast('更新失败', 'error');
    }

    async function deleteChannelUa(id, name) {
      if (!confirm('确定删除频道 "' + name + '" 的自定义 UA？')) return;
      const res = await api('/settings/ua/channel', { method: 'PUT', body: JSON.stringify({ channelId: id, userAgent: null }) });
      if (res && res.ok) { toast('已删除', 'success'); loadChannelUaList(); } else toast('删除失败', 'error');
    }

    // ========== 播放测试 ==========
    function loadPlayTestPage() {
      // 填充全局 UA 预设
      fillUaPresets();
    }

    function fillUaPresets() {
      const uaInput = document.getElementById('testUserAgent');
      if (!uaInput) return;
      // 为 testUserAgent 添加 UA 预设选择功能
      uaInput.placeholder = '选择预设或输入自定义 UA';
      
      // 检查是否已经有预设下拉框，如果没有则创建
      let presetSelect = document.getElementById('testUaPreset');
      if (!presetSelect) {
        presetSelect = document.createElement('select');
        presetSelect.id = 'testUaPreset';
        presetSelect.style.width = '100%';
        presetSelect.style.marginTop = '6px';
        presetSelect.innerHTML = '<option value="">-- 选择 UA 预设 --</option>' + 
          UA_PRESETS.map(p => `<option value="${p.value}">${p.name}</option>`).join('');
        
        // 监听选择事件
        presetSelect.addEventListener('change', () => {
          if (presetSelect.value) {
            uaInput.value = presetSelect.value;
          }
        });
        
        uaInput.parentNode.insertBefore(presetSelect, uaInput.nextSibling);
      }
    }

    function clearTestForm() {
      document.getElementById('testName').value = '';
      document.getElementById('testUrl').value = '';
      document.getElementById('testKid').value = '';
      document.getElementById('testKey').value = '';
      document.getElementById('testWidevineLicense').value = '';
      document.getElementById('testPlayreadyLicense').value = '';
      document.getElementById('testLicenseHeaders').value = '';
      document.getElementById('testPlayerType').value = 'auto';
      document.getElementById('testVlcLinkMode').value = 'proxy';
      document.getElementById('testStreamType').value = 'auto';
      document.getElementById('testUserAgent').value = '';
      toast('已清空表单', 'info');
    }

    function buildTestChannel() {
      const name = document.getElementById('testName').value.trim();
      const url = document.getElementById('testUrl').value.trim();
      const kid = document.getElementById('testKid').value.trim();
      const key = document.getElementById('testKey').value.trim();
      const widevineLicense = document.getElementById('testWidevineLicense').value.trim();
      const playreadyLicense = document.getElementById('testPlayreadyLicense').value.trim();
      const licenseHeadersStr = document.getElementById('testLicenseHeaders').value.trim();
      const playerType = document.getElementById('testPlayerType').value;
      const vlcLinkMode = document.getElementById('testVlcLinkMode').value;
      const streamType = document.getElementById('testStreamType').value;
      const userAgent = document.getElementById('testUserAgent').value.trim();

      if (!name || !url) {
        toast('频道名称和播放地址不能为空', 'error');
        return null;
      }

      const channel = { name, url };

      if (kid || key) {
        if (!kid || !key) {
          toast('KID 和 KEY 需要同时填写', 'error');
          return null;
        }
        channel.drm = { clearKeys: { [kid]: key } };
      }

      if (widevineLicense || playreadyLicense) {
        channel.drm = channel.drm || {};
        channel.drm.licenseServers = {};
        if (widevineLicense) channel.drm.licenseServers.widevine = widevineLicense;
        if (playreadyLicense) channel.drm.licenseServers.playready = playreadyLicense;
      }

      if (licenseHeadersStr) {
        try {
          const parsedHeaders = JSON.parse(licenseHeadersStr);
          if (typeof parsedHeaders === 'object' && parsedHeaders !== null) {
            channel.drm = channel.drm || {};
            channel.drm.licenseHeaders = parsedHeaders;
          }
        } catch (e) {
          toast('License 请求头格式错误，请使用 JSON 格式', 'error');
          return null;
        }
      }

      if (userAgent) channel.userAgent = userAgent;
      if (streamType && streamType !== 'auto') channel.streamType = streamType;
      if (playerType && playerType !== 'auto') channel.playerType = playerType;
      if (vlcLinkMode === 'direct' || vlcLinkMode === 'proxy') channel.vlcLinkMode = vlcLinkMode;

      return channel;
    }

    function testPlay() {
      const channel = buildTestChannel();
      if (!channel) return;

      // 保存到 localStorage 供前端播放器使用
      localStorage.setItem('birdtv_test_channel', JSON.stringify(channel));
      toast('测试配置已保存，将打开前端播放器', 'success');
      setTimeout(() => {
        window.open('/?test=true', '_blank');
      }, 500);
    }

    function openPlayerWithTest() {
      const channel = buildTestChannel();
      if (!channel) return;

      localStorage.setItem('birdtv_test_channel', JSON.stringify(channel));
      window.open('/?test=true', '_blank');
    }

    async function loadCurrentChannelsJson() {
      try {
        const res = await api('/channels');
        if (res && res.ok && Array.isArray(res.data)) {
          document.getElementById('testJsonInput').value = JSON.stringify(res.data, null, 2);
          toast('已加载当前频道数据', 'success');
        } else {
          toast('加载频道数据失败', 'error');
        }
      } catch (e) {
        toast('加载频道数据失败：' + e.message, 'error');
      }
    }

    async function importTestJson() {
      const jsonStr = document.getElementById('testJsonInput').value.trim();
      if (!jsonStr) {
        toast('请输入 JSON 数据', 'error');
        return;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
          toast('JSON 顶层必须是数组', 'error');
          return;
        }

        const res = await api('/channels/batch-import', {
          method: 'POST',
          body: JSON.stringify({ channels: parsed })
        });

        if (res && res.ok) {
          const { total, success, failed } = res.data;
          toast(`导入完成：成功 ${success}/${total}，失败 ${failed}`, failed > 0 ? 'warning' : 'success');
        } else {
          toast(res ? res.message : '导入失败', 'error');
        }
      } catch (e) {
        toast('JSON 解析失败：' + e.message, 'error');
      }
    }

    function exportTestJson() {
      api('/channels').then(res => {
        if (res && res.ok && Array.isArray(res.data)) {
          document.getElementById('testJsonInput').value = JSON.stringify(res.data, null, 2);
          toast('已导出所有频道数据', 'success');
        } else {
          toast('导出失败', 'error');
        }
      }).catch(e => {
        toast('导出失败：' + e.message, 'error');
      });
    }

    // ========== 其他 ==========
    function openPlayer() {
      window.location.href = '/';
    }

    function handleLogout() {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userInfo');
      window.location.href = '/login.html';
    }

    (async function init() {
      // 检查是否使用默认密码
      if (token) {
        try {
          const checkRes = await fetch('/api/auth/check-default-password', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.ok && checkData.data?.isDefaultPassword) {
              window.location.href = '/change-password.html';
              return;
            }
          }
        } catch (e) {
          console.warn('检查默认密码失败', e);
        }
      }
      
      setupChannelSearchDebounce();
      const srcFilter = document.getElementById('channelSourceFilter');
      if (srcFilter) srcFilter.addEventListener('change', () => { channelPage = 1; loadChannels(); });
      setupSearchDebounce('m3uSearch', 'm3u', () => { m3uPage = 1; }, loadSources);
      setupSearchDebounce('epgSearch', 'epg', () => { epgPage = 1; }, loadSources);
      setupSearchDebounce('userSearch', 'user', () => { userPage = 1; }, loadUsers);
      const info = localStorage.getItem('userInfo');
      if (info) {
        try {
          const u = JSON.parse(info);
          document.getElementById('userInfo').innerHTML = '用户: <b>' + esc(u.username || 'admin') + '</b> (' + esc(u.role || 'admin') + ')';
        } catch {}
      } else {
        document.getElementById('userInfo').textContent = '管理员';
      }
      loadDashboard();
    })();
