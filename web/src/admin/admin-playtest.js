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
        const res = await api('/channels?limit=99999');
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
      api('/channels?limit=99999').then(res => {
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
