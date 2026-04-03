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
    const selectedChannelIds = new Set();
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
      const footer = document.getElementById('modalFooter');
      footer.innerHTML = footerHtml;
      footer.style.display = footerHtml ? 'flex' : 'none';
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
      const effectivePageSize = CHANNEL_PAGE_SIZE || totalItems;
      const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
      channelPage = Math.min(channelPage, totalPages);

      if (totalItems <= effectivePageSize) {
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
        `  <option value="0" ${CHANNEL_PAGE_SIZE === 0 ? 'selected' : ''}>全部</option>`,
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
            selectedChannelIds.clear();
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
        selectedChannelIds.clear();
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
      selectedChannelIds.clear();
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
      if (page === 'channels') { channelPage = 1; selectedChannelIds.clear(); loadChannels(); }
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
        const [channelsRes, sourcesRes, healthRes, settingsRes, usersRes] = await Promise.all([
          api('/channels').catch(() => ({ ok: false })),
          api('/sources/m3u').catch(() => ({ ok: false })),
          fetch('/health').then(r => r.json()).catch(() => null),
          api('/settings').catch(() => ({ ok: false })),
          api('/auth/users').catch(() => ({ ok: false }))
        ]);
        document.getElementById('statChannels').textContent = channelsRes.ok ? channelsRes.data.length : '-';
        document.getElementById('statSources').textContent = sourcesRes.ok ? sourcesRes.data.length : '-';
        document.getElementById('statUsers').textContent = usersRes.ok ? usersRes.data.length : '-';
        
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

    function openPlayer() {
      window.location.href = '/';
    }

