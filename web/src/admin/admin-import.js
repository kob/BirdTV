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
      const UA_PRESETS = [
        { name: "默认 (okhttp)", value: "okhttp" },
        { name: "VLC for Android", value: "VLC/3.6.7 (Android; 12; Mobile) LibVLC/3.6.7" },
        { name: "IPTV Smarters", value: "IPTV Smarters Pro/4.2" },
        { name: "Chrome Mobile", value: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36" },
        { name: "curl", value: "curl/8.4.0" }
      ];
      showModal('导入频道', `
        <div style="padding:16px 0;">
          <div class="form-group">
            <label>选择 M3U 文件 *</label>
            <input type="file" id="manualM3uFile" accept=".m3u,.m3u8" style="padding:8px;border:1px solid var(--border);border-radius:6px;width:100%;">
            <p style="font-size:12px;color:var(--muted);margin-top:6px;">支持 .m3u 和 .m3u8 格式的播放列表文件</p>
          </div>
          <div class="form-row">
            <div class="form-group"><label>默认分组</label><input type="text" id="manualImportGroup" placeholder="未分组" style="width:100%;"></div>
            <div class="form-group"><label>代理模式</label><select id="manualImportProxyMode" style="width:100%;"><option value="">保持原始</option><option value="auto">自动</option><option value="proxy">代理</option><option value="direct">直连</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>播放器</label><select id="manualImportPlayer" style="width:100%;"><option value="">保持原始</option><option value="auto">自动</option><option value="shaka">Shaka</option><option value="artplayer">ArtPlayer</option><option value="hlsjs">HLS.js</option></select></div>
            <div class="form-group"><label>User Agent</label><select id="manualImportUA" style="width:100%;"><option value="">保持原始</option>${UA_PRESETS.map(ua => `<option value="${esc(ua.value)}">${esc(ua.name)}</option>`).join('')}</select></div>
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
              <input type="checkbox" checked data-idx="${i}" data-name="${esc(c.name || '')}" data-url="${esc(c.url || '')}" data-group="${esc(c.group || '')}" data-tvgid="${esc(c.tvgId || '')}" data-tvglogo="${esc(c.tvgLogo || '')}" data-streamtype="${esc(c.streamType || '')}" data-playertype="${esc(c.playerType || '')}" data-drm='${JSON.stringify(c.drm || {})}' data-useragent="${esc(c.userAgent || '')}" style="margin-right:12px;">
              <div style="flex:1;">
                <div style="font-weight:600;">${esc(c.name || '未命名')}</div>
                <div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">${esc(c.url || '')}</div>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-left:12px;">${esc(c.group || '未分组')}</div>
            </div>
          `).join('');
          
          previewDiv.style.display = 'block';
          
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
      if (checkboxes.length === 0) { toast('请选择要导入的频道', 'error'); return; }

      const importGroup = (document.getElementById('manualImportGroup')?.value || '').trim();
      const importProxy = document.getElementById('manualImportProxyMode')?.value || '';
      const importPlayer = document.getElementById('manualImportPlayer')?.value || '';
      const importUA = document.getElementById('manualImportUA')?.value || '';

      const listDiv = document.getElementById('manualFileChannelList');
      const allItems = listDiv.querySelectorAll('.manual-channel-item');
      const channelsToImport = [];
      
      allItems.forEach((item) => {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && cb.checked) {
          let channelUrl = cb.dataset.url || '';
          if (importProxy === 'proxy' || importProxy === 'auto') channelUrl = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent(cb.dataset.url || '')}`;
          const channel = {
            name: cb.dataset.name || '',
            url: channelUrl,
            group: importGroup || cb.dataset.group || '未分组',
            streamType: cb.dataset.streamtype || 'auto'
          };
          if (importProxy) channel.proxyMode = importProxy;
          if (cb.dataset.tvgid) channel.tvgId = cb.dataset.tvgid;
          if (cb.dataset.tvglogo) channel.tvgLogo = cb.dataset.tvglogo;
          if (cb.dataset.playertype) channel.playerType = cb.dataset.playertype;
          if (cb.dataset.useragent) channel.userAgent = cb.dataset.useragent;
          if (cb.dataset.drm) { try { const d = JSON.parse(cb.dataset.drm); if (d && Object.keys(d).length > 0) channel.drm = d; } catch (e) {} }
          if (importPlayer) channel.playerType = importPlayer;
          if (importUA) channel.userAgent = importUA;
          channelsToImport.push(channel);
        }
      });
      
      if (channelsToImport.length === 0) { toast('请选择要导入的频道', 'error'); return; }
      
      try {
        const res = await api('/channels/batch', { method: 'POST', body: JSON.stringify({ channels: channelsToImport }) });
        if (res && res.ok) {
          const d = res.data || {};
          const parts = [];
          if (d.created) parts.push('新增 ' + d.created + ' 个');
          if (d.updated) parts.push('更新 ' + d.updated + ' 个');
          toast(parts.length ? '导入完成：' + parts.join('，') : ('成功导入 ' + channelsToImport.length + ' 个频道'), 'success');
          closeModal(); loadChannels();
        } else { toast('导入失败', 'error'); }
      } catch (err) { console.error('导入失败:', err); toast('导入失败', 'error'); }
    }

    async function submitManualSingleImport() {
      const name = document.getElementById('manualSingleName')?.value?.trim();
      const url = document.getElementById('manualSingleUrl')?.value?.trim();
      const group = document.getElementById('manualSingleGroup')?.value?.trim();
      const logo = document.getElementById('manualSingleLogo')?.value?.trim();
      if (!name || !url) { toast('请填写频道名称和播放地址', 'error'); return; }
      
      try {
        const res = await api('/channels', { method: 'POST', body: JSON.stringify({ name, url, group: group || '未分组', logo: logo || '', streamType: 'live' }) });
        if (res && res.ok) { toast('添加成功', 'success'); closeModal(); loadChannels(); } else { toast('添加失败', 'error'); }
      } catch (err) { console.error('添加失败:', err); toast('添加失败', 'error'); }
    }

    async function importChannelsFromSource(defaultSourceId) {
      if (defaultSourceId) {
        // 从节目源列表直接导入：获取源信息，直接拉取频道，只需设置代理模式和默认播放器
        try {
          const sourceRes = await api('/sources/m3u/' + defaultSourceId);
          if (!sourceRes || !sourceRes.ok || !sourceRes.data) { toast('获取节目源信息失败', 'error'); return; }
          const source = sourceRes.data;
          if (!source.url) { toast('节目源没有配置M3U链接', 'error'); return; }

          // 用节目源的UA和默认播放器预填充
          const proxyMode = source.proxyMode || 'auto';
          const defaultPlayerType = source.defaultPlayerType || 'auto';
          const sourceUserAgent = source.userAgent || '';

          showModal('从节目源导入频道 - ' + esc(source.name), `
            <div id="importFormArea">
            <div class="form-group"><label>代理模式</label><select id="sourceProxyMode" style="width:100%;">
              <option value="auto" ${proxyMode === 'auto' ? 'selected' : ''}>自动</option>
              <option value="proxy" ${proxyMode === 'proxy' ? 'selected' : ''}>代理</option>
              <option value="direct" ${proxyMode === 'direct' ? 'selected' : ''}>直连</option>
            </select></div>
            <div class="form-group"><label>默认播放器</label><select id="sourcePlayerType" style="width:100%;">
              <option value="auto" ${defaultPlayerType === 'auto' ? 'selected' : ''}>自动</option>
              <option value="vlc-proxy" ${defaultPlayerType === 'vlc-proxy' ? 'selected' : ''}>VLC代理</option>
              <option value="vlc-direct" ${defaultPlayerType === 'vlc-direct' ? 'selected' : ''}>VLC直连</option>
              <option value="shaka" ${defaultPlayerType === 'shaka' ? 'selected' : ''}>Shaka</option>
              <option value="hls" ${defaultPlayerType === 'hls' ? 'selected' : ''}>HLS</option>
              <option value="mpegts" ${defaultPlayerType === 'mpegts' ? 'selected' : ''}>MPEG-TS</option>
              <option value="native" ${defaultPlayerType === 'native' ? 'selected' : ''}>Native</option>
            </select></div>
            <input type="hidden" id="importSourceId" value="${defaultSourceId}">
            <input type="hidden" id="importSourceUserAgent" value="${esc(sourceUserAgent)}">
            <div id="channelListContainer" style="margin-top:16px;max-height:400px;overflow-y:auto;display:none;"><h4 style="margin-bottom:12px;">频道列表</h4><div id="channelListContent"></div></div>
            </div>
            <div id="importProgressArea" style="display:none;text-align:center;padding:24px 0;">
              <div class="import-progress-icon running"><div class="spinner"></div></div>
              <h3 id="importProgressTitle" style="margin-bottom:4px;">正在导入...</h3>
              <p id="importProgressSub" style="font-size:13px;color:var(--muted);margin-bottom:16px;"></p>
              <div class="import-progress-bar-track"><div class="import-progress-bar-fill" id="importProgressBar"></div></div>
              <div id="importProgressSteps" style="text-align:left;margin-top:20px;padding:0 20px;"></div>
            </div>
          `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" id="importBtn" onclick="doImportChannels()" style="display:none;">导入选中</button>`);

          // 自动加载频道
          loadSourceChannels();
        } catch (e) { toast('加载节目源失败', 'error'); }
      } else {
        // 从导入菜单进入：需要选择节目源
        try {
          const sourcesRes = await api('/sources/m3u');
          if (!sourcesRes || !sourcesRes.ok || !sourcesRes.data || !sourcesRes.data.length) { toast('暂无节目源，请先添加节目源', 'error'); return; }
          const sources = sourcesRes.data;
          let sourceOptions = sources.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

          showModal('从节目源导入频道', `
            <div id="importFormArea">
            <div class="form-group"><label>选择节目源 *</label><select id="importSourceSelect"><option value="">-- 请选择节目源 --</option>${sourceOptions}</select></div>
            <div class="form-group"><label>代理模式</label><select id="sourceProxyMode" style="width:100%;"><option value="auto">自动</option><option value="proxy">代理</option><option value="direct">直连</option></select></div>
            <input type="hidden" id="importSourceId" value="">
            <input type="hidden" id="importSourceUserAgent" value="">
            <div id="channelListContainer" style="margin-top:16px;max-height:400px;overflow-y:auto;display:none;"><h4 style="margin-bottom:12px;">频道列表</h4><div id="channelListContent"></div></div>
            </div>
            <div id="importProgressArea" style="display:none;text-align:center;padding:24px 0;">
              <div class="import-progress-icon running"><div class="spinner"></div></div>
              <h3 id="importProgressTitle" style="margin-bottom:4px;">正在导入...</h3>
              <p id="importProgressSub" style="font-size:13px;color:var(--muted);margin-bottom:16px;"></p>
              <div class="import-progress-bar-track"><div class="import-progress-bar-fill" id="importProgressBar"></div></div>
              <div id="importProgressSteps" style="text-align:left;margin-top:20px;padding:0 20px;"></div>
            </div>
          `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn" id="loadChannelsBtn" onclick="loadSourceChannels()">加载频道</button><button class="btn btn-primary" id="importBtn" onclick="doImportChannels()" style="display:none;">导入选中</button>`);

          document.getElementById('importSourceSelect').addEventListener('change', function() {
            document.getElementById('loadChannelsBtn').style.display = this.value ? 'inline-flex' : 'none';
            document.getElementById('importBtn').style.display = 'none';
            document.getElementById('channelListContainer').style.display = 'none';
          });
        } catch (e) { toast('加载节目源失败', 'error'); }
      }
    }

    function importChannelsFromFile() {
      showModal('从文件导入频道', `
        <div class="form-group"><label>选择M3U文件 *</label><input type="file" id="m3uFile" accept=".m3u,.m3u8" style="padding:8px 0;"><p style="font-size:12px;color:var(--muted);margin-top:4px;">支持 .m3u 和 .m3u8 格式</p></div>
        <div class="form-group"><label>代理模式</label><select id="fileProxyMode" style="width:100%;"><option value="auto">自动</option><option value="proxy">代理</option><option value="direct">直连</option></select></div>
        <div id="fileChannelListContainer" style="margin-top:16px;max-height:400px;overflow-y:auto;display:none;"><h4 style="margin-bottom:12px;">频道列表</h4><div id="fileChannelListContent"></div></div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn" id="loadFileChannelsBtn" onclick="loadFileChannels()">解析文件</button><button class="btn btn-primary" id="importFileBtn" onclick="doImportFileChannels()" style="display:none;">导入选中</button>`);
    }

    async function loadFileChannels() {
      const fileInput = document.getElementById('m3uFile');
      const file = fileInput.files[0];
      if (!file) { toast('请选择M3U文件', 'error'); return; }

      try {
        const loadingToast = document.createElement('div');
        loadingToast.className = 'toast toast-info'; loadingToast.textContent = '正在解析文件...';
        document.getElementById('toastContainer').appendChild(loadingToast);

        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/sources/m3u/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: formData });
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
                  <div><div><b>${esc(c.name)}</b></div>${c.tvgId ? `<div style="font-size:11px;color:var(--muted);">TVG ID: ${esc(c.tvgId)}</div>` : ''}</div>
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

          const selectAllButton = document.createElement('div');
          selectAllButton.style.cssText = 'display:flex;align-items:center;padding:8px 0;border-bottom:1px solid rgba(146,187,255,0.1);margin-bottom:8px;';
          selectAllButton.innerHTML = `<input type="checkbox" id="selectAllFileChannels" style="margin-right:12px;"><div style="font-weight:bold;">全选</div>`;
          channelListContent.insertBefore(selectAllButton, channelListContent.firstChild);
          document.getElementById('selectAllFileChannels').addEventListener('change', function() {
            document.querySelectorAll('.import-file-channel-checkbox').forEach(cb => { cb.checked = this.checked; });
          });

          document.getElementById('fileChannelListContainer').style.display = 'block';
          document.getElementById('importFileBtn').style.display = 'inline-flex';
        } else {
          toast(result.message || '解析文件失败', 'error');
        }
      } catch (e) { console.error('解析文件失败:', e); toast('解析文件失败: ' + (e.message || '未知错误'), 'error'); }
    }

    async function doImportFileChannels() {
      const checkboxes = document.querySelectorAll('.import-file-channel-checkbox:checked');
      if (checkboxes.length === 0) { toast('请选择要导入的频道', 'error'); return; }
      const proxyMode = document.getElementById('fileProxyMode').value;

      const channelsToImport = Array.from(checkboxes).map(cb => {
        let channelUrl = cb.dataset.url;
        if (proxyMode === 'proxy' || proxyMode === 'auto') channelUrl = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent(cb.dataset.url)}`;
        const channel = { name: cb.dataset.name, url: channelUrl, group: cb.dataset.group || '', tvgId: cb.dataset.tvgid || '', tvgLogo: cb.dataset.tvglogo || '', streamType: cb.dataset.streamtype || 'auto', playerType: cb.dataset.playertype || 'auto', userAgent: cb.dataset.useragent || '', proxyMode };
        if (cb.dataset.drm) { try { const d = JSON.parse(cb.dataset.drm); if (d && Object.keys(d).length > 0) channel.drm = d; } catch (e) {} }
        if (channel.playerType === 'shaka' && !channel.drm) { try { const ck = JSON.parse(cb.dataset.clearkeys || '{}'); if (Object.keys(ck).length > 0) channel.drm = { clearKeys: ck }; } catch (e) {} }
        return channel;
      });

      try {
        const res = await api('/channels/batch', { method: 'POST', body: JSON.stringify({ channels: channelsToImport }) });
        if (res && res.ok) {
          const d = res.data || {}; const parts = [];
          if (d.created) parts.push('新增 ' + d.created + ' 个'); if (d.updated) parts.push('更新 ' + d.updated + ' 个');
          toast(parts.length ? '导入完成：' + parts.join('，') : ('成功导入 ' + channelsToImport.length + ' 个频道'), 'success');
          closeModal(); loadChannels();
        } else { toast('导入失败', 'error'); }
      } catch (e) { toast('导入失败', 'error'); }
    }

    async function loadSourceChannels() {
      // 兼容：优先从隐藏字段取sourceId，其次从下拉框取
      const sourceId = document.getElementById('importSourceId')?.value || document.getElementById('importSourceSelect')?.value;
      if (!sourceId) return;
      const container = document.getElementById('channelListContainer');
      container.style.display = 'block';
      document.getElementById('channelListContent').innerHTML = '<div style="text-align:center;padding:32px 0;"><div class="spinner"></div><p style="margin-top:12px;color:var(--muted);">正在拉取节目源并解析频道列表，请稍候...</p></div>';
      try {
        const sourceRes = await api('/sources/m3u/' + sourceId);
        if (!sourceRes || !sourceRes.ok || !sourceRes.data) { container.innerHTML = '<p style="color:var(--error);text-align:center;padding:16px;">获取节目源信息失败</p>'; return; }
        const m3uUrl = sourceRes.data.url;
        const sourceUserAgent = sourceRes.data.userAgent || '';
        if (!m3uUrl) { container.innerHTML = '<p style="color:var(--error);text-align:center;padding:16px;">节目源没有配置M3U链接</p>'; return; }

        const parseBody = { url: m3uUrl };
        if (sourceUserAgent) parseBody.userAgent = sourceUserAgent;
        const res = await api('/sources/m3u/parse', { method: 'POST', body: JSON.stringify(parseBody) });
        if (!res || !res.ok || !res.data || !res.data.length) { container.innerHTML = '<p style="color:var(--error);text-align:center;padding:16px;">该节目源暂无频道</p>'; return; }

        const channels = res.data;
        const channelListContent = document.getElementById('channelListContent');
        channelListContent.innerHTML = channels.map(c => `
          <div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid rgba(146, 187, 255, 0.1);">
            <input type="checkbox" class="import-channel-checkbox" value="${c.id}" data-name="${esc(c.name)}" data-url="${esc(c.url)}" data-group="${esc(c.group || '')}" data-clearKeys='${JSON.stringify(c.drm && c.drm.clearKeys ? c.drm.clearKeys : {})}' data-tvgid="${esc(c.tvgId || '')}" data-tvglogo="${esc(c.tvgLogo || '')}" data-streamtype="${esc(c.streamType || '')}" data-playertype="${esc(c.playerType || '')}" data-drm='${JSON.stringify(c.drm || {})}' data-useragent="${esc(c.userAgent || '')}">
            <div style="margin-left:12px;flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${c.tvgLogo ? `<img src="${esc(c.tvgLogo)}" style="width:32px;height:32px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">` : ''}
                <div><div><b>${esc(c.name)}</b></div>${c.tvgId ? `<div style="font-size:11px;color:var(--muted);">TVG ID: ${esc(c.tvgId)}</div>` : ''}</div>
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

        const selectAllButton = document.createElement('div');
        selectAllButton.style.cssText = 'display:flex;align-items:center;padding:8px 0;border-bottom:1px solid rgba(146,187,255,0.1);margin-bottom:8px;';
        selectAllButton.innerHTML = `<input type="checkbox" id="selectAllImportChannels" style="margin-right:12px;"><div style="font-weight:bold;">全选</div>`;
        channelListContent.insertBefore(selectAllButton, channelListContent.firstChild);
        document.getElementById('selectAllImportChannels').addEventListener('change', function() {
          document.querySelectorAll('.import-channel-checkbox').forEach(cb => { cb.checked = this.checked; });
        });

        document.getElementById('channelListContainer').style.display = 'block';
        document.getElementById('importBtn').style.display = 'inline-flex';
      } catch (e) { container.innerHTML = '<p style="color:var(--error);text-align:center;padding:16px;">加载频道失败: ' + esc(e.message || '网络异常') + '</p>'; }
    }

    async function doImportChannels() {
      const checkboxes = document.querySelectorAll('.import-channel-checkbox:checked');
      if (checkboxes.length === 0) { toast('请选择要导入的频道', 'error'); return; }

      const totalCount = checkboxes.length;
      const sourceId = document.getElementById('importSourceId')?.value || document.getElementById('importSourceSelect')?.value;
      const proxyMode = document.getElementById('sourceProxyMode').value;
      let sourcePlayerType = document.getElementById('sourcePlayerType')?.value || 'auto';

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
        <div class="import-progress-step active" id="importStep1"><span class="step-dot"></span>组装频道数据</div>
        <div class="import-progress-step" id="importStep2"><span class="step-dot"></span>提交到服务器</div>
        <div class="import-progress-step" id="importStep3"><span class="step-dot"></span>完成</div>
      `;
      const footer = document.getElementById('modalFooter');
      if (footer) footer.style.display = 'none';

      function setStep(stepNum) {
        for (let i = 1; i <= 3; i++) {
          const el = document.getElementById('importStep' + i);
          if (el) { el.classList.remove('active', 'completed'); if (i < stepNum) el.classList.add('completed'); else if (i === stepNum) el.classList.add('active'); }
        }
        if (progressBar) progressBar.style.width = Math.round((stepNum - 1) / 2 * 100) + '%';
      }

      setStep(1);
      const channelsToImport = Array.from(checkboxes).map(cb => {
        let channelUrl = cb.dataset.url;
        if (proxyMode === 'proxy' || proxyMode === 'auto') channelUrl = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent(cb.dataset.url)}`;
        const channel = { name: cb.dataset.name, url: channelUrl, group: cb.dataset.group || '', tvgId: cb.dataset.tvgid || '', tvgLogo: cb.dataset.tvglogo || '', proxyMode, playerType: cb.dataset.playertype || sourcePlayerType, streamType: cb.dataset.streamtype || 'auto', userAgent: cb.dataset.useragent || '', sourceId };
        if (cb.dataset.drm) { try { const d = JSON.parse(cb.dataset.drm); if (d && Object.keys(d).length > 0) channel.drm = d; } catch (e) {} }
        if (channel.playerType === 'shaka' && !channel.drm) { try { const ck = JSON.parse(cb.dataset.clearkeys || '{}'); if (Object.keys(ck).length > 0) channel.drm = { clearKeys: ck }; } catch (e) {} }
        return channel;
      });

      if (progressSub) progressSub.textContent = '共 ' + totalCount + ' 个频道待导入 · 数据已就绪';
      setStep(2);
      try {
        const res = await api('/channels/batch', { method: 'POST', body: JSON.stringify({ channels: channelsToImport }) });
        if (res && res.ok) {
          setStep(3); if (progressBar) progressBar.style.width = '100%'; if (progressTitle) progressTitle.textContent = '导入完成';
          const d = res.data || {}; const parts = [];
          if (d.created) parts.push('新增 ' + d.created + ' 个'); if (d.updated) parts.push('更新 ' + d.updated + ' 个');
          if (progressSub) progressSub.textContent = parts.length ? parts.join('，') : ('成功导入 ' + totalCount + ' 个频道');
          const icon = progressArea?.querySelector('.import-progress-icon'); if (icon) { icon.className = 'import-progress-icon done'; icon.innerHTML = '&#10003;'; }
          setTimeout(() => { closeModal(); loadChannels(); }, 1500);
        } else {
          if (progressTitle) progressTitle.textContent = '导入失败'; if (progressSub) progressSub.textContent = res ? res.message : '服务器返回错误';
          const icon = progressArea?.querySelector('.import-progress-icon'); if (icon) { icon.className = 'import-progress-icon fail'; icon.innerHTML = '&#10007;'; }
          if (footer) { footer.style.display = 'flex'; footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>'; }
        }
      } catch (e) {
        if (progressTitle) progressTitle.textContent = '导入失败'; if (progressSub) progressSub.textContent = '网络请求异常，请检查连接';
        const icon = progressArea?.querySelector('.import-progress-icon'); if (icon) { icon.className = 'import-progress-icon fail'; icon.innerHTML = '&#10007;'; }
        if (footer) { footer.style.display = 'flex'; footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>'; }
      }
    }

    let currentExportChannelIds = [];

    async function batchExportChannels() {
      if (selectedChannelIds.size === 0) { toast('请选择要导出的频道', 'error'); return; }
      currentExportChannelIds = Array.from(selectedChannelIds);
      showModal('批量导出设置', `
        <div class="form-group"><label>选中频道数</label><input type="text" value="${currentExportChannelIds.length} 个频道" disabled></div>
        <div class="form-group"><label>文件名 *</label><input type="text" id="exportFilename" placeholder="例如：我的频道" style="font-size:14px;"><p style="font-size:12px;color:var(--muted);margin-top:4px;">文件将保存为 .m3u 格式，同名文件将被覆盖</p></div>
        <div class="form-group"><label>导出简介</label><textarea id="exportDescription" rows="3" placeholder="请输入本次导出的说明，例如：家庭用户频道列表"></textarea></div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchExport()">开始导出</button>`);
    }

    async function doBatchExport() {
      try {
        const channelIds = currentExportChannelIds;
        const count = channelIds.length;
        let filename = (document.getElementById('exportFilename').value || '').trim();
        const description = document.getElementById('exportDescription').value || '';
        if (!filename) { toast('请输入文件名', 'error'); return; }
        filename = filename.replace(/[/\\:*?"<>|]/g, '_');
        showBatchProgressModal('批量导出', ['准备导出数据', '生成导出文件', '完成']);
        updateBatchProgress(1, 3, '正在导出...', '共 ' + count + ' 个频道');
        const res = await api('/exports/export', { method: 'POST', body: JSON.stringify({ channelIds, filename, description }) });
        if (res && res.ok) {
          const data = res.data;
          setBatchProgressDone('导出完成', `文件 ${data.filename}（${(data.fileSize / 1024).toFixed(2)}KB）`, false);
          const footer = document.getElementById('modalFooter');
          if (footer) { footer.style.display = 'flex'; footer.innerHTML = '<button class="btn" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeModal();loadChannels();switchPage(\'links\')">前往用户订阅管理</button>'; }
        } else { setBatchProgressFail('导出失败', res ? res.message : '服务器返回错误'); }
      } catch (e) { console.error('批量导出失败:', e); setBatchProgressFail('导出失败', '网络请求异常'); }
    }

    async function batchEditChannels() {
      if (selectedChannelIds.size === 0) { toast('请选择要修改的频道', 'error'); return; }
      try {
        const res = await api('/channels/groups');
        let groups = []; if (res && res.ok && Array.isArray(res.data)) groups = res.data;
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
          <div class="form-row"><div class="form-group"><label>分组</label><select id="batchGroup"><option value="">保持不变</option>${allGroups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}<option value="未分组">未分组</option></select></div></div>
          <div class="form-group"><label>User Agent</label><select id="batchUserAgent"><option value="">保持不变</option>${UA_PRESETS.map(ua => `<option value="${esc(ua.value)}">${esc(ua.name)}</option>`).join('')}</select></div>
        `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchEdit()">确定修改</button>`);
      } catch (e) { console.error('加载分组失败:', e); toast('加载分组失败', 'error'); }
    }

    async function doBatchEdit() {
      const channelIds = Array.from(selectedChannelIds);
      const count = channelIds.length;
      const proxyMode = document.getElementById('batchProxyMode').value;
      const playerType = document.getElementById('batchPlayer').value;
      const group = document.getElementById('batchGroup').value;
      const userAgent = document.getElementById('batchUserAgent').value.trim();
      if (!proxyMode && !playerType && !group && !userAgent) { toast('未做任何修改', 'error'); return; }

      showBatchProgressModal('批量修改', ['组装修改数据', '提交到服务器', '完成']);
      updateBatchProgress(1, 3, '正在修改...', '共 ' + count + ' 个频道');
      try {
        updateBatchProgress(2, 3, '正在修改...', '提交修改请求中');
        const updateData = { ids: channelIds, data: { ...(proxyMode ? { proxyMode } : {}), ...(playerType ? { playerType } : {}), ...(group ? { group } : {}), ...(userAgent ? { userAgent } : {}) } };
        const res = await api('/channels/batch/update', { method: 'POST', body: JSON.stringify(updateData) });
        if (res && res.ok) { setBatchProgressDone('修改完成', '成功修改 ' + count + ' 个频道', true); } else { setBatchProgressFail('修改失败', res ? res.message : '服务器返回错误'); }
      } catch (e) { console.error('批量修改频道失败:', e); setBatchProgressFail('修改失败', '网络请求异常'); }
    }

    // ========== 导出管理 ==========
    async function loadExports() {
      const tbody = document.getElementById('exportTableBody');
      const empty = document.getElementById('exportEmpty');
      const loading = document.getElementById('exportLoading');
      const resultCount = document.getElementById('exportResultCount');
      loading.style.display = 'block'; empty.style.display = 'none';
      try {
        const res = await api('/exports/list');
        if (res && res.ok) {
          const exports = res.data; resultCount.textContent = `${exports.length} 条`;
          if (exports.length === 0) { empty.style.display = 'block'; tbody.innerHTML = ''; }
          else {
            tbody.innerHTML = exports.map(exp => `<tr><td><b>${exp.filename}</b></td><td>${exp.userId || 'admin'}</td><td>${new Date(exp.createdAt).toLocaleString()}</td><td>${exp.description || '无'}</td><td>${(exp.fileSize / 1024).toFixed(2)}KB</td><td class="btn-group"><button class="btn btn-sm" onclick="showExportDetails('${exp.id}')">详情</button><button class="btn btn-sm" onclick="showCreateLinkModal('${exp.id}')">创建订阅</button><button class="btn btn-sm btn-danger" onclick="deleteExport('${exp.id}')">删除</button></td></tr>`).join('');
          }
        } else { empty.style.display = 'block'; resultCount.textContent = '0 条'; }
      } catch (e) { empty.style.display = 'block'; resultCount.textContent = '0 条'; } finally { loading.style.display = 'none'; }
    }

    // ========== 用户订阅管理 ==========
    function copySubLink(subLink, username) {
      navigator.clipboard.writeText(subLink);
      showModal('订阅地址已复制', `
        <div style="text-align:center;padding:12px 0;">
          <div style="font-size:40px;margin-bottom:12px;">✅</div>
          <p style="font-size:15px;font-weight:500;margin-bottom:16px;">${esc(username || '未指定')} 的订阅地址已复制到剪贴板</p>
          <div class="form-group" style="text-align:left;"><label>订阅地址</label><input type="text" value="${subLink}" readonly style="cursor:pointer;font-size:13px;" onclick="this.select();navigator.clipboard.writeText(this.value)"></div>
        </div>
      `, `<button class="btn btn-primary" onclick="closeModal()">关闭</button>`);
    }
    async function loadLinks() {
      const tbody = document.getElementById('linkTableBody');
      const empty = document.getElementById('linkEmpty');
      const loading = document.getElementById('linkLoading');
      const resultCount = document.getElementById('linkResultCount');
      loading.style.display = 'block'; empty.style.display = 'none';
      try {
        const res = await api('/exports/links');
        if (res && res.ok) {
          const links = res.data; resultCount.textContent = `${links.length} 条`;
          if (links.length === 0) { empty.style.display = 'block'; tbody.innerHTML = ''; }
          else {
            tbody.innerHTML = links.map(link => {
              const now = new Date(); const expiresAt = new Date(link.expiresAt);
              const isExpired = now > expiresAt; const isLimitReached = link.downloadCount >= link.maxDownloads;
              let status = '有效', statusClass = 'tag-success';
              if (isExpired) { status = '已过期'; statusClass = 'tag-error'; } else if (isLimitReached) { status = '已达上限'; statusClass = 'tag-warning'; }
              const subLink = `${location.origin}/link/${link.shortCode}`;
              return `<tr><td><span style="display:inline-flex;align-items:center;gap:6px;background:#e8f4f8;border:1px solid #3b9ecf;border-radius:8px;padding:6px 14px;cursor:pointer;transition:all .15s;" onclick="copySubLink('${subLink}','${esc(link.username)}')" onmouseover="this.style.background='#d0ecf5'" onmouseout="this.style.background='#e8f4f8'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2a8ab5" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span style="font-size:14px;color:#1a7a9e;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">${link.username || '未指定'}</span></span></td><td>${link.username || '未指定'}</td><td>${link.filename}</td><td>${new Date(link.createdAt).toLocaleString()}</td><td>${new Date(link.expiresAt).toLocaleString()}</td><td>${link.downloadCount}/${link.maxDownloads === 0 ? '不限' : link.maxDownloads}</td><td><span class="tag ${statusClass}">${status}</span></td><td class="btn-group"><button class="btn btn-sm" onclick="showLinkDetails('${link.id}')">详情</button><button class="btn btn-sm" onclick="showUpdateLinkModal('${link.id}')">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteLink('${link.id}')">删除</button></td></tr>`;
            }).join('');
          }
        } else { empty.style.display = 'block'; resultCount.textContent = '0 条'; }
      } catch (e) { empty.style.display = 'block'; resultCount.textContent = '0 条'; } finally { loading.style.display = 'none'; }
    }

    async function showCreateLinkModal(exportId = null) {
      let exportOptions = '';
      try { const res = await api('/exports/list'); if (res && res.ok && res.data.length > 0) exportOptions = res.data.map(exp => `<option value="${exp.id}" ${exportId === exp.id ? 'selected' : ''}>${exp.filename} (${exp.description || '无'})</option>`).join(''); } catch (e) {}
      let userOptions = '<option value="">-- 请选择用户 --</option>';
      try { const res = await api('/auth/users'); if (res && res.ok && Array.isArray(res.data)) userOptions += res.data.map(u => `<option value="${esc(u.username)}">${esc(u.username)} (${esc(u.role || 'user')})</option>`).join(''); } catch (e) {}
      showModal('创建订阅', `
        <div class="form-group"><label>选择导出文件 *</label><select id="linkExportId"><option value="">-- 请选择导出文件 --</option>${exportOptions}</select></div>
        <div class="form-group"><label>关联用户 *</label><select id="linkUsername">${userOptions}</select></div>
        <div class="form-group"><label>订阅简介</label><textarea id="linkDescription" rows="2" placeholder="例如：家庭用户订阅"></textarea></div>
        <div class="form-row"><div class="form-group"><label>有效期 (小时)</label><input type="number" id="linkExpiresIn" value="720" min="1" max="8760"></div><div class="form-group"><label>最大访问次数</label><input type="number" id="linkMaxDownloads" value="9999" min="0" max="99999"><p style="font-size:12px;color:var(--muted);margin-top:2px;">0 表示不限制</p></div></div>
        <div class="form-group"><label><input type="checkbox" id="linkIpBinding"> IP绑定 (仅允许当前IP访问)</label></div>
      `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="createLink()">创建订阅</button>`);
    }

    async function createLink() {
      try {
        const exportId = document.getElementById('linkExportId').value;
        const username = document.getElementById('linkUsername').value;
        const description = document.getElementById('linkDescription').value;
        const expiresIn = parseInt(document.getElementById('linkExpiresIn').value) || 720;
        const maxDownloads = parseInt(document.getElementById('linkMaxDownloads').value) || 0;
        const ipBinding = document.getElementById('linkIpBinding').checked;
        if (!exportId) { toast('请选择导出文件', 'error'); return; }
        if (!username) { toast('请选择关联用户', 'error'); return; }
        closeModal();
        const loadingToast = document.createElement('div'); loadingToast.className = 'toast toast-info'; loadingToast.textContent = '正在创建订阅...'; document.getElementById('toastContainer').appendChild(loadingToast);
        const res = await api('/exports/link', { method: 'POST', body: JSON.stringify({ exportId, username, description, expiresIn, maxDownloads, ipBinding }) });
        loadingToast.remove();
        if (res && res.ok) {
          const data = res.data; const subLink = `${location.origin}/link/${data.shortCode}`;
          showModal('订阅创建成功', `
            <div style="margin-bottom:16px;"><p><b>订阅链接:</b> <a href="${subLink}" target="_blank">${subLink}</a></p><p><b>用户名:</b> ${data.username || '未指定'}</p><p><b>有效期:</b> ${data.expiresAt}</p><p><b>最大访问:</b> ${data.maxDownloads === 0 ? '不限' : data.maxDownloads + '次'}</p></div>
            <div class="form-group"><label>订阅地址 (复制到 IPTV 客户端)</label><input type="text" value="${subLink}" readonly style="cursor:pointer;" onclick="this.select();navigator.clipboard.writeText(this.value);toast('已复制','success')"><p style="font-size:12px;color:var(--muted);margin-top:4px;">点击输入框可复制订阅地址</p></div>
          `, `<button class="btn" onclick="closeModal()">关闭</button>`);
          toast('订阅创建成功', 'success'); loadLinks();
        } else { toast(res ? res.message : '创建订阅失败', 'error'); }
      } catch (e) { console.error('创建订阅失败:', e); toast('创建订阅失败: ' + (e.message || '未知错误'), 'error'); }
    }

    async function showLinkDetails(id) {
      try {
        const res = await api('/exports/links');
        if (res && res.ok) { const link = res.data.find(e => e.id === id); if (link) {
          const subLink = `${location.origin}/link/${link.shortCode}`;
          showModal('订阅详情', `<div style="margin-bottom:16px;"><p><b>订阅链接:</b> <a href="${subLink}" target="_blank">${subLink}</a></p><p><b>用户名:</b> ${link.username || '未指定'}</p><p><b>导出文件:</b> ${link.filename}</p><p><b>生成时间:</b> ${new Date(link.createdAt).toLocaleString()}</p><p><b>过期时间:</b> ${new Date(link.expiresAt).toLocaleString()}</p><p><b>访问次数:</b> ${link.downloadCount}/${link.maxDownloads === 0 ? '不限' : link.maxDownloads}</p><p><b>简介:</b> ${link.description || '无'}</p></div><div class="form-group"><label>订阅地址</label><input type="text" value="${subLink}" readonly style="cursor:pointer;" onclick="this.select();navigator.clipboard.writeText(this.value);toast('已复制','success')"></div>`, `<button class="btn" onclick="closeModal()">关闭</button>`);
        }}
      } catch (e) { toast('获取详情失败', 'error'); }
    }

    async function deleteLink(id) {
      if (!confirm('确定要删除该订阅吗？')) return;
      try { const res = await api('/exports/link/' + id, { method: 'DELETE' }); if (res && res.ok) { toast('删除成功', 'success'); loadLinks(); } else { toast('删除失败', 'error'); } } catch (e) { toast('删除失败', 'error'); }
    }

    async function showUpdateLinkModal(linkId) {
      try {
        const res = await api('/exports/links'); if (!res || !res.ok) { toast('获取订阅信息失败', 'error'); return; }
        const link = res.data.find(l => l.id === linkId); if (!link) { toast('订阅不存在', 'error'); return; }
        const remainingHours = Math.max(1, Math.ceil((new Date(link.expiresAt) - new Date()) / (1000 * 60 * 60)));
        let exportOptions = '';
        try { const res = await api('/exports/list'); if (res && res.ok && res.data.length > 0) exportOptions = res.data.map(exp => `<option value="${exp.id}" ${link.exportId === exp.id ? 'selected' : ''}>${exp.filename} (${exp.description || '无'})</option>`).join(''); } catch (e) {}
        showModal('编辑订阅', `
          <input type="hidden" id="updateLinkId" value="${linkId}">
          <div class="form-group"><label>关联导出文件</label><select id="updateLinkExportId"><option value="">-- 请选择 --</option>${exportOptions}</select></div>
          <div class="form-group"><label>描述</label><textarea id="updateLinkDescription" placeholder="请输入描述">${esc(link.description || '')}</textarea></div>
          <div class="form-group"><label>有效期（小时）</label><input type="number" id="updateLinkExpiresIn" value="${remainingHours}" min="1" max="8760"></div>
          <div class="form-group"><label>最大访问次数</label><input type="number" id="updateLinkMaxDownloads" value="${link.maxDownloads}" min="0" max="99999"><p style="font-size:12px;color:var(--muted);margin-top:2px;">0 表示不限制</p></div>
          <div class="form-group"><label>IP绑定</label><select id="updateLinkIpBinding"><option value="false" ${!link.ipBinding ? 'selected' : ''}>不绑定</option><option value="true" ${link.ipBinding ? 'selected' : ''}>绑定当前IP</option></select></div>
        `, `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="updateLink()">保存</button>`);
      } catch (e) { toast('加载失败', 'error'); }
    }

    async function updateLink() {
      const linkId = document.getElementById('updateLinkId').value;
      const exportId = document.getElementById('updateLinkExportId').value;
      const description = document.getElementById('updateLinkDescription').value;
      const expiresIn = document.getElementById('updateLinkExpiresIn').value;
      const maxDownloads = document.getElementById('updateLinkMaxDownloads').value;
      const ipBinding = document.getElementById('updateLinkIpBinding').value === 'true';
      try {
        const res = await api('/exports/link/' + linkId, { method: 'PUT', body: JSON.stringify({ exportId, description, expiresIn, maxDownloads, ipBinding }) });
        if (res && res.ok) { toast('订阅已更新', 'success'); closeModal(); loadLinks(); } else { toast('更新失败', 'error'); }
      } catch (e) { toast('更新失败', 'error'); }
    }

    async function showExportDetails(id) {
      try {
        const res = await api('/exports/list');
        if (res && res.ok) { const exp = res.data.find(e => e.id === id); if (exp) {
          const token = btoa(JSON.stringify({ exportId: exp.id, filename: exp.filename, exp: new Date(exp.expiresAt).getTime(), sig: 'dummy' }));
          const downloadUrl = `${location.origin}/api/exports/download?file=${exp.filename}&token=${token}`;
          showModal('导出详情', `
            <div style="margin-bottom:16px;"><p><b>文件名:</b> ${exp.filename}</p><p><b>导出人:</b> ${exp.userId || 'admin'}</p><p><b>生成时间:</b> ${new Date(exp.createdAt).toLocaleString()}</p><p><b>过期时间:</b> ${new Date(exp.expiresAt).toLocaleString()}</p><p><b>下载次数:</b> ${exp.downloadCount}/${exp.maxDownloads}</p><p><b>文件大小:</b> ${(exp.fileSize / 1024).toFixed(2)}KB</p></div>
            <div class="form-group"><label>下载链接</label><input type="text" value="${downloadUrl}" readonly style="cursor:pointer;" onclick="this.select()"><p style="font-size:12px;color:var(--muted);margin-top:4px;">点击链接可复制</p></div>
          `, `<button class="btn" onclick="closeModal()">关闭</button><a href="${downloadUrl}" class="btn btn-primary" download>下载</a>`);
        }}
      } catch (e) { toast('获取详情失败', 'error'); }
    }

    async function deleteExport(id) {
      if (!confirm('确定要删除该导出记录吗？')) return;
      try { const res = await api('/exports/' + id, { method: 'DELETE' }); if (res && res.ok) { toast('删除成功', 'success'); loadExports(); } else { toast('删除失败', 'error'); } } catch (e) { toast('删除失败', 'error'); }
    }

    async function cleanupExpiredExports() {
      if (!confirm('确定要清理过期的导出记录吗？')) return;
      try { const res = await api('/exports/cleanup', { method: 'POST' }); if (res && res.ok) { toast('清理成功', 'success'); loadExports(); } else { toast('清理失败', 'error'); } } catch (e) { toast('清理失败', 'error'); }
    }
