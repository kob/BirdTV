<template>
  <div class="shell">
    <!-- 侧边栏 -->
    <aside class="panel sidebar">
      <!-- 头部快捷入口 -->
      <section class="sidebar-head">
        <div class="sidebar-brand">
          <strong>BirdTV 播放器</strong>
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
          <span class="summary-hint">点击展开</span>
        </summary>
        <div class="grid collapsible-content">
          <label>频道名称
            <input v-model="testChannel.name" type="text" placeholder="例如：CCTV-1" />
          </label>
          <label>播放地址
            <input v-model="testChannel.url" type="text" placeholder="http://example.com/stream.m3u8" />
          </label>
          <label>流类型
            <select v-model="testChannel.streamType">
              <option value="auto">自动检测</option>
              <option value="hls">HLS</option>
              <option value="mpd">DASH/MPD</option>
              <option value="ts">TS</option>
            </select>
          </label>
          <label>文本导入
            <textarea v-model="testChannel.importText" rows="4" placeholder="粘贴 #EXTINF 格式"></textarea>
          </label>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="secondary" @click="importTestText">解析</button>
            <button class="secondary" @click="clearTest">清空</button>
            <button class="primary" @click="playTest">播放</button>
          </div>
        </div>
      </details>

      <!-- 节目源与EPG -->
      <details class="card collapsible">
        <summary>
          <span class="summary-title">节目源与EPG</span>
          <span class="summary-hint">点击展开</span>
        </summary>
        <div class="grid collapsible-content">
          <div class="config-source-section">
            <h3 class="config-sub-title">节目源</h3>
            <select v-model="selectedM3uSource" @change="onM3uSourceChange">
              <option value="">-- 请选择 --</option>
              <option v-for="src in m3uSources" :key="src.id" :value="src.id">{{ src.name }}</option>
            </select>
          </div>

          <div class="config-source-section">
            <h3 class="config-sub-title">EPG 源</h3>
            <select v-model="selectedEpgSource" @change="onEpgSourceChange">
              <option value="">-- 请选择 --</option>
              <option v-for="src in epgSources" :key="src.id" :value="src.id">{{ src.name }}</option>
            </select>
          </div>

          <div class="button-row">
            <button class="secondary" @click="loadChannelsFromApi">从后端加载</button>
            <button class="secondary" @click="triggerM3uFile">上传文件</button>
          </div>
          <input ref="m3uFileRef" type="file" accept=".m3u,.m3u8,text/plain" style="display:none" @change="handleM3uFile" />
        </div>
      </details>

      <!-- 频道列表 -->
      <section class="card grid">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <h2 class="section-title" style="margin:0;">频道列表</h2>
          <span class="muted">{{ filteredChannels.length }} / {{ channels.length }}</span>
        </div>
        <label>
          <input v-model="searchQuery" type="text" placeholder="搜索频道..." />
        </label>
        <div class="playlist">
          <div
            v-for="(ch, idx) in filteredChannels"
            :key="ch.id || idx"
            class="playlist-item"
            :class="{ active: currentIndex === idx }"
            @click="selectChannel(ch, idx)"
          >
            <span class="ch-num">{{ ch.num || idx + 1 }}</span>
            <span class="ch-live"></span>
            <strong>{{ ch.name }}</strong>
            <span v-if="ch.codecHint === 'hevc-risk'" class="codec-badge warn">HEVC</span>
          </div>
          <div v-if="channels.length === 0" class="muted" style="padding:20px;text-align:center;">
            暂无频道，请从后端加载或上传节目文件
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
            <p class="stage-sub" id="playerTypeDesc">{{ playerDesc }}</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button class="button secondary" @click="handleLogout" style="font-size:12px;padding:6px 12px;">退出</button>
            <router-link to="/mobile" class="button secondary" style="font-size:12px;padding:6px 12px;">移动版</router-link>
            <div class="status-badge" :class="statusClass">{{ playerStatus }}</div>
            <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;">
              播放器
              <select v-model="preferredPlayer" style="min-width:100px;padding:4px 24px 4px 8px;font-size:12px;">
                <option value="auto">自动</option>
                <option value="shaka">Shaka</option>
                <option value="hls">HLS.js</option>
                <option value="native">原生</option>
              </select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;">
              UA
              <select v-model="selectedUa" style="min-width:120px;padding:4px 24px 4px 8px;font-size:12px;">
                <option v-for="ua in uaList" :key="ua.value" :value="ua.value">{{ ua.name }}</option>
              </select>
            </label>
          </div>
        </div>

        <div class="video-shell" ref="videoContainerRef">
          <video
            ref="videoRef"
            id="video"
            autoplay
            controls
            playsinline
            style="width:100%;height:100%;object-fit:contain;"
          ></video>
        </div>
      </section>

      <!-- 信息面板 -->
      <section class="info-grid">
        <div class="info-item">
          <small>播放地址</small>
          <details class="mpd-fold">
            <summary></summary>
            <strong class="mpd-url">{{ currentUrl || '无' }}</strong>
          </details>
        </div>
        <div class="info-item">
          <small>分辨率</small>
          <strong>{{ videoResolution }}</strong>
        </div>
        <div class="info-item">
          <small>码率</small>
          <strong>{{ videoBitrate }}</strong>
        </div>
        <div class="info-item">
          <small>缓冲</small>
          <strong>{{ bufferStatus }}</strong>
        </div>
      </section>

      <!-- EPG 节目单 -->
      <section class="info-grid" v-if="currentEpgProgram">
        <div class="info-item epg-wide">
          <small>当前节目</small>
          <div class="epg-progress">
            <div class="epg-progress-bar" :style="{ width: epgProgress + '%' }"></div>
          </div>
          <div class="epg-now-title">{{ currentEpgProgram.title }}</div>
          <div class="epg-now-desc">{{ currentEpgProgram.desc }}</div>
        </div>
      </section>

      <!-- 诊断面板 -->
      <details class="diag-panel">
        <summary class="diag-head">
          <strong>诊断日志</strong>
          <span class="diag-count">{{ diagnosticEvents.length }} 条</span>
          <div class="diag-actions">
            <button class="secondary" @click="clearDiagnostics">清空</button>
          </div>
        </summary>
        <div class="diag-list">
          <div
            v-for="(evt, idx) in diagnosticEvents.slice(-20)"
            :key="idx"
            class="diag-item"
            :class="{ 'is-warn': evt.level === 'warn', 'is-error': evt.level === 'error' }"
          >
            <span class="diag-time">{{ evt.time }}</span>
            <span class="diag-text">{{ evt.message }}</span>
          </div>
        </div>
      </details>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import { getApiBaseUrl } from '@/router';

// ─── 常量 ───
const STORAGE_KEY = 'tvplayer.channels.v1';
const M3U_CONFIGS_KEY = 'tvplayer.m3uConfigs.v1';
const EPG_CONFIGS_KEY = 'tvplayer.epgConfigs.v1';
const GLOBAL_UA_KEY = 'tvplayer.globalUserAgent.v1';
const HEVC_PATTERN = /(?:^|[\s_.\-|()\[\]])(hevc|h\.?265|x265)(?:$|[\s_.\-|()\[\]])/i;
const UHD_PATTERN = /(4k|uhd|2160p)/i;

// ─── 路由与状态 ───
const router = useRouter();
const authStore = useAuthStore();

// ─── DOM refs ───
const videoRef = ref(null);
const videoContainerRef = ref(null);
const m3uFileRef = ref(null);

// ─── 播放器状态 ───
const playerStatus = ref('空闲');
const playerDesc = ref('等待播放');
const currentUrl = ref('');
const videoResolution = ref('未知');
const videoBitrate = ref('未知');
const bufferStatus = ref('无');
const preferredPlayer = ref('auto');
const currentPlayerType = ref(null);

// ─── 频道数据 ───
const channels = ref([]);
const currentIndex = ref(-1);
const currentChannel = computed(() => channels.value[currentIndex.value] || null);
const searchQuery = ref('');

const filteredChannels = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return channels.value;
  return channels.value.filter(ch => ch.name.toLowerCase().includes(q));
});

// ─── 节目源 ───
const m3uSources = ref([]);
const epgSources = ref([]);
const selectedM3uSource = ref('');
const selectedEpgSource = ref('');

// ─── 测试播放 ───
const testChannel = ref({
  name: '',
  url: '',
  streamType: 'auto',
  importText: ''
});

// ─── UA ───
const uaList = ref([
  { name: '默认 (okhttp)', value: 'okhttp' },
  { name: 'Chrome Desktop', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
  { name: 'Safari iOS', value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Safari/604.1' },
]);

const selectedUa = ref(uaList.value[0]?.value || '');

// ─── EPG ───
const epgPrograms = ref({});
const currentEpgProgram = ref(null);
const epgProgress = ref(0);

// ─── 诊断 ───
const diagnosticEvents = ref([]);

const statusClass = computed(() => {
  if (playerStatus.value.includes('失败') || playerStatus.value.includes('错误')) return 'status-error';
  if (playerStatus.value.includes('播放')) return 'status-playing';
  return '';
});

// ─── 初始化 ───
onMounted(async () => {
  addDiag('lifecycle', 'info', 'Player.vue 初始化');

  // 加载保存的频道
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) channels.value = JSON.parse(saved);
    addDiag('init', 'info', `从本地加载 ${channels.value.length} 个频道`);
  } catch (e) {
    addDiag('init', 'warn', '读取本地频道失败');
  }

  // 加载源配置
  try {
    const m3uSaved = localStorage.getItem(M3U_CONFIGS_KEY);
    if (m3uSaved) m3uSources.value = JSON.parse(m3uSaved);
    const epgSaved = localStorage.getItem(EPG_CONFIGS_KEY);
    if (epgSaved) epgSources.value = JSON.parse(epgSaved);
  } catch (e) {}

  // 加载 UA
  const savedUa = localStorage.getItem(GLOBAL_UA_KEY);
  if (savedUa) selectedUa.value = savedUa;

  // 从后端加载频道
  await loadChannelsFromApi();

  // 初始化视频事件
  initVideoEvents();

  // 启动定时更新
  startStatsLoop();
});

// ─── 视频事件 ───
function initVideoEvents() {
  const video = videoRef.value;
  if (!video) return;

  video.addEventListener('loadedmetadata', () => {
    videoResolution.value = `${video.videoWidth}x${video.videoHeight}`;
    addDiag('video', 'info', `元数据加载: ${videoResolution.value}`);
  });

  video.addEventListener('progress', () => {
    if (video.buffered.length > 0) {
      const buffered = video.buffered.end(video.buffered.length - 1);
      bufferStatus.value = `${Math.round(buffered - video.currentTime)}s`;
    }
  });

  video.addEventListener('error', (e) => {
    playerStatus.value = '播放失败';
    addDiag('video', 'error', `视频错误: ${video.error?.message || '未知错误'}`);
    addDiag('video', 'error', `错误码: ${video.error?.code}`);
  });

  video.addEventListener('waiting', () => {
    playerStatus.value = '缓冲中...';
  });

  video.addEventListener('playing', () => {
    playerStatus.value = '播放中';
    playerDesc.value = getPlayerDesc();
  });

  video.addEventListener('pause', () => {
    if (playerStatus.value !== '播放失败') {
      playerStatus.value = '已暂停';
    }
  });
}

// ─── 播放控制 ───
async function selectChannel(channel, index) {
  currentIndex.value = index;
  await playChannel(channel);
}

async function playChannel(channel) {
  if (!channel?.url) {
    addDiag('play', 'warn', '频道无播放地址');
    return;
  }

  addDiag('play', 'info', `播放: ${channel.name}`);
  playerStatus.value = '加载中...';
  currentUrl.value = channel.url;

  const video = videoRef.value;
  if (!video) return;

  try {
    // 根据 URL 类型选择播放方式
    const url = channel.url;
    const streamType = detectStreamType(url);

    if (streamType === 'mpd' || (preferredPlayer.value === 'shaka' && window.shaka)) {
      await playWithShaka(url, channel);
    } else if (streamType === 'hls' || url.includes('.m3u')) {
      await playWithHls(url);
    } else if (streamType === 'ts' || url.includes('.ts')) {
      await playDirect(url);
    } else {
      // 自动检测
      if (url.includes('.mpd')) {
        await playWithShaka(url, channel);
      } else if (url.includes('.m3u')) {
        await playWithHls(url);
      } else {
        await playDirect(url);
      }
    }

    playerStatus.value = '播放中';
    currentPlayerType.value = detectPlayerType();
    playerDesc.value = getPlayerDesc();
  } catch (e) {
    playerStatus.value = '播放失败';
    addDiag('play', 'error', `播放错误: ${e.message}`);
  }
}

async function playWithShaka(url, channel) {
  if (!window.shaka) {
    addDiag('shaka', 'warn', 'Shaka Player 未加载，尝试其他方式');
    return playDirect(url);
  }

  addDiag('shaka', 'info', '使用 Shaka Player 播放');

  try {
    const player = new window.shaka.Player();
    await player.attach(videoRef.value);
    await player.load(url);
  } catch (e) {
    addDiag('shaka', 'error', `Shaka 错误: ${e.message}`);
    throw e;
  }
}

async function playWithHls(url) {
  if (window.Hls && videoRef.value) {
    addDiag('hls', 'info', '使用 HLS.js 播放');
    const hls = new window.Hls();
    hls.loadSource(url);
    hls.attachMedia(videoRef.value);
    hls.on(window.Hls.Events.ERROR, (e, data) => {
      addDiag('hls', 'error', `HLS 错误: ${data.details}`);
    });
  } else {
    addDiag('hls', 'warn', 'HLS.js 未加载，使用原生播放');
    await playDirect(url);
  }
}

async function playDirect(url) {
  addDiag('native', 'info', '使用原生播放器');
  videoRef.value.src = url;
  try {
    await videoRef.value.play();
  } catch (e) {
    if (e.name !== 'AbortError') {
      addDiag('native', 'error', `播放错误: ${e.message}`);
      throw e;
    }
  }
}

function detectStreamType(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.mpd') || lower.includes('format=mpd')) return 'mpd';
  if (lower.includes('.m3u') || lower.includes('format=hls')) return 'hls';
  if (lower.includes('.ts') || lower.includes('/udp/') || lower.includes('/rtp/')) return 'ts';
  return 'unknown';
}

function detectPlayerType() {
  if (videoRef.value?._shakaPlayer) return 'Shaka';
  if (window.Hls?.isSupported?.()) return 'HLS.js';
  return '原生';
}

function getPlayerDesc() {
  const type = detectStreamType(currentUrl.value);
  const player = detectPlayerType();
  return `${type.toUpperCase()} · ${player}`;
}

// ─── 测试播放 ───
function playTest() {
  if (!testChannel.value.name || !testChannel.value.url) {
    addDiag('test', 'warn', '请填写频道名和地址');
    return;
  }

  const ch = {
    id: 'test-' + Date.now(),
    name: testChannel.value.name,
    url: testChannel.value.url,
    streamType: testChannel.value.streamType
  };

  channels.value = [ch];
  currentIndex.value = 0;
  playChannel(ch);
}

function importTestText() {
  const text = testChannel.value.importText.trim();
  if (!text) return;

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.lastIndexOf(',');
      testChannel.value.name = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '未知';
    } else if (trimmed && !trimmed.startsWith('#') && (trimmed.startsWith('http') || trimmed.startsWith('/'))) {
      testChannel.value.url = trimmed;
      break;
    }
  }
  addDiag('test', 'info', `解析: ${testChannel.value.name}`);
}

function clearTest() {
  testChannel.value = { name: '', url: '', streamType: 'auto', importText: '' };
}

// ─── 频道加载 ───
async function loadChannelsFromApi() {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.get(`${baseUrl}/api/channels`, { timeout: 10000 });
    if (res.data?.ok && Array.isArray(res.data.data)) {
      channels.value = res.data.data.map((ch, idx) => ({
        id: ch.id || idx,
        name: ch.name || ch.channelName || `频道${idx + 1}`,
        url: ch.url || ch.streamUrl || '',
        num: ch.num || idx + 1,
        codecHint: HEVC_PATTERN.test(ch.name || '') ? 'hevc-risk' : null,
        tvgId: ch.tvgId || '',
        epg: ch.epg || ''
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(channels.value));
      addDiag('api', 'info', `从后端加载 ${channels.value.length} 个频道`);
    }
  } catch (e) {
    addDiag('api', 'error', `加载频道失败: ${e.message}`);
  }
}

function triggerM3uFile() {
  m3uFileRef.value?.click();
}

async function handleM3uFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = parseM3U(text);
    channels.value = parsed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels.value));
    addDiag('m3u', 'info', `解析 M3U 文件: ${parsed.length} 个频道`);
  } catch (e) {
    addDiag('m3u', 'error', `M3U 解析失败: ${e.message}`);
  }
}

function parseM3U(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  let pendingName = '';
  let pendingTvgId = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.lastIndexOf(',');
      pendingName = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '';
      const tvgMatch = trimmed.match(/tvg-id="([^"]*)"/);
      pendingTvgId = tvgMatch?.[1] || '';
    } else if (trimmed && !trimmed.startsWith('#')) {
      result.push({
        id: Date.now() + result.length,
        name: pendingName || `频道${result.length + 1}`,
        url: trimmed,
        num: result.length + 1,
        tvgId: pendingTvgId
      });
    }
  }
  return result;
}

async function onM3uSourceChange() {
  const source = m3uSources.value.find(s => s.id === selectedM3uSource.value);
  if (source?.url) {
    addDiag('source', 'info', `加载节目源: ${source.name}`);
    // TODO: 加载 M3U URL
  }
}

async function onEpgSourceChange() {
  const source = epgSources.value.find(s => s.id === selectedEpgSource.value);
  if (source?.url) {
    addDiag('epg', 'info', `加载 EPG: ${source.name}`);
    // TODO: 加载 EPG URL
  }
}

// ─── 定时更新 ───
let statsInterval = null;

function startStatsLoop() {
  statsInterval = setInterval(() => {
    updateStats();
  }, 2000);
}

function updateStats() {
  const video = videoRef.value;
  if (!video || !video.videoWidth) return;

  videoResolution.value = `${video.videoWidth}x${video.videoHeight}`;
  if (video.webkitVideoDecodedByteCount) {
    const bitrate = Math.round(video.webkitVideoDecodedByteCount * 8 / 1000);
    videoBitrate.value = bitrate > 1000 ? `${(bitrate / 1000).toFixed(1)} Mbps` : `${bitrate} kbps`;
  }
}

// ─── 诊断 ───
function addDiag(type, level, message) {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  diagnosticEvents.value.push({ type, level, message, time });
  if (diagnosticEvents.value.length > 100) {
    diagnosticEvents.value = diagnosticEvents.value.slice(-100);
  }
}

function clearDiagnostics() {
  diagnosticEvents.value = [];
}

// ─── 登出 ───
function handleLogout() {
  authStore.logout();
  router.push('/login');
}

// ─── 清理 ───
onUnmounted(() => {
  if (statsInterval) clearInterval(statsInterval);
  if (videoRef.value) {
    videoRef.value.pause();
    videoRef.value.src = '';
  }
});

// ─── 保存 UA ───
watch(selectedUa, (val) => {
  localStorage.setItem(GLOBAL_UA_KEY, val);
});
</script>

<style scoped>
.status-error {
  color: var(--danger);
}
.status-playing {
  color: var(--success);
}
</style>
