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
          if (s.m3uRemoteBaseUrl !== undefined) document.getElementById('settingRemoteBaseUrl').value = s.m3uRemoteBaseUrl;
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
          m3uProxyAuth: document.getElementById('settingM3uProxyAuth').value === 'true',
          m3uRemoteBaseUrl: (document.getElementById('settingRemoteBaseUrl').value || '').trim().replace(/\/+$/, '')
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

    // ========== 数据同步 ==========
    
    async function loadSyncInfo() {
      try {
        const res = await api('/settings/sync/info');
        if (res && res.ok) {
          const data = res.data;
          document.getElementById('redisPrefix').textContent = data.redisPrefix || '未知';
          document.getElementById('serverId').textContent = data.serverId || '未知';
        }
      } catch (e) {
        document.getElementById('redisPrefix').textContent = '未知';
        document.getElementById('serverId').textContent = '未知';
      }
    }

    async function syncToRedis() {
      let btn, originalText;
      try {
        btn = event.target.closest('button');
        originalText = btn.innerHTML;
        btn.innerHTML = '<span style="font-size:14px;">⏳</span> 同步中...';
        btn.disabled = true;

        const res = await api('/settings/sync/redis', { method: 'POST' });

        if (res && res.ok) {
          toast(res.message || '同步成功', 'success');
          console.log('[Sync] 同步结果:', res.data);
        } else {
          toast('同步失败：' + (res?.message || '未知错误'), 'error');
        }
      } catch (error) {
        console.error('[Sync] 同步异常:', error);
        toast('同步失败：' + error.message, 'error');
      } finally {
        if (btn) {
          btn.innerHTML = '<span style="font-size:14px;">📤</span> 同步到 Redis';
          btn.disabled = false;
        }
      }
    }

    async function syncFromFile() {
      let btn, originalText;
      try {
        btn = event.target.closest('button');
        originalText = btn.innerHTML;
        btn.innerHTML = '<span style="font-size:14px;">⏳</span> 同步中...';
        btn.disabled = true;

        const res = await api('/settings/sync/file', { method: 'POST' });

        if (res && res.ok) {
          toast(res.message || '同步成功', 'success');
          console.log('[Sync] 同步结果:', res.data);
          if (res.data.results) {
            const results = res.data.results.map(r => 
              r.success ? `${r.key} ✅` : `${r.key} ❌ ${r.reason}`
            ).join(', ');
            console.log('[Sync] 详细结果:', results);
          }
        } else {
          toast('同步失败：' + (res?.message || '未知错误'), 'error');
        }
      } catch (error) {
        console.error('[Sync] 同步异常:', error);
        toast('同步失败：' + error.message, 'error');
      } finally {
        if (btn) {
          btn.innerHTML = '<span style="font-size:14px;">📥</span> 从 Redis 同步到文件';
          btn.disabled = false;
        }
      }
    }

    // 页面加载时显示同步信息
    document.addEventListener('DOMContentLoaded', () => {
      loadSyncInfo();
    });

