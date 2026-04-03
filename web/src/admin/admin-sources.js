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
