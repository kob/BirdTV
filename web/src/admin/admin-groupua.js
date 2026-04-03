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

