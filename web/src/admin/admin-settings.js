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

