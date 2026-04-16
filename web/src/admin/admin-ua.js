    // ========== UA 管理 ==========
    const UA_PRESETS = [
      { name: "默认 (okhttp)", value: "okhttp" },
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
        const channelsRes = await api('/channels?limit=99999');
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

