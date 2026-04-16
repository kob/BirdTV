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
            <button class="btn btn-sm btn-danger" onclick='confirmDeleteUser(${JSON.stringify(u.username)}, ${JSON.stringify(u.id)})'>删除</button>
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
        <div class="form-group"><label>用户名 *</label><input id="newUsername" autocomplete="off"></div>
        <div class="form-group"><label>密码 *</label><input id="newPassword" type="password" autocomplete="new-password"></div>
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

