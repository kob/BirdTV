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
            <input v-model="customEpgUrl" type="text" placeholder="自定义 EPG URL" style="margin-top:8px;" />
            <button class="secondary" @click="loadCustomEpg" style="margin-top:4px;width:100%;">加载自定义EPG</button>
          </div>

          <div class="button-row">
            <button class="secondary" @click="loadChannelsFromApi">从后端加载</button>
            <button class="secondary" @click="triggerM3uFile">上传文件</button>
          </div>
          <input ref="m3uFileRef" type="file" accept=".m3u,.m3u8,text/plain" style="display:none" @change="handleM3uFile" />
        </div>
      </details>

      <!-- 频道分组 -->
      <details class="card collapsible">
        <summary>
          <span class="summary-title">频道分组</span>
          <span class="summary-hint">{{ channelGroups.length }} 个分组</span>
        </summary>
        <div class="grid collapsible-content">
          <div class="button-row" style="flex-wrap:wrap;">
            <button class="secondary" :class="{ active: currentGroup === '' }" @click="currentGroup = ''">全部</button>
            <button v-for="group in channelGroups" :key="group" class="secondary" :class="{ active: currentGroup === group }" @click="currentGroup = group">{{ group }}</button>
          </div>
        </div>
      </details>

      <!-- 频道列表 -->
      <section class="card grid">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <h2 class="section-title" style="margin:0;">频道列表</h2>
          <span class="muted">{{ filteredChannels.length }} / {{ channels.length }}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <input v-model="searchQuery" type="text" placeholder="搜索频道..." style="flex:1;" />
          <button class="secondary" @click="toggleFavorites" :title="showFavoritesOnly ? '显示全部' : '只看收藏'">
            {{ showFavoritesOnly ? '★' : '☆' }}
          </button>
        </div>
        <div class="playlist">
          <div
            v-for="(ch, idx) in filteredChannels"
            :key="ch.id || idx"
            class="playlist-item"
            :class="{ active: currentIndex === idx, favorited: ch.favorite }"
            @click="selectChannel(ch, idx)"
            @contextmenu.prevent="toggleFavorite(ch)"
          >
            <span class="ch-num">{{ ch.num || idx + 1 }}</span>
            <span v-if="ch.favorite" class="ch-live" style="color:#f59e0b;">★</span>
            <span v-else class="ch-live"></span>
            <strong>{{ ch.name }}</strong>
            <span v-if="ch.codecHint === 'hevc-risk'" class="codec-badge warn">HEVC</span>
            <span v-if="ch.groupName" class="codec-badge" style="background:var(--primary);">{{ ch.groupName }}</span>
          </div>
          <div v-if="channels.length === 0" class="muted" style="padding:20px;text-align:center;">
            暂无频道，请从后端加载或上传节目文件
          </div>
        </div>
      </section>

      <!-- 快捷键提示 -->
      <div class="shortcuts-hint">
        <small>快捷键: ←/→切台 | 空格暂停 | F全屏 | P画中画 | M静音</small>
      </div>
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

        <!-- 播放控制栏 -->
        <div class="player-controls-bar">
          <button class="ctrl-btn" @click="prevChannel" title="上一个频道 (←)">◀◀</button>
          <button class="ctrl-btn" @click="togglePlay" :title="isPlaying ? '暂停 (空格)' : '播放 (空格)'">
            {{ isPlaying ? '⏸' : '▶' }}
          </button>
          <button class="ctrl-btn" @click="nextChannel" title="下一个频道 (→)">▶▶</button>
          <button class="ctrl-btn" @click="toggleMute" :title="isMuted ? '取消静音 (M)' : '静音 (M)'">
            {{ isMuted ? '🔇' : '🔊' }}
          </button>
          <span class="ctrl-volume" v-if="!isMuted">{{ volume }}%</span>
          <input type="range" class="ctrl-volume-slider" v-model="volume" min="0" max="100" @input="setVolume" />
          <div style="flex:1;"></div>
          <button class="ctrl-btn" @click="togglePip" title="画中画 (P)">📺</button>
          <button class="ctrl-btn" @click="toggleFullscreen" title="全屏 (F)">{{ isFullscreen ? '⛶' : '⛶' }}</button>
          <button class="ctrl-btn" @click="toggleFavorite(currentChannel)" title="收藏" :style="{ color: currentChannel?.favorite ? '#f59e0b' : '' }">
            {{ currentChannel?.favorite ? '★' : '☆' }}
          </button>
        </div>
      </section>

      <!-- EPG 节目单 -->
      <section class="info-grid" v-if="currentEpgProgram || epgPrograms.length > 0">
        <div class="info-item epg-wide">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <small>当前节目</small>
            <button class="secondary" @click="showEpgModal = true" style="font-size:11px;padding:2px 8px;">节目单</button>
          </div>
          <div class="epg-progress" v-if="currentEpgProgram">
            <div class="epg-progress-bar" :style="{ width: epgProgress + '%' }"></div>
          </div>
          <div class="epg-now-title" v-if="currentEpgProgram">{{ currentEpgProgram.title }}</div>
          <div class="epg-now-time" v-if="currentEpgProgram">
            {{ formatEpgTime(currentEpgProgram.start) }} - {{ formatEpgTime(currentEpgProgram.end) }}
          </div>
          <div class="epg-now-desc" v-if="currentEpgProgram">{{ currentEpgProgram.desc }}</div>
        </div>
        <div class="info-item" v-if="nextEpgProgram">
          <small>下一个节目</small>
          <strong>{{ nextEpgProgram.title }}</strong>
          <small class="muted">{{ formatEpgTime(nextEpgProgram.start) }}</small>
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
        <div class="info-item">
          <small>已播放</small>
          <strong>{{ playTime }}</strong>
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

    <!-- EPG 弹窗 -->
    <Teleport to="body">
      <div v-if="showEpgModal" class="epg-modal-overlay" @click.self="showEpgModal = false">
        <div class="epg-modal">
          <div class="epg-modal-header">
            <h3>节目单 · {{ currentChannel?.name || '未知频道' }}</h3>
            <button class="secondary" @click="showEpgModal = false">关闭</button>
          </div>
          <div class="epg-modal-content">
            <div v-if="epgPrograms.length === 0" class="muted" style="padding:40px;text-align:center;">
              暂无节目信息
            </div>
            <div v-for="program in epgPrograms" :key="program.start" class="epg-program-item" :class="{ current: isCurrentProgram(program) }">
              <div class="epg-program-time">
                {{ formatEpgTime(program.start) }} - {{ formatEpgTime(program.end) }}
              </div>
              <div class="epg-program-title">{{ program.title }}</div>
              <div class="epg-program-desc">{{ program.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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
const FAVORITES_KEY = 'tvplayer.favorites.v1';
const HISTORY_KEY = 'tvplayer.history.v1';
const HEVC_PATTERN = /(?:^|[\s_.\-|()\[\]])(hevc|h\.?265|x265)(?:$|[\s_.\-|()\[\]])/i;
const UHD_PATTERN = /(4k|uhd|2160p)/i;
const EPG_CACHE_TTL = 60 * 60 * 1000; // 1小时

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
const isPlaying = ref(false);
const isMuted = ref(false);
const volume = ref(100);
const playTime = ref('00:00:00');
const isFullscreen = ref(false);
const showFavoritesOnly = ref(false);
const showEpgModal = ref(false);

// ─── 频道数据 ───
const channels = ref([]);
const currentIndex = ref(-1);
const currentChannel = computed(() => channels.value[currentIndex.value] || null);
const searchQuery = ref('');
const currentGroup = ref('');

// ─── 频道分组 ───
const channelGroups = computed(() => {
  const groups = new Set();
  channels.value.forEach(ch => {
    if (ch.groupName) groups.add(ch.groupName);
  });
  return Array.from(groups).sort();
});

const filteredChannels = computed(() => {
  let list = channels.value;
  
  // 过滤分组
  if (currentGroup.value) {
    list = list.filter(ch => ch.groupName === currentGroup.value);
  }
  
  // 过滤搜索
  const q = searchQuery.value.toLowerCase().trim();
  if (q) {
    list = list.filter(ch => ch.name.toLowerCase().includes(q));
  }
  
  // 过滤收藏
  if (showFavoritesOnly.value) {
    list = list.filter(ch => ch.favorite);
  }
  
  return list;
});

// ─── 节目源 ───
const m3uSources = ref([]);
const epgSources = ref([]);
const selectedM3uSource = ref('');
const selectedEpgSource = ref('');
const customEpgUrl = ref('');
const epgUrl = ref('');
const epgLoadedAt = ref(0);
const epgProgramsByChannelId = ref(new Map());
const epgNameToChannelId = ref(new Map());

// ─── EPG 节目列表 ───
const epgPrograms = computed(() => {
  if (!currentChannel.value) return [];
  const channelId = resolveEpgChannelId(currentChannel.value);
  if (!channelId) return [];
  return epgProgramsByChannelId.value.get(channelId) || [];
});

const currentEpgProgram = computed(() => {
  const programs = epgPrograms.value;
  if (!programs.length) return null;
  const now = Date.now();
  for (const program of programs) {
    if (program.start <= now && now < program.end) {
      return program;
    }
  }
  return null;
});

const nextEpgProgram = computed(() => {
  const programs = epgPrograms.value;
  if (!programs.length) return null;
  const now = Date.now();
  for (const program of programs) {
    if (program.start > now) {
      return program;
    }
  }
  return null;
});

const epgProgress = computed(() => {
  const program = currentEpgProgram.value;
  if (!program) return 0;
  const total = program.end - program.start;
  const elapsed = Date.now() - program.start;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
});

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

  // 加载收藏
  loadFavorites();

  // 加载历史
  loadHistory();

  // 加载保存的频道
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const savedChannels = JSON.parse(saved);
      // 合并收藏状态
      channels.value = savedChannels.map(ch => ({
        ...ch,
        favorite: favorites.value.has(String(ch.id || ch.name))
      }));
    }
    addDiag('init', 'info', `从本地加载 ${channels.value.length} 个频道`);
  } catch (e) {
    addDiag('init', 'warn', '读取本地频道失败');
  }

  // 加载源配置
  try {
    const m3uSaved = localStorage.getItem(M3U_CONFIGS_KEY);
    if (m3uSaved) m3uSources.value = JSON.parse(m3uSaved);
    const epgSaved = localStorage.getItem(EPG_CONFIGS_KEY);
    if (epgSaved) {
      const epgConfig = JSON.parse(epgSaved);
      epgSources.value = epgConfig.sources || [];
      if (epgConfig.url) epgUrl.value = epgConfig.url;
    }
  } catch (e) {}

  // 加载 UA
  const savedUa = localStorage.getItem(GLOBAL_UA_KEY);
  if (savedUa) selectedUa.value = savedUa;

  // 从后端加载频道
  await loadChannelsFromApi();

  // 初始化视频事件
  initVideoEvents();

  // 初始化键盘快捷键
  initKeyboardShortcuts();

  // 初始化全屏监听
  initFullscreenListener();

  // 启动定时更新
  startStatsLoop();

  // 启动 EPG 更新
  startEpgLoop();

  addDiag('lifecycle', 'info', '播放器就绪');
});

// ─── 收藏功能 ───
const favorites = ref(new Set());

function loadFavorites() {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) favorites.value = new Set(JSON.parse(saved));
  } catch (e) {}
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites.value]));
}

function toggleFavorite(channel) {
  if (!channel) return;
  const key = String(channel.id || channel.name);
  if (favorites.value.has(key)) {
    favorites.value.delete(key);
  } else {
    favorites.value.add(key);
  }
  channel.favorite = favorites.value.has(key);
  saveFavorites();
  addDiag('fav', 'info', channel.favorite ? `已收藏: ${channel.name}` : `已取消收藏: ${channel.name}`);
}

function toggleFavorites() {
  showFavoritesOnly.value = !showFavoritesOnly.value;
}

// ─── 历史记录 ───
const history = ref([]);

function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) history.value = JSON.parse(saved);
  } catch (e) {}
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value.slice(0, 50)));
}

function addToHistory(channel) {
  if (!channel) return;
  history.value = history.value.filter(h => h.id !== channel.id);
  history.value.unshift({
    id: channel.id,
    name: channel.name,
    url: channel.url,
    playedAt: Date.now()
  });
  saveHistory();
}

// ─── 视频事件 ───
function initVideoEvents() {
  const video = videoRef.value;
  if (!video) return;

  // 音量设置
  video.volume = volume.value / 100;

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
    isPlaying.value = true;
    playerDesc.value = getPlayerDesc();
  });

  video.addEventListener('pause', () => {
    if (playerStatus.value !== '播放失败') {
      playerStatus.value = '已暂停';
    }
    isPlaying.value = false;
  });

  video.addEventListener('ended', () => {
    playerStatus.value = '播放结束';
    isPlaying.value = false;
  });

  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    playTime.value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  video.addEventListener('volumechange', () => {
    isMuted.value = video.muted;
    volume.value = Math.round(video.volume * 100);
  });
}

// ─── 键盘快捷键 ───
function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  // 如果在输入框中，不响应快捷键
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      prevChannel();
      break;
    case 'ArrowRight':
      e.preventDefault();
      nextChannel();
      break;
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'p':
    case 'P':
      e.preventDefault();
      togglePip();
      break;
    case 'm':
    case 'M':
      e.preventDefault();
      toggleMute();
      break;
  }
}

// ─── 全屏 ───
function initFullscreenListener() {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement;
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    videoContainerRef.value?.requestFullscreen().catch(e => {
      addDiag('fullscreen', 'error', `全屏失败: ${e.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// ─── 播放控制 ───
async function selectChannel(channel, index) {
  currentIndex.value = index;
  addToHistory(channel);
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
    isPlaying.value = true;
    currentPlayerType.value = detectPlayerType();
    playerDesc.value = getPlayerDesc();

    // 更新 EPG
    updateEpgDisplay();
  } catch (e) {
    playerStatus.value = '播放失败';
    isPlaying.value = false;
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

// ─── 控制按钮 ───
function togglePlay() {
  const video = videoRef.value;
  if (!video) return;
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

function toggleMute() {
  const video = videoRef.value;
  if (!video) return;
  video.muted = !video.muted;
}

function setVolume() {
  const video = videoRef.value;
  if (!video) return;
  video.volume = volume.value / 100;
  if (volume.value > 0) video.muted = false;
}

function prevChannel() {
  const list = filteredChannels.value;
  if (list.length === 0) return;
  let idx = currentIndex.value;
  const currentCh = channels.value[currentIndex.value];
  const currentFilteredIdx = list.findIndex(ch => ch.id === currentCh?.id || ch.name === currentCh?.name);
  if (currentFilteredIdx <= 0) {
    selectChannel(list[list.length - 1], channels.value.indexOf(list[list.length - 1]));
  } else {
    selectChannel(list[currentFilteredIdx - 1], channels.value.indexOf(list[currentFilteredIdx - 1]));
  }
}

function nextChannel() {
  const list = filteredChannels.value;
  if (list.length === 0) return;
  let idx = currentIndex.value;
  const currentCh = channels.value[currentIndex.value];
  const currentFilteredIdx = list.findIndex(ch => ch.id === currentCh?.id || ch.name === currentCh?.name);
  if (currentFilteredIdx >= list.length - 1) {
    selectChannel(list[0], channels.value.indexOf(list[0]));
  } else {
    selectChannel(list[currentFilteredIdx + 1], channels.value.indexOf(list[currentFilteredIdx + 1]));
  }
}

async function togglePip() {
  const video = videoRef.value;
  if (!video) return;

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      addDiag('pip', 'info', '退出画中画');
    } else if (document.pictureInPictureEnabled) {
      await video.requestPictureInPicture();
      addDiag('pip', 'info', '进入画中画');
    } else {
      addDiag('pip', 'warn', '浏览器不支持画中画');
    }
  } catch (e) {
    addDiag('pip', 'error', `画中画错误: ${e.message}`);
  }
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
        epg: ch.epg || '',
        groupName: ch.groupName || extractGroupFromName(ch.name) || ''
      }));
      // 合并收藏状态
      channels.value = channels.value.map(ch => ({
        ...ch,
        favorite: favorites.value.has(String(ch.id || ch.name))
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(channels.value));
      addDiag('api', 'info', `从后端加载 ${channels.value.length} 个频道`);
    }
  } catch (e) {
    addDiag('api', 'error', `加载频道失败: ${e.message}`);
  }
}

function extractGroupFromName(name) {
  // 从频道名提取分组，例如 "CCTV-1 综合" -> "综合"
  const match = name.match(/[\u4e00-\u9fa5]+$/);
  return match ? match[0] : '';
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
    channels.value = parsed.map(ch => ({
      ...ch,
      favorite: favorites.value.has(String(ch.id || ch.name))
    }));
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
  let pendingGroup = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.lastIndexOf(',');
      pendingName = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '';
      const tvgMatch = trimmed.match(/tvg-id="([^"]*)"/);
      pendingTvgId = tvgMatch?.[1] || '';
      const groupMatch = trimmed.match(/group-title="([^"]*)"/);
      pendingGroup = groupMatch?.[1] || extractGroupFromName(pendingName);
    } else if (trimmed && !trimmed.startsWith('#')) {
      result.push({
        id: Date.now() + result.length,
        name: pendingName || `频道${result.length + 1}`,
        url: trimmed,
        num: result.length + 1,
        tvgId: pendingTvgId,
        groupName: pendingGroup
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
    customEpgUrl.value = source.url;
    await loadEpgData(source.url);
  }
}

async function loadCustomEpg() {
  if (!customEpgUrl.value) {
    addDiag('epg', 'warn', '请输入 EPG URL');
    return;
  }
  await loadEpgData(customEpgUrl.value);
}

// ─── EPG 功能 ───
async function loadEpgData(url) {
  if (!url) {
    addDiag('epg', 'warn', 'EPG URL 为空');
    return;
  }

  // 检查缓存
  const freshEnough = epgUrl.value === url && epgProgramsByChannelId.value.size > 0 && (Date.now() - epgLoadedAt.value) < EPG_CACHE_TTL;
  if (freshEnough) {
    addDiag('epg', 'info', 'EPG 使用缓存');
    updateEpgDisplay();
    return;
  }

  addDiag('epg', 'info', `加载 EPG: ${url}`);
  try {
    const xmlText = await fetchEpgText(url);
    const parsed = parseXmltv(xmlText);
    epgUrl.value = url;
    epgLoadedAt.value = Date.now();
    epgProgramsByChannelId.value = parsed.programsByChannelId;
    epgNameToChannelId.value = parsed.nameToChannelId;
    addDiag('epg', 'info', `EPG 已加载 ${parsed.programsByChannelId.size} 个频道`);
    updateEpgDisplay();
  } catch (e) {
    addDiag('epg', 'error', `EPG 加载失败: ${e.message}`);
  }
}

async function fetchEpgText(epgUrl) {
  const token = localStorage.getItem('birdtv_token');
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

  // 尝试代理
  try {
    const proxyUrl = `/m3u-proxy?url=${encodeURIComponent(epgUrl)}`;
    const resp = await fetch(proxyUrl, { cache: 'no-store', headers });
    if (resp.ok) return readEpgResponseText(resp);
  } catch {}

  // 直接访问
  try {
    const resp = await fetch(epgUrl, { cache: 'no-store', headers });
    if (resp.ok) return readEpgResponseText(resp);
  } catch {}

  throw new Error('EPG 请求失败');
}

async function readEpgResponseText(response) {
  const rawBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(rawBuffer);
  const plainText = new TextDecoder('utf-8').decode(rawBuffer);

  // 检测 gzip 压缩
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && !plainText.trim().startsWith('<')) {
    if (typeof DecompressionStream === 'function') {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        const buffer = await new Response(stream).arrayBuffer();
        return new TextDecoder('utf-8').decode(buffer);
      } catch {}
    }
    if (window.pako?.ungzip) {
      try { return window.pako.ungzip(bytes, { to: 'string' }); } catch {}
    }
  }

  return plainText;
}

function parseXmltv(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('EPG XML 解析失败');

  const programsByChannelId = new Map();
  const nameToChannelId = new Map();

  doc.querySelectorAll('channel').forEach(channelNode => {
    const channelId = (channelNode.getAttribute('id') || '').trim();
    if (!channelId) return;
    programsByChannelId.set(channelId, []);
    nameToChannelId.set(normalizeChannelKey(channelId), channelId);
    channelNode.querySelectorAll('display-name').forEach(nameNode => {
      const name = (nameNode.textContent || '').trim();
      if (name) nameToChannelId.set(normalizeChannelKey(name), channelId);
    });
  });

  doc.querySelectorAll('programme').forEach(programmeNode => {
    const channelId = (programmeNode.getAttribute('channel') || '').trim();
    if (!channelId) return;
    const start = parseXmltvTime(programmeNode.getAttribute('start') || '');
    const end = parseXmltvTime(programmeNode.getAttribute('stop') || '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const title = (programmeNode.querySelector('title')?.textContent || '').trim() || '未命名节目';
    const desc = (programmeNode.querySelector('desc')?.textContent || '').trim();
    if (!programsByChannelId.has(channelId)) programsByChannelId.set(channelId, []);
    programsByChannelId.get(channelId).push({ start, end, title, desc });
  });

  for (const programs of programsByChannelId.values()) programs.sort((a, b) => a.start - b.start);
  return { programsByChannelId, nameToChannelId };
}

function parseXmltvTime(raw) {
  const match = String(raw || '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+\-]\d{4}|Z))?/);
  if (!match) return NaN;
  const [, y, mo, d, h, mi, s, tz] = match;
  if (!tz) return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
  if (tz === 'Z') return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const sign = tz[0] === '+' ? 1 : -1;
  const offset = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5))) * 60 * 1000;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - offset;
}

function normalizeChannelKey(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[\-_.()[\]{}]/g, '');
}

function resolveEpgChannelId(source) {
  if (!source) return '';
  if (source.tvgId && epgProgramsByChannelId.value.has(source.tvgId)) return source.tvgId;
  for (const candidate of [source.tvgId, source.tvgName, source.name]) {
    const key = normalizeChannelKey(candidate);
    if (key) {
      const mapped = epgNameToChannelId.value.get(key);
      if (mapped) return mapped;
    }
  }
  return '';
}

function updateEpgDisplay() {
  // EPG 通过计算属性自动更新
}

function formatEpgTime(ms) {
  if (!Number.isFinite(ms)) return '--:--';
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isCurrentProgram(program) {
  const now = Date.now();
  return program.start <= now && now < program.end;
}

let epgInterval = null;

function startEpgLoop() {
  epgInterval = setInterval(() => {
    if (currentChannel.value) {
      updateEpgDisplay();
    }
  }, 60000); // 每分钟更新
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
  if (epgInterval) clearInterval(epgInterval);
  document.removeEventListener('keydown', handleKeydown);
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

/* 频道分组按钮 */
.button-row .active {
  background: var(--primary);
  color: white;
}

/* 收藏高亮 */
.playlist-item.favorited {
  background: rgba(245, 158, 11, 0.1);
}

.playlist-item.favorited strong {
  color: #f59e0b;
}

/* 播放控制栏 */
.player-controls-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary, #1e1e1e);
  border-top: 1px solid var(--border, #333);
}

.ctrl-btn {
  background: transparent;
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.ctrl-btn:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.ctrl-volume {
  font-size: 12px;
  color: var(--muted);
  min-width: 40px;
}

.ctrl-volume-slider {
  width: 80px;
  accent-color: var(--primary);
}

/* EPG 进度条 */
.epg-progress {
  height: 4px;
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 2px;
  margin: 6px 0;
  overflow: hidden;
}

.epg-progress-bar {
  height: 100%;
  background: var(--primary);
  transition: width 1s linear;
}

.epg-now-time {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.epg-now-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

/* EPG 弹窗 */
.epg-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.epg-modal {
  background: var(--bg-primary, #1a1a1a);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.epg-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border, #333);
}

.epg-modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.epg-modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.epg-program-item {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  background: var(--bg-secondary, #252525);
  transition: background 0.2s;
}

.epg-program-item.current {
  background: rgba(59, 130, 246, 0.15);
  border-left: 3px solid var(--primary);
}

.epg-program-time {
  font-size: 12px;
  color: var(--primary);
  margin-bottom: 4px;
}

.epg-program-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.epg-program-desc {
  font-size: 12px;
  color: var(--muted);
}

/* 快捷键提示 */
.shortcuts-hint {
  padding: 8px 12px;
  background: var(--bg-secondary, #1e1e1e);
  border-top: 1px solid var(--border, #333);
  text-align: center;
}

.shortcuts-hint small {
  color: var(--muted);
  font-size: 11px;
}
</style>
