<template>
  <div class="shell">
    <!-- 侧边栏 -->
    <aside class="panel sidebar">
      <!-- 头部快捷入口 -->
      <section class="sidebar-head">
        <div class="sidebar-brand">
          <strong>BirdTV 播放器</strong>
          <span class="summary-hint">快捷入口</span>
        </div>
        <div class="sidebar-actions">
          <router-link to="/admin" class="button secondary sidebar-link-btn">进入后台管理</router-link>
          <router-link to="/mobile" class="button secondary sidebar-link-btn">手机端入口</router-link>
        </div>
      </section>

      <!-- 播放测试 -->
      <details class="card collapsible">
        <summary>
          <span class="summary-title">播放测试</span>
          <span class="summary-hint">默认收起，点击展开</span>
        </summary>
        <div class="grid collapsible-content">
          <label>频道名称
            <input v-model="testChannel.name" type="text" placeholder="例如：CCTV-1" />
          </label>
          <label>播放地址
            <input v-model="testChannel.url" type="text" placeholder="http://example.com/stream.m3u8" />
          </label>
          <div style="display:flex;gap:6px;">
            <label style="flex:1">KID
              <input v-model="testChannel.kid" type="text" placeholder="可选" />
            </label>
            <label style="flex:1">KEY
              <input v-model="testChannel.key" type="text" placeholder="可选" />
            </label>
          </div>
          <label>流类型
            <select v-model="testChannel.streamType">
              <option value="auto">自动检测</option>
              <option value="hls">HLS</option>
              <option value="mpd">DASH/MPD</option>
              <option value="ts">TS</option>
            </select>
          </label>
          <label>文本导入
            <textarea v-model="testChannel.importText" rows="5" placeholder="粘贴 #EXTINF / #KODIPROP 等格式文本"></textarea>
          </label>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="secondary" @click="importTestText">导入解析</button>
            <button class="secondary" @click="clearTest">清空</button>
            <button class="primary" @click="playTest">播放</button>
          </div>
        </div>
      </details>

      <!-- 节目源与EPG -->
      <details class="card collapsible">
        <summary>
          <span class="summary-title">节目源与EPG</span>
          <span class="summary-hint">默认收起，点击展开</span>
        </summary>
        <div class="grid collapsible-content">
          <div class="config-source-section">
            <h3 class="config-sub-title">节目源</h3>
            <select v-model="selectedM3uSource">
              <option value="">-- 请选择或手动输入 --</option>
              <option v-for="src in m3uSources" :key="src.id" :value="src.url">{{ src.name }}</option>
            </select>
            <input v-model="m3uUrl" type="text" placeholder="例如：http://127.0.0.1:8881/mytv.m3u" style="margin-top:6px;" />
          </div>

          <div class="config-source-section">
            <h3 class="config-sub-title">EPG 源</h3>
            <select v-model="selectedEpgSource">
              <option value="">-- 请选择或手动覆盖 --</option>
              <option v-for="src in epgSources" :key="src.id" :value="src.url">{{ src.name }}</option>
            </select>
            <input v-model="epgUrl" type="text" placeholder="例如：https://example.com/guide.xml" style="margin-top:6px;" />
          </div>

          <div class="button-row">
            <button class="secondary" @click="triggerM3uFileInput">上传节目文件</button>
            <button class="secondary" @click="loadM3uFromUrl">导入节目链接</button>
            <button class="secondary" @click="loadEpg">加载 EPG</button>
          </div>
          <input ref="m3uFileInputRef" type="file" accept=".m3u,.m3u8,text/plain" style="display:none;" @change="handleM3uFile" />
        </div>
      </details>

      <!-- 频道列表 -->
      <section class="card grid">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <h2 class="section-title" style="margin:0;">频道列表</h2>
          <span class="muted">{{ filteredChannels.length }} 个</span>
        </div>
        <label>
          搜索
          <input v-model="searchQuery" type="text" placeholder="输入频道名过滤" />
        </label>
        <div class="playlist">
          <div
            v-for="ch in filteredChannels"
            :key="ch.id"
            class="playlist-item"
            :class="{ active: currentChannel?.id === ch.id }"
            @click="playChannel(ch)"
          >
            <span class="ch-num">{{ ch.num || '' }}</span>
            <span class="ch-live"></span>
            <strong>{{ ch.name }}</strong>
            <span v-if="ch.codecRisk" class="codec-badge warn">{{ ch.codec || '' }}</span>
          </div>
          <div v-if="filteredChannels.length === 0" class="muted" style="padding:20px;text-align:center;">
            暂无频道，请先加载节目源
          </div>
        </div>
      </section>
    </aside>

    <!-- 主区域 -->
    <main class="panel main">
      <section class="panel stage">
        <div class="stage-head">
          <div>
            <h2 id="currentTitle">{{ currentChannel?.name || '未开始播放' }}</h2>
            <p class="stage-sub" id="playerTypeDesc">{{ playerTypeDesc }}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <router-link to="/admin" class="head-action-btn">后台管理</router-link>
            <button class="button secondary" @click="handleLogout" style="font-size: 12px; padding: 6px 12px;">退出登录</button>
            <router-link to="/mobile" class="button secondary" style="font-size: 12px; padding: 6px 12px; color: #c92222;">切换到移动版</router-link>
            <div class="status-badge">{{ playerStatus }}</div>
            <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:600;">
              播放器
              <select v-model="playerType" style="width:auto;min-width:124px;padding:6px 30px 6px 10px;font-size:12px;">
                <option value="auto">自动</option>
                <option value="shaka">Shaka</option>
                <option value="hls">Art(HLS)</option>
                <option value="mpegts">mpegts</option>
                <option value="native">原生</option>
              </select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:600;">
              代理模式
              <select v-model="proxyMode" style="width:auto;min-width:140px;padding:6px 30px 6px 10px;font-size:12px;">
                <option value="auto">自动（智能选择）</option>
                <option value="m3u-proxy">m3u-proxy（通用）</option>
                <option value="direct">本地直连（无代理）</option>
              </select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:600;">
              UA
              <select v-model="userAgent" style="width:auto;min-width:160px;padding:6px 30px 6px 10px;font-size:12px;">
                <option v-for="ua in uaPresets" :key="ua.value" :value="ua.value">{{ ua.name }}</option>
              </select>
            </label>
          </div>
        </div>
        <div class="video-shell" data-shaka-player-container>
          <video ref="videoRef" id="video" autoplay controls playsinline data-shaka-player></video>
          <div id="artplayer-container" style="position:absolute;inset:0;display:none;z-index:10;"></div>
        </div>
      </section>

      <!-- 信息区域 -->
      <section class="info-grid">
        <div class="info-item">
          <small>当前播放地址</small>
          <details class="mpd-fold">
            <summary></summary>
            <strong>{{ currentUrl || '无' }}</strong>
          </details>
        </div>
        <div class="info-item">
          <small>分辨率</small>
          <strong>{{ videoResolution || '未知' }}</strong>
        </div>
        <div class="info-item">
          <small>码率</small>
          <strong>{{ videoBitrate || '未知' }}</strong>
        </div>
        <div class="info-item">
          <small>缓冲状态</small>
          <strong>{{ bufferState }}</strong>
        </div>
      </section>

      <!-- EPG 节目单 -->
      <section class="info-grid">
        <div class="info-item epg-wide">
          <small>当前节目</small>
          <div class="epg-progress" v-if="epgProgram">
            <div class="epg-progress-bar" :style="{ width: epgProgress + '%' }"></div>
          </div>
          <div class="epg-now-title">{{ epgProgram?.title || '暂无节目信息' }}</div>
          <div class="epg-now-desc">{{ epgProgram?.desc || '' }}</div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import { getApiBaseUrl } from '@/router';

// 路由和状态
const router = useRouter();
const authStore = useAuthStore();

// DOM refs
const videoRef = ref(null);
const m3uFileInputRef = ref(null);

// 播放器状态
const playerStatus = ref('等待加载');
const playerTypeDesc = ref('DASH MPD · Clear Key DRM · Shaka Player');
const currentUrl = ref('');
const videoResolution = ref('');
const videoBitrate = ref('');
const bufferState = ref('无');

const playerType = ref('auto');
const proxyMode = ref('auto');
const userAgent = ref('');

// 频道数据
const channels = ref([]);
const searchQuery = ref('');
const currentChannel = ref(null);
const filteredChannels = computed(() => {
  if (!searchQuery.value) return channels.value;
  const q = searchQuery.value.toLowerCase();
  return channels.value.filter(ch => ch.name.toLowerCase().includes(q));
});

// 节目源
const m3uSources = ref([]);
const epgSources = ref([]);
const selectedM3uSource = ref('');
const selectedEpgSource = ref('');
const m3uUrl = ref('');
const epgUrl = ref('');

// 测试播放
const testChannel = ref({
  name: '',
  url: '',
  kid: '',
  key: '',
  streamType: 'auto',
  importText: ''
});

// EPG
const epgPrograms = ref({});
const epgProgram = computed(() => {
  if (!currentChannel.value?.epgId) return null;
  return epgPrograms.value[currentChannel.value.epgId];
});
const epgProgress = ref(0);

// UA 预设
const uaPresets = ref([
  { name: "默认 (okhttp)", value: "okhttp" },
  { name: "Chrome Desktop", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" }
]);

// 初始化
onMounted(async () => {
  // 获取 UA 预设
  if (window.BirdTVConstants?.UA_PRESETS) {
    uaPresets.value = window.BirdTVConstants.UA_PRESETS;
    userAgent.value = uaPresets.value[0]?.value || '';
  }

  // 加载频道数据
  await loadChannels();
  await loadSources();
});

// 加载频道
async function loadChannels() {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.get(`${baseUrl}/api/channels`);
    if (res.data?.ok && res.data.data) {
      channels.value = res.data.data;
    }
  } catch (e) {
    console.error('加载频道失败:', e);
  }
}

// 加载节目源和EPG源
async function loadSources() {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.get(`${baseUrl}/api/sources`);
    if (res.data?.ok && res.data.data) {
      m3uSources.value = res.data.data.filter(s => s.type === 'm3u');
      epgSources.value = res.data.data.filter(s => s.type === 'epg');
    }
  } catch (e) {
    console.error('加载源失败:', e);
  }
}

// 播放频道
async function playChannel(channel) {
  currentChannel.value = channel;
  playerStatus.value = '加载中...';
  
  try {
    // 获取播放地址（通过代理）
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/m3u-proxy?url=${encodeURIComponent(channel.url)}&ua=${encodeURIComponent(userAgent.value)}`;
    
    currentUrl.value = url;
    playerStatus.value = '播放中';
    
    // 设置视频源
    if (videoRef.value) {
      videoRef.value.src = url;
      videoRef.value.play().catch(e => {
        console.error('播放失败:', e);
        playerStatus.value = '播放失败';
      });
    }
  } catch (e) {
    console.error('播放错误:', e);
    playerStatus.value = '播放失败';
  }
}

// 测试播放
function playTest() {
  if (!testChannel.value.name || !testChannel.value.url) return;
  
  currentChannel.value = { id: 'test', name: testChannel.value.name, url: testChannel.value.url };
  playChannel(currentChannel.value);
}

// 导入测试文本
function importTestText() {
  const text = testChannel.value.importText;
  if (!text) return;
  
  // 简单解析 #EXTINF
  const match = text.match(/#EXTINF:[^,]+,(.+?)\n(.+)/);
  if (match) {
    testChannel.value.name = match[1];
    testChannel.value.url = match[2].trim();
  }
}

// 清空测试
function clearTest() {
  testChannel.value = { name: '', url: '', kid: '', key: '', streamType: 'auto', importText: '' };
}

// 触发文件上传
function triggerM3uFileInput() {
  m3uFileInputRef.value?.click();
}

// 处理M3U文件
async function handleM3uFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const text = await file.text();
  // 简单解析 m3u
  const lines = text.split('\n');
  channels.value = [];
  
  let currentChannel = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const nameMatch = trimmed.match(/,(.+)$/);
      currentChannel = { id: Date.now() + Math.random(), name: nameMatch?.[1] || '未知', url: '' };
    } else if (trimmed && !trimmed.startsWith('#') && currentChannel) {
      currentChannel.url = trimmed;
      channels.value.push(currentChannel);
      currentChannel = null;
    }
  }
}

// 从URL加载M3U
async function loadM3uFromUrl() {
  if (!m3uUrl.value) return;
  
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.get(`${baseUrl}/m3u-proxy?url=${encodeURIComponent(m3uUrl.value)}`);
    // 解析返回的 m3u 内容
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    // TODO: 实现完整的 m3u 解析
    console.log('M3U内容:', text);
  } catch (e) {
    console.error('加载M3U失败:', e);
  }
}

// 加载EPG
async function loadEpg() {
  if (!epgUrl.value) return;
  // TODO: 实现 EPG 加载
  console.log('加载EPG:', epgUrl.value);
}

// 退出登录
function handleLogout() {
  authStore.logout();
  router.push('/login');
}

// 清理
onUnmounted(() => {
  if (videoRef.value) {
    videoRef.value.pause();
    videoRef.value.src = '';
  }
});
</script>

<style scoped>
/* Player 特定样式 - 继承全局样式 */
.head-action-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  background: white;
  border: 1px solid #e1e5e9;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
}

.head-action-btn:hover {
  background: #f5f5f5;
  color: var(--text);
}
</style>
