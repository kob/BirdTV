<template>
  <div class="player-wrapper">
    <!-- 使用 iframe 加载原始播放器以保持完整功能 -->
    <iframe
      v-if="useLegacyPlayer"
      ref="legacyPlayerRef"
      :src="legacyPlayerUrl"
      class="legacy-player-frame"
      allow="fullscreen; picture-in-picture"
      @load="onLegacyPlayerLoad"
    ></iframe>

    <!-- Vue 重构版播放器（功能精简版） -->
    <div v-else class="shell">
      <!-- 侧边栏 -->
      <aside class="panel sidebar">
        <section class="sidebar-head">
          <div class="sidebar-brand">
            <strong>BirdTV 播放器</strong>
            <span class="summary-hint">快捷入口</span>
          </div>
          <div class="sidebar-actions">
            <button class="secondary sidebar-link-btn" @click="router.push('/admin')">进入后台管理</button>
            <button class="secondary sidebar-link-btn" @click="router.push('/mobile')">手机端入口</button>
          </div>
        </section>

        <!-- 播放测试 -->
        <details class="card collapsible" :open="testSectionOpen">
          <summary>
            <span class="summary-title">播放测试</span>
            <span class="summary-hint">默认收起，点击展开</span>
          </summary>
          <div class="grid collapsible-content" style="gap:8px;">
            <label>频道名称
              <input v-model="testChannel.name" type="text" placeholder="例如：CCTV-1" class="play-test-input">
            </label>
            <label>播放地址
              <input v-model="testChannel.url" type="text" placeholder="http://example.com/stream.m3u8" class="play-test-input">
            </label>
            <div style="display:flex;gap:6px;">
              <label style="flex:1;">KID
                <input v-model="testChannel.kid" type="text" placeholder="可选" class="play-test-input">
              </label>
              <label style="flex:1;">KEY
                <input v-model="testChannel.key" type="text" placeholder="可选" class="play-test-input">
              </label>
            </div>
            <label>流类型
              <select v-model="testChannel.streamType" class="play-test-select">
                <option value="auto">自动检测</option>
                <option value="hls">HLS</option>
                <option value="mpd">DASH/MPD</option>
                <option value="ts">TS</option>
              </select>
            </label>
            <label>文本导入
              <textarea v-model="testChannel.importText" rows="5" placeholder="粘贴 #EXTINF / #KODIPROP 等格式文本" class="play-test-input" style="resize:vertical;font-size:12px;font-family:monospace;"></textarea>
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
              <select v-model="selectedM3uSource" @change="onM3uSourceChange" style="width:100%;">
                <option value="">-- 请选择或手动输入 --</option>
                <option v-for="src in m3uSources" :key="src.id" :value="src.id">{{ src.name }}</option>
              </select>
              <input v-model="m3uUrlInput" type="text" placeholder="例如：http://127.0.0.1:8881/mytv.m3u" style="margin-top:6px;">
            </div>

            <div class="config-source-section">
              <h3 class="config-sub-title">EPG 源</h3>
              <select v-model="selectedEpgSource" @change="onEpgSourceChange" style="width:100%;">
                <option value="">-- 请选择或手动覆盖 --</option>
                <option v-for="src in epgSources" :key="src.id" :value="src.id">{{ src.name }}</option>
              </select>
              <input v-model="epgUrlInput" type="text" placeholder="例如：https://example.com/guide.xml" style="margin-top:6px;">
            </div>

            <div class="button-row">
              <button class="secondary" @click="triggerM3uFile">上传节目文件</button>
              <button class="secondary" @click="loadM3uUrl">导入节目链接</button>
              <button class="secondary" @click="loadEpg">加载 EPG</button>
            </div>
            <input ref="m3uFileRef" type="file" accept=".m3u,.m3u8,text/plain" style="display:none;" @change="handleM3uFile">
          </div>
        </details>

        <!-- 频道列表 -->
        <section class="card grid">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <h2 class="section-title" style="margin:0;">频道列表</h2>
            <span class="muted">{{ filteredChannels.length }} / {{ channels.length }} 个</span>
          </div>
          <label>
            搜索
            <input v-model="searchQuery" type="text" placeholder="输入频道名过滤">
          </label>
          <div class="playlist" ref="playlistRef">
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
              <button class="secondary" @click="handleLogout" style="font-size:12px;padding:6px 12px;">退出登录</button>
              <button class="secondary" @click="router.push('/mobile')" style="font-size:12px;padding:6px 12px;">切换到移动版</button>
              <button class="secondary" @click="switchToLegacyPlayer" style="font-size:12px;padding:6px 12px;">切换到完整版</button>
              <div class="status-badge" :style="statusBadgeStyle">{{ playerStatus }}</div>
              <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:600;">
                播放器
                <select v-model="preferredPlayer" style="width:auto;min-width:124px;padding:6px 30px 6px 10px;font-size:12px;">
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
                <select v-model="selectedUa" style="width:auto;min-width:160px;padding:6px 30px 6px 10px;font-size:12px;">
                  <option v-for="ua in uaList" :key="ua.value" :value="ua.value">{{ ua.name }}</option>
                </select>
              </label>
            </div>
          </div>
          <div class="video-shell" data-shaka-player-container>
            <video
              ref="videoRef"
              id="video"
              autoplay
              controls
              playsinline
              data-shaka-player
              style="width:100%;height:100%;object-fit:contain;"
            ></video>
            <div id="artplayer-container" style="position:absolute;inset:0;display:none;z-index:10;"></div>
          </div>
        </section>

        <!-- 信息面板 -->
        <section class="info-grid">
          <div class="info-item">
            <small>当前播放地址</small>
            <details class="mpd-fold">
              <summary></summary>
              <strong class="mpd-url">{{ currentUrl || '-' }}</strong>
            </details>
          </div>
          <div class="info-item">
            <small>播放状态</small>
            <strong id="statusText">{{ playerStatus }}</strong>
          </div>
          <div class="info-item epg-wide">
            <small>EPG 节目单</small>
            <strong id="epgNow" class="epg-now-title">{{ epgNowText }}</strong>
            <div id="epgNowDesc" class="epg-now-desc">{{ epgDescText }}</div>
            <div class="mpd-url" id="epgMeta">EPG：{{ epgStatus }}</div>
            <div class="epg-progress" id="epgProgress" v-if="currentEpgProgram">
              <div class="epg-progress-bar" id="epgProgressBar" :style="{ width: epgProgress + '%' }"></div>
            </div>
            <div class="epg-progress-text" id="epgProgressText" v-if="currentEpgProgram">进度：{{ epgProgress }}%</div>
            <div class="button-row" style="margin-top:8px;">
              <button class="secondary" @click="showEpgModal = true">查看节目单</button>
            </div>
          </div>
        </section>

        <!-- 状态栏 -->
        <section class="status-line" aria-label="播放状态栏">
          <div class="status-chip"><small>DRM</small><strong>{{ drmText }}</strong></div>
          <div class="status-chip"><small>播放模式</small><strong>{{ preferredPlayer }}</strong></div>
          <div class="status-chip"><small>编排</small><strong id="orchestrationText">{{ orchestrationText }}</strong></div>
          <div class="status-chip"><small>冷却</small><strong id="fallbackCooldownText">{{ fallbackCooldownText }}</strong></div>
          <div class="status-chip"><small>分辨率</small><strong id="resolutionText">{{ videoResolution }}</strong></div>
          <div class="status-chip"><small>码率</small><strong id="bitrateText">{{ videoBitrate }}</strong></div>
          <div class="status-chip"><small>丢帧/总帧</small><strong id="framesText">{{ framesText }}</strong></div>
        </section>
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
const EPG_CACHE_TTL = 30 * 60 * 1000;
const HEVC_PATTERN = /(?:^|[\s_.\-|()\[\]])(hevc|h\.?265|x265)(?:$|[\s_.\-|()\[\]])/i;
const UHD_PATTERN = /(4k|uhd|2160p)/i;

// ─── 路由与状态 ───
const router = useRouter();
const authStore = useAuthStore();

// ─── DOM refs ───
const videoRef = ref(null);
const m3uFileRef = ref(null);
const playlistRef = ref(null);
const legacyPlayerRef = ref(null);

// ─── Legacy Player 模式 ───
const useLegacyPlayer = ref(false);
const legacyPlayerUrl = computed(() => {
  const baseUrl = getApiBaseUrl();
  // 使用原始播放器页面
  return `${baseUrl}/index.html`;
});

function switchToLegacyPlayer() {
  useLegacyPlayer.value = true;
}

function onLegacyPlayerLoad() {
  console.log('[Player] Legacy player loaded');
}

// ─── 播放器状态 ───
const playerStatus = ref('等待输入');
const playerDesc = ref('DASH MPD · Clear Key DRM · Shaka Player');
const currentUrl = ref('');
const videoResolution = ref('-');
const videoBitrate = ref('-');
const framesText = ref('-');
const drmText = ref('未配置');
const orchestrationText = ref('-');
const fallbackCooldownText = ref('-');
const preferredPlayer = ref('auto');
const proxyMode = ref('auto');
const currentPlayerType = ref(null);
const isPlaying = ref(false);

// ─── 状态徽章样式 ───
const statusBadgeStyle = computed(() => {
  if (playerStatus.value.includes('失败') || playerStatus.value.includes('错误')) {
    return { color: '#ff8090', background: 'rgba(255, 92, 114, 0.12)', borderColor: 'rgba(255, 92, 114, 0.3)' };
  }
  if (playerStatus.value.includes('播放') || playerStatus.value.includes('正在播放')) {
    return { color: '#22d399', background: 'rgba(34, 211, 153, 0.1)', borderColor: 'rgba(34, 211, 153, 0.3)' };
  }
  return { color: '', background: 'rgba(255, 255, 255, 0.06)', borderColor: 'rgba(255, 255, 255, 0.09)' };
});

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
const m3uUrlInput = ref('');
const epgUrlInput = ref('');

// ─── 测试播放 ───
const testSectionOpen = ref(false);
const testChannel = ref({
  name: '',
  url: '',
  kid: '',
  key: '',
  streamType: 'auto',
  importText: ''
});

// ─── UA ───
const uaList = ref([
  { name: 'Default (okhttp)', value: 'okhttp' },
  { name: 'Chrome Desktop', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
  { name: 'Safari iOS', value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' },
]);
const selectedUa = ref('okhttp');

// ─── EPG ───
const epgPrograms = ref([]);
const currentEpgProgram = ref(null);
const epgProgress = ref(0);
const epgStatus = ref('未加载');
const epgNowText = computed(() => currentEpgProgram.value ? `当前：${formatEpgTime(currentEpgProgram.value.start)}-${formatEpgTime(currentEpgProgram.value.end)} ${currentEpgProgram.value.title}` : '当前：-');
const epgDescText = computed(() => currentEpgProgram.value ? `简介：${currentEpgProgram.value.desc || '暂无简介'}` : '简介：-');
const showEpgModal = ref(false);

// ─── EPG 内部状态 ───
let epgProgramsByChannelId = new Map();
let epgNameToChannelId = new Map();
let epgLoadedAt = 0;
let epgUrl = '';

// ─── 诊断 ───
const diagnosticEvents = ref([]);

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
    if (epgSaved) {
      const epgConfig = JSON.parse(epgSaved);
      epgSources.value = epgConfig.sources || [];
      if (epgConfig.url) epgUrlInput.value = epgConfig.url;
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

  // 启动定时更新
  startStatsLoop();

  // 启动 EPG 更新
  startEpgLoop();

  addDiag('lifecycle', 'info', '播放器就绪');
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
    updateBufferStatus();
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
    playerStatus.value = '正在播放';
    isPlaying.value = true;
    updatePlayerDesc();
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
}

function updateBufferStatus() {
  const video = videoRef.value;
  if (!video || !video.buffered.length) return;
  const buffered = video.buffered.end(video.buffered.length - 1);
  // 可以在此更新缓冲状态
}

// ─── 键盘快捷键 ───
function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
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
  drmText.value = '无 DRM';

  const video = videoRef.value;
  if (!video) return;

  try {
    // 根据 URL 类型选择播放方式
    const url = channel.url;
    const streamType = detectStreamType(url);

    // 更新编排文本
    orchestrationText.value = `${preferredPlayer.value} · ${streamType}`;

    if (streamType === 'mpd' || preferredPlayer.value === 'shaka') {
      // Shaka Player 需要外部加载
      addDiag('shaka', 'warn', 'Shaka Player 需要在完整版播放器中使用');
      await playDirect(url);
    } else if (streamType === 'hls' || url.includes('.m3u')) {
      await playWithHls(url);
    } else if (streamType === 'ts' || url.includes('.ts') || preferredPlayer.value === 'mpegts') {
      await playWithMpegts(url);
    } else {
      await playDirect(url);
    }

    playerStatus.value = '正在播放';
    isPlaying.value = true;
    currentPlayerType.value = detectPlayerType();
    updatePlayerDesc();

    // 更新 EPG
    updateEpgDisplay();
  } catch (e) {
    playerStatus.value = `播放失败: ${e.message}`;
    isPlaying.value = false;
    addDiag('play', 'error', `播放错误: ${e.message}`);
  }
}

async function playWithHls(url) {
  if (window.Hls && videoRef.value) {
    addDiag('hls', 'info', '使用 HLS.js 播放');
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 15,
      maxBufferSize: 30 * 1000 * 1000,
    });
    hls.loadSource(url);
    hls.attachMedia(videoRef.value);
    hls.on(Hls.Events.ERROR, (e, data) => {
      addDiag('hls', 'error', `HLS 错误: ${data.details}`);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            break;
        }
      }
    });
    currentPlayerType.value = 'hls';
  } else if (videoRef.value?.canPlayType('application/vnd.apple.mpegurl')) {
    await playDirect(url);
  } else {
    addDiag('hls', 'warn', 'HLS.js 未加载，使用原生播放');
    await playDirect(url);
  }
}

async function playWithMpegts(url) {
  if (window.mpegts && videoRef.value) {
    addDiag('mpegts', 'info', '使用 mpegts.js 播放');
    const player = window.mpegts.createPlayer({
      type: 'mpegts',
      url: url,
      isLive: true,
    });
    player.attachMediaElement(videoRef.value);
    await player.load();
    await player.play();
    currentPlayerType.value = 'mpegts';
  } else {
    addDiag('mpegts', 'warn', 'mpegts.js 未加载，使用原生播放');
    await playDirect(url);
  }
}

async function playDirect(url) {
  addDiag('native', 'info', '使用原生播放器');
  videoRef.value.src = url;
  try {
    await videoRef.value.play();
    currentPlayerType.value = 'native';
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
  if (videoRef.value?._shakaPlayer) return 'shaka';
  if (window.Hls?.isSupported?.()) return 'hls';
  if (window.mpegts?.isSupported?.()) return 'mpegts';
  return 'native';
}

function updatePlayerDesc() {
  const type = detectStreamType(currentUrl.value);
  const player = currentPlayerType.value || preferredPlayer.value;
  const proxyLabel = proxyMode.value === 'direct' ? '直连' : (proxyMode.value === 'm3u-proxy' ? '代理' : '自动');
  playerDesc.value = `[${type.toUpperCase()}] [${proxyLabel}] ${drmText.value}`;
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

function prevChannel() {
  const list = filteredChannels.value;
  if (list.length === 0) return;
  let idx = currentIndex.value;
  if (idx <= 0) {
    selectChannel(list[list.length - 1], channels.value.indexOf(list[list.length - 1]));
  } else {
    selectChannel(list[idx - 1], channels.value.indexOf(list[idx - 1]));
  }
}

function nextChannel() {
  const list = filteredChannels.value;
  if (list.length === 0) return;
  let idx = currentIndex.value;
  if (idx >= list.length - 1) {
    selectChannel(list[0], channels.value.indexOf(list[0]));
  } else {
    selectChannel(list[idx + 1], channels.value.indexOf(list[idx + 1]));
  }
}

async function togglePip() {
  const video = videoRef.value;
  if (!video) return;

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await video.requestPictureInPicture();
    }
  } catch (e) {
    addDiag('pip', 'error', `画中画错误: ${e.message}`);
  }
}

async function toggleFullscreen() {
  const container = videoRef.value?.parentElement;
  if (!container) return;

  try {
    if (!document.fullscreenElement) {
      await container.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    addDiag('fullscreen', 'error', `全屏错误: ${e.message}`);
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
    streamType: testChannel.value.streamType,
    drm: testChannel.value.kid && testChannel.value.key ? {
      clearKeys: { [testChannel.value.kid]: testChannel.value.key }
    } : null
  };

  if (ch.drm) {
    drmText.value = 'Clear Key';
  }

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
    if (trimmed.startsWith('#KODIPROP:')) {
      // 解析 DRM 属性
      const match = trimmed.match(/KODIPROP:.*?KEY=([A-Fa-f0-9]{32})/i);
      if (match) testChannel.value.key = match[1];
      const kidMatch = trimmed.match(/KODIPROP:.*?KID=([A-Fa-f0-9]{32})/i);
      if (kidMatch) testChannel.value.kid = kidMatch[1];
    } else if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.lastIndexOf(',');
      testChannel.value.name = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '未知';
      // 解析流类型
      if (trimmed.includes('tvg-type="mpd"')) testChannel.value.streamType = 'mpd';
      if (trimmed.includes('tvg-type="hls"')) testChannel.value.streamType = 'hls';
      if (trimmed.includes('tvg-type="ts"')) testChannel.value.streamType = 'ts';
    } else if (trimmed && !trimmed.startsWith('#') && (trimmed.startsWith('http') || trimmed.startsWith('/'))) {
      testChannel.value.url = trimmed;
    }
  }
  addDiag('test', 'info', `解析: ${testChannel.value.name}`);
}

function clearTest() {
  testChannel.value = { name: '', url: '', kid: '', key: '', streamType: 'auto', importText: '' };
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
  let pendingStreamType = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const commaIdx = trimmed.lastIndexOf(',');
      pendingName = commaIdx >= 0 ? trimmed.slice(commaIdx + 1).trim() : '';
      const tvgMatch = trimmed.match(/tvg-id="([^"]*)"/);
      pendingTvgId = tvgMatch?.[1] || '';
      if (trimmed.includes('tvg-type="mpd"')) pendingStreamType = 'mpd';
      if (trimmed.includes('tvg-type="hls"')) pendingStreamType = 'hls';
      if (trimmed.includes('tvg-type="ts"')) pendingStreamType = 'ts';
    } else if (trimmed && !trimmed.startsWith('#')) {
      result.push({
        id: Date.now() + result.length,
        name: pendingName || `频道${result.length + 1}`,
        url: trimmed,
        num: result.length + 1,
        tvgId: pendingTvgId,
        streamType: pendingStreamType || 'auto'
      });
    }
  }
  return result;
}

async function loadM3uUrl() {
  if (!m3uUrlInput.value) {
    addDiag('m3u', 'warn', '请输入 M3U URL');
    return;
  }
  try {
    const res = await axios.get(m3uUrlInput.value, { timeout: 30000 });
    const parsed = parseM3U(res.data);
    channels.value = parsed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels.value));
    addDiag('m3u', 'info', `加载 M3U URL: ${parsed.length} 个频道`);
  } catch (e) {
    addDiag('m3u', 'error', `M3U URL 加载失败: ${e.message}`);
  }
}

async function onM3uSourceChange() {
  const source = m3uSources.value.find(s => s.id === selectedM3uSource.value);
  if (source?.url) {
    m3uUrlInput.value = source.url;
    await loadM3uUrl();
  }
}

async function onEpgSourceChange() {
  const source = epgSources.value.find(s => s.id === selectedEpgSource.value);
  if (source?.url) {
    epgUrlInput.value = source.url;
    await loadEpgData(source.url);
  }
}

async function loadEpg() {
  if (!epgUrlInput.value) {
    addDiag('epg', 'warn', '请输入 EPG URL');
    return;
  }
  await loadEpgData(epgUrlInput.value);
}

async function loadEpgData(url) {
  if (!url) return;

  // 检查缓存
  const freshEnough = epgUrl === url && epgProgramsByChannelId.size > 0 && (Date.now() - epgLoadedAt) < EPG_CACHE_TTL;
  if (freshEnough) {
    addDiag('epg', 'info', 'EPG 使用缓存');
    updateEpgDisplay();
    return;
  }

  addDiag('epg', 'info', `加载 EPG: ${url}`);
  try {
    const token = localStorage.getItem('birdtv_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    let xmlText;
    try {
      const resp = await fetch(`/m3u-proxy?url=${encodeURIComponent(url)}`, { cache: 'no-store', headers });
      if (resp.ok) xmlText = await resp.text();
    } catch {}

    if (!xmlText) {
      const resp = await fetch(url, { cache: 'no-store', headers });
      if (resp.ok) xmlText = await resp.text();
    }

    if (!xmlText) throw new Error('EPG 请求失败');

    const parsed = parseXmltv(xmlText);
    epgUrl = url;
    epgLoadedAt = Date.now();
    epgProgramsByChannelId = parsed.programsByChannelId;
    epgNameToChannelId = parsed.nameToChannelId;
    epgStatus.value = `已加载 ${parsed.programsByChannelId.size} 个频道`;
    addDiag('epg', 'info', `EPG 已加载 ${parsed.programsByChannelId.size} 个频道`);
    updateEpgDisplay();
  } catch (e) {
    epgStatus.value = '加载失败';
    addDiag('epg', 'error', `EPG 加载失败: ${e.message}`);
  }
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
  if (source.tvgId && epgProgramsByChannelId.has(source.tvgId)) return source.tvgId;
  for (const candidate of [source.tvgId, source.tvgName, source.name]) {
    const key = normalizeChannelKey(candidate);
    if (key) {
      const mapped = epgNameToChannelId.get(key);
      if (mapped) return mapped;
    }
  }
  return '';
}

function updateEpgDisplay() {
  const source = currentChannel.value;
  if (!source || !epgProgramsByChannelId.size) {
    currentEpgProgram.value = null;
    epgPrograms.value = [];
    return;
  }

  const channelId = resolveEpgChannelId(source);
  const programs = channelId ? (epgProgramsByChannelId.get(channelId) || []) : [];
  epgPrograms.value = programs;

  if (!programs.length) {
    currentEpgProgram.value = null;
    return;
  }

  const now = Date.now();
  let current = null;
  for (const program of programs) {
    if (program.start <= now && now < program.end) {
      current = program;
      break;
    }
  }

  currentEpgProgram.value = current;

  if (current) {
    const total = current.end - current.start;
    const elapsed = now - current.start;
    epgProgress.value = Math.min(100, Math.max(0, (elapsed / total) * 100));
  }
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
  }, 60000);
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

// ─── 保存设置 ───
watch(selectedUa, (val) => {
  localStorage.setItem(GLOBAL_UA_KEY, val);
});

watch(preferredPlayer, (val) => {
  localStorage.setItem('tvplayer.preferredPlayer', val);
});

watch(proxyMode, (val) => {
  localStorage.setItem('tvplayer.proxyMode', val);
});
</script>

<style scoped>
.player-wrapper {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.legacy-player-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
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
</style>
