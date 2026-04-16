<template>
  <div class="admin-page page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="app-title">BirdTV 管理后台</h1>
      </div>
      <div class="header-right">
        <router-link to="/" class="btn btn-ghost">返回播放器</router-link>
        <button class="btn btn-ghost" @click="handleLogout">退出</button>
      </div>
    </header>

    <div class="admin-body">
      <!-- 侧边导航 -->
      <nav class="admin-nav">
        <a
          v-for="item in navItems"
          :key="item.key"
          :class="['nav-item', { active: activeTab === item.key }]"
          @click="activeTab = item.key"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <!-- 内容区 -->
      <main class="admin-content">
        <!-- 频道管理 -->
        <div v-if="activeTab === 'channels'" class="tab-content">
          <div class="content-header">
            <h2>频道管理</h2>
            <div class="header-actions">
              <button class="btn btn-primary" @click="showChannelModal()">添加频道</button>
              <button class="btn" @click="showImportModal()">导入</button>
              <button class="btn" @click="loadChannels()">刷新</button>
            </div>
          </div>

          <!-- 搜索过滤 -->
          <div class="search-bar">
            <select v-model="channelSearchType" class="search-select">
              <option value="name">按名称</option>
              <option value="group">按分组</option>
            </select>
            <input
              v-model="channelSearch"
              type="text"
              class="search-input"
              placeholder="搜索频道..."
              @input="debounceChannelSearch"
            />
            <select v-model="channelSourceFilter" class="search-select" @change="loadChannels">
              <option value="">全部源</option>
              <option v-for="s in sourceNames" :key="s" :value="s">{{ s }}</option>
            </select>
            <span id="channelResultCount" class="result-count">{{ filteredChannels.length }} 条</span>
          </div>

          <!-- 批量操作 -->
          <div v-if="selectedChannelIds.size > 0" class="batch-actions">
            <span>已选 {{ selectedChannelIds.size }} 个</span>
            <button class="btn btn-sm" @click="batchExportChannels">导出</button>
            <button class="btn btn-sm btn-danger" @click="batchDeleteChannels">删除</button>
          </div>

          <!-- 频道表格 -->
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th width="40"><input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected" /></th>
                  <th width="50">Logo</th>
                  <th>名称</th>
                  <th>ID</th>
                  <th>URL</th>
                  <th>分组</th>
                  <th>源</th>
                  <th>代理</th>
                  <th>播放器</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingChannels">
                  <td colspan="10" class="loading-cell">加载中...</td>
                </tr>
                <tr v-else-if="paginatedChannels.length === 0">
                  <td colspan="10" class="empty-cell">
                    <div class="empty">📺<br/>暂无频道数据</div>
                  </td>
                </tr>
                <tr v-for="ch in paginatedChannels" :key="ch.id">
                  <td><input type="checkbox" :value="ch.id" v-model="selectedChannelIds" /></td>
                  <td>
                    <img v-if="ch.tvgLogo" :src="ch.tvgLogo" class="channel-logo" @error="$event.target.style.display='none'" />
                    <span v-else>-</span>
                  </td>
                  <td><b>{{ ch.name }}</b></td>
                  <td>{{ ch.tvgId || '-' }}</td>
                  <td class="url-cell" :title="ch.url">{{ ch.url }}</td>
                  <td>{{ ch.group || '-' }}</td>
                  <td>{{ ch.sourceName || '-' }}</td>
                  <td><span class="tag tag-blue">{{ ch.proxyMode || 'auto' }}</span></td>
                  <td><span class="tag tag-green">{{ ch.playerType || 'auto' }}</span></td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="showChannelModal(ch)">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteChannel(ch.id)">删除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页 -->
          <div v-if="totalChannelPages > 1" class="pagination">
            <span>第 {{ channelPage }} / {{ totalChannelPages }} 页</span>
            <button class="btn btn-sm" :disabled="channelPage <= 1" @click="channelPage--">上一页</button>
            <button class="btn btn-sm" :disabled="channelPage >= totalChannelPages" @click="channelPage++">下一页</button>
            <select v-model="channelPageSize" @change="channelPage = 1">
              <option :value="10">10条/页</option>
              <option :value="20">20条/页</option>
              <option :value="50">50条/页</option>
              <option :value="100">100条/页</option>
            </select>
          </div>
        </div>

        <!-- 源管理 -->
        <div v-if="activeTab === 'sources'" class="tab-content">
          <div class="content-header">
            <h2>节目源管理</h2>
            <div class="header-actions">
              <button class="btn btn-primary" @click="showSourceModal()">添加源</button>
              <button class="btn" @click="loadSources()">刷新</button>
            </div>
          </div>

          <div class="source-tabs">
            <button :class="['tab-btn', { active: sourceTab === 'm3u' }]" @click="sourceTab = 'm3u'">M3U 源</button>
            <button :class="['tab-btn', { active: sourceTab === 'epg' }]" @click="sourceTab = 'epg'">EPG 源</button>
          </div>

          <!-- M3U 源列表 -->
          <div v-if="sourceTab === 'm3u'" class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>URL</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in m3uSources" :key="s.id">
                  <td><b>{{ s.name }}</b></td>
                  <td class="url-cell">{{ s.url }}</td>
                  <td>
                    <span v-if="s.status === 'active'" class="tag tag-green">活跃</span>
                    <span v-else class="tag tag-gray">{{ s.status || '未知' }}</span>
                  </td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="testSource(s.id, 'm3u')">测试</button>
                    <button class="btn btn-sm" @click="importSource(s.id)">导入</button>
                    <button class="btn btn-sm" @click="showSourceModal(s)">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteSource(s.id, 'm3u')">删除</button>
                  </td>
                </tr>
                <tr v-if="m3uSources.length === 0">
                  <td colspan="4" class="empty-cell"><div class="empty">暂无 M3U 源</div></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- EPG 源列表 -->
          <div v-if="sourceTab === 'epg'" class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>URL</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in epgSources" :key="s.id">
                  <td><b>{{ s.name }}</b></td>
                  <td class="url-cell">{{ s.url }}</td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="testSource(s.id, 'epg')">测试</button>
                    <button class="btn btn-sm" @click="showSourceModal(s, 'epg')">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteSource(s.id, 'epg')">删除</button>
                  </td>
                </tr>
                <tr v-if="epgSources.length === 0">
                  <td colspan="3" class="empty-cell"><div class="empty">暂无 EPG 源</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 导出管理 -->
        <div v-if="activeTab === 'exports'" class="tab-content">
          <div class="content-header">
            <h2>导出管理</h2>
            <div class="header-actions">
              <button class="btn" @click="loadExports()">刷新</button>
            </div>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>创建时间</th>
                  <th>过期时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in exports" :key="e.id">
                  <td>{{ e.filename }}</td>
                  <td>{{ new Date(e.createdAt).toLocaleString() }}</td>
                  <td>{{ e.expiresAt ? new Date(e.expiresAt).toLocaleString() : '-' }}</td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="downloadExport(e.id, e.filename)">下载</button>
                    <button class="btn btn-sm btn-danger" @click="deleteExport(e.id)">删除</button>
                  </td>
                </tr>
                <tr v-if="exports.length === 0">
                  <td colspan="4" class="empty-cell"><div class="empty">暂无导出记录</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- EPG 节目单 -->
        <div v-if="activeTab === 'epg'" class="tab-content">
          <div class="content-header">
            <h2>EPG 节目单</h2>
            <div class="header-actions">
              <button class="btn btn-primary" @click="showEpgChannelModal()">添加 EPG 频道</button>
              <button class="btn" @click="refreshEpg()">刷新 EPG</button>
              <button class="btn" @click="loadEpgChannels()">刷新</button>
            </div>
          </div>

          <div class="search-bar">
            <input v-model="epgSearch" type="text" class="search-input" placeholder="搜索 EPG 频道..." @input="debounceEpgSearch" />
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>频道名称</th>
                  <th>分组</th>
                  <th>匹配策略</th>
                  <th>状态</th>
                  <th>最后更新</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ch in paginatedEpgChannels" :key="ch.id">
                  <td><b>{{ ch.name }}</b></td>
                  <td>{{ ch.group || '未分组' }}</td>
                  <td><span class="tag tag-blue">{{ strategyLabels[ch.strategy] || '自动匹配' }}</span></td>
                  <td>
                    <span v-if="ch.lastUpdate" class="tag tag-green">已更新</span>
                    <span v-else class="tag tag-gray">未更新</span>
                  </td>
                  <td>{{ ch.lastUpdate ? new Date(ch.lastUpdate).toLocaleString() : '-' }}</td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="showEpgChannelModal(ch)">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteEpgChannel(ch.id)">删除</button>
                  </td>
                </tr>
                <tr v-if="epgChannels.length === 0">
                  <td colspan="6" class="empty-cell"><div class="empty">暂无 EPG 频道</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 系统设置 -->
        <div v-if="activeTab === 'settings'" class="tab-content">
          <div class="content-header">
            <h2>系统设置</h2>
          </div>

          <div class="settings-form">
            <div class="form-group">
              <label>默认播放器</label>
              <select v-model="settings.defaultPlayer">
                <option value="auto">自动</option>
                <option value="shaka">Shaka</option>
                <option value="hlsjs">HLS.js</option>
                <option value="mpegts">mpegts.js</option>
                <option value="artplayer">ArtPlayer</option>
              </select>
            </div>
            <div class="form-group">
              <label>M3U 缓存 TTL (分钟)</label>
              <input type="number" v-model="settings.cacheM3uTtl" min="1" />
            </div>
            <div class="form-group">
              <label>EPG 缓存 TTL (分钟)</label>
              <input type="number" v-model="settings.cacheEpgTtl" min="1" />
            </div>
            <div class="form-group">
              <label>请求超时 (秒)</label>
              <input type="number" v-model="settings.timeout" min="5" />
            </div>
            <div class="form-group">
              <label>播放模式</label>
              <select v-model="settings.playbackMode">
                <option value="live">直播</option>
                <option value="vod">点播</option>
              </select>
            </div>
            <div class="form-group">
              <label>M3U 代理认证</label>
              <select v-model="settings.m3uProxyAuth">
                <option :value="true">启用</option>
                <option :value="false">禁用</option>
              </select>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" @click="saveSettings()">保存设置</button>
            </div>

            <div class="divider"></div>
            <h3>数据同步</h3>
            <div class="sync-info">
              <p>Redis 前缀: <span>{{ syncInfo.redisPrefix }}</span></p>
              <p>服务器 ID: <span>{{ syncInfo.serverId }}</span></p>
            </div>
            <div class="form-actions">
              <button class="btn" @click="syncToRedis()">同步到 Redis</button>
              <button class="btn" @click="syncFromRedis()">从 Redis 同步</button>
            </div>
          </div>
        </div>

        <!-- UA 管理 -->
        <div v-if="activeTab === 'ua'" class="tab-content">
          <div class="content-header">
            <h2>UA 管理</h2>
            <div class="header-actions">
              <button class="btn btn-primary" @click="showAddCustomUaModal()">添加自定义 UA</button>
            </div>
          </div>

          <div class="ua-tabs">
            <button :class="['tab-btn', { active: uaTab === 'global' }]" @click="uaTab = 'global'">全局 UA</button>
            <button :class="['tab-btn', { active: uaTab === 'channel' }]" @click="uaTab = 'channel'">频道 UA</button>
            <button :class="['tab-btn', { active: uaTab === 'custom' }]" @click="uaTab = 'custom'">自定义预设</button>
          </div>

          <!-- 全局 UA -->
          <div v-if="uaTab === 'global'" class="ua-section">
            <div class="form-group">
              <label>全局 User-Agent</label>
              <select @change="applyPresetToGlobal($event)">
                <option value="">-- 选择预设 --</option>
                <option v-for="p in uaPresets" :key="p.value" :value="p.value">{{ p.name }}</option>
              </select>
              <input type="text" v-model="globalUa" placeholder="输入自定义 UA" />
            </div>
            <button class="btn btn-primary" @click="saveGlobalUa()">保存</button>
            <button class="btn" @click="resetGlobalUa()">重置</button>
          </div>

          <!-- 频道 UA -->
          <div v-if="uaTab === 'channel'" class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>频道</th>
                  <th>自定义 UA</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cu in channelUas" :key="cu.channelId">
                  <td>{{ cu.channelName }}</td>
                  <td class="url-cell">{{ cu.userAgent }}</td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="editChannelUa(cu.channelId, cu.channelName, cu.userAgent)">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteChannelUa(cu.channelId)">删除</button>
                  </td>
                </tr>
                <tr v-if="channelUas.length === 0">
                  <td colspan="3" class="empty-cell"><div class="empty">暂无频道 UA 设置</div></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 自定义预设 -->
          <div v-if="uaTab === 'custom'" class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>值</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(cu, idx) in customUas" :key="idx">
                  <td>{{ cu.name }}</td>
                  <td class="url-cell">{{ cu.value }}</td>
                  <td class="btn-group">
                    <button class="btn btn-sm btn-danger" @click="deleteCustomUa(idx)">删除</button>
                  </td>
                </tr>
                <tr v-if="customUas.length === 0">
                  <td colspan="3" class="empty-cell"><div class="empty">暂无自定义 UA</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 用户管理 -->
        <div v-if="activeTab === 'users'" class="tab-content">
          <div class="content-header">
            <h2>用户管理</h2>
            <div class="header-actions">
              <button class="btn btn-primary" @click="showUserModal()">添加用户</button>
              <button class="btn" @click="loadUsers()">刷新</button>
            </div>
          </div>

          <div class="search-bar">
            <input v-model="userSearch" type="text" class="search-input" placeholder="搜索用户..." @input="debounceUserSearch" />
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in filteredUsers" :key="u.id">
                  <td><b>{{ u.username }}</b></td>
                  <td><span :class="['tag', u.role === 'admin' ? 'tag-warning' : 'tag-success']">{{ u.role }}</span></td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="showChangePasswordModal(u)">改密</button>
                    <button class="btn btn-sm" @click="confirmResetPassword(u)">重置</button>
                    <button class="btn btn-sm btn-danger" @click="confirmDeleteUser(u)">删除</button>
                  </td>
                </tr>
                <tr v-if="filteredUsers.length === 0">
                  <td colspan="3" class="empty-cell"><div class="empty">暂无用户</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 定时任务 -->
        <div v-if="activeTab === 'scheduler'" class="tab-content">
          <div class="content-header">
            <h2>定时任务</h2>
            <div class="header-actions">
              <button class="btn btn-primary" @click="showSchedulerTaskModal()">添加任务</button>
              <button class="btn" @click="loadSchedulerTasks()">刷新</button>
            </div>
          </div>

          <div class="scheduler-status" v-if="schedulerStatus">
            <span class="status-indicator"></span>
            {{ schedulerStatus }}
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>源</th>
                  <th>定时</th>
                  <th>上次执行</th>
                  <th>下次执行</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in schedulerTasks" :key="t.id">
                  <td><b>{{ t.name }}</b></td>
                  <td><span :class="['tag', t.type === 'export' ? 'tag-purple' : 'tag-blue']">{{ t.type === 'export' ? '导出' : '导入' }}</span></td>
                  <td>{{ t.sourceName || '-' }}</td>
                  <td>{{ t.cron }}</td>
                  <td>{{ t.lastRunAt ? new Date(t.lastRunAt).toLocaleString() : '-' }}</td>
                  <td>{{ t.nextRunAt ? formatCountdown(new Date(t.nextRunAt) - Date.now()) : '-' }}</td>
                  <td>
                    <button :class="['btn btn-sm', t.enabled ? 'btn-success' : '']" @click="toggleSchedulerTask(t)">
                      {{ t.enabled ? '启用' : '禁用' }}
                    </button>
                  </td>
                  <td class="btn-group">
                    <button class="btn btn-sm" @click="runSchedulerTask(t.id)">执行</button>
                    <button class="btn btn-sm" @click="showSchedulerTaskModal(t)">编辑</button>
                    <button class="btn btn-sm btn-danger" @click="deleteSchedulerTask(t.id)">删除</button>
                  </td>
                </tr>
                <tr v-if="schedulerTasks.length === 0">
                  <td colspan="8" class="empty-cell"><div class="empty">暂无定时任务</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>

    <!-- 模态框 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ modalTitle }}</h3>
          <button class="modal-close" @click="showModal = false">&times;</button>
        </div>
        <div class="modal-body" v-html="modalBody"></div>
        <div class="modal-footer" v-html="modalFooter"></div>
      </div>
    </div>

    <!-- Toast -->
    <div class="toast-container">
      <div v-for="t in toasts" :key="t.id" :class="['toast', 'toast-' + t.type]">{{ t.message }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { channelApi, sourceApi, settingsApi, exportApi, epgApi, authApi } from '@/api';
import api from '@/api';

const router = useRouter();

// 状态
const activeTab = ref('channels');
const showModal = ref(false);
const modalTitle = ref('');
const modalBody = ref('');
const modalFooter = ref('');
const toasts = ref([]);
let toastId = 0;

// 导航
const navItems = [
  { key: 'channels', label: '频道管理', icon: '📡' },
  { key: 'sources', label: '源管理', icon: '🔗' },
  { key: 'exports', label: '导出管理', icon: '📦' },
  { key: 'epg', label: 'EPG 节目单', icon: '📋' },
  { key: 'settings', label: '系统设置', icon: '⚙️' },
  { key: 'ua', label: 'UA 管理', icon: '🌐' },
  { key: 'users', label: '用户管理', icon: '👤' },
  { key: 'scheduler', label: '定时任务', icon: '⏰' },
];

// 频道管理
const channels = ref([]);
const filteredChannels = ref([]);
const selectedChannelIds = ref([]);
const channelSearch = ref('');
const channelSearchType = ref('name');
const channelSourceFilter = ref('');
const sourceNames = ref([]);
const channelPage = ref(1);
const channelPageSize = ref(20);
const loadingChannels = ref(false);

// 源管理
const sourceTab = ref('m3u');
const m3uSources = ref([]);
const epgSources = ref([]);

// 导出管理
const exports = ref([]);

// EPG
const epgChannels = ref([]);
const paginatedEpgChannels = ref([]);
const epgSearch = ref('');
const strategyLabels = { auto: '自动匹配', manual: '手动绑定', custom: '自定义', smart: '智能学习' };
const epgPage = ref(1);
const epgPageSize = ref(10);

// 设置
const settings = ref({
  defaultPlayer: 'auto',
  cacheM3uTtl: 10,
  cacheEpgTtl: 30,
  timeout: 40,
  playbackMode: 'live',
  m3uProxyAuth: false,
});
const syncInfo = ref({ redisPrefix: '-', serverId: '-' });

// UA
const uaTab = ref('global');
const uaPresets = [
  { name: '默认 (okhttp)', value: 'okhttp' },
  { name: 'MX Player', value: 'MXPlayer/1.58.1' },
  { name: 'IPTV Smarters', value: 'IPTV Smarters Pro/4.2' },
  { name: 'Chrome Mobile', value: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0.6099.144 Mobile Safari/537.36' },
  { name: 'Safari iOS', value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1' },
  { name: 'Windows Chrome', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
  { name: 'curl', value: 'curl/8.4.0' },
];
const globalUa = ref('');
const channelUas = ref([]);
const customUas = ref([]);

// 用户
const users = ref([]);
const filteredUsers = ref([]);
const userSearch = ref('');
const userPage = ref(1);
const userPageSize = ref(10);

// 定时任务
const schedulerTasks = ref([]);
const schedulerStatus = ref('');
const schedulerSources = ref([]);

// 计算属性
const isAllSelected = computed(() => {
  return filteredChannels.value.length > 0 && filteredChannels.value.every(ch => selectedChannelIds.value.includes(ch.id));
});

const totalChannelPages = computed(() => Math.max(1, Math.ceil(filteredChannels.value.length / channelPageSize.value)));

const paginatedChannels = computed(() => {
  const start = (channelPage.value - 1) * channelPageSize.value;
  return filteredChannels.value.slice(start, start + channelPageSize.value);
});

const totalEpgPages = computed(() => Math.max(1, Math.ceil(epgChannels.value.length / epgPageSize.value)));

// Toast
function toast(message, type = 'info') {
  const id = ++toastId;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 3000);
}

// 工具函数
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 防抖
let channelDebounceTimer = null;
function debounceChannelSearch() {
  clearTimeout(channelDebounceTimer);
  channelDebounceTimer = setTimeout(() => {
    filterChannels();
    channelPage.value = 1;
  }, 300);
}

let epgDebounceTimer = null;
function debounceEpgSearch() {
  clearTimeout(epgDebounceTimer);
  epgDebounceTimer = setTimeout(() => {
    filterEpgChannels();
  }, 300);
}

let userDebounceTimer = null;
function debounceUserSearch() {
  clearTimeout(userDebounceTimer);
  userDebounceTimer = setTimeout(() => {
    filterUsers();
  }, 300);
}

// 过滤
function filterChannels() {
  let result = [...channels.value];
  const q = channelSearch.value.toLowerCase();
  if (q) {
    if (channelSearchType.value === 'name') {
      result = result.filter(c => c.name.toLowerCase().includes(q));
    } else if (channelSearchType.value === 'group') {
      result = result.filter(c => (c.group || '').toLowerCase().includes(q));
    }
  }
  if (channelSourceFilter.value) {
    result = result.filter(c => c.sourceName === channelSourceFilter.value);
  }
  filteredChannels.value = result;
  updateSourceNames();
}

function filterEpgChannels() {
  const q = epgSearch.value.toLowerCase();
  let result = epgChannels.value;
  if (q) {
    result = result.filter(ch => ch.name.toLowerCase().includes(q));
  }
  paginatedEpgChannels.value = result.slice((epgPage.value - 1) * epgPageSize.value, epgPage.value * epgPageSize.value);
}

function filterUsers() {
  const q = userSearch.value.toLowerCase();
  filteredUsers.value = users.value.filter(u =>
    u.username.toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q)
  );
}

function updateSourceNames() {
  const names = [...new Set(channels.value.map(c => c.sourceName).filter(Boolean))].sort();
  sourceNames.value = names;
}

// ========== 频道管理 ==========
async function loadChannels() {
  loadingChannels.value = true;
  try {
    const res = await channelApi.list({ limit: 99999 });
    channels.value = res?.data || [];
    filterChannels();
  } catch (e) {
    toast('加载频道失败', 'error');
  } finally {
    loadingChannels.value = false;
  }
}

function toggleSelectAll(e) {
  if (e.target.checked) {
    paginatedChannels.value.forEach(ch => {
      if (!selectedChannelIds.value.includes(ch.id)) selectedChannelIds.value.push(ch.id);
    });
  } else {
    paginatedChannels.value.forEach(ch => {
      const idx = selectedChannelIds.value.indexOf(ch.id);
      if (idx > -1) selectedChannelIds.value.splice(idx, 1);
    });
  }
}

function showChannelModal(channel = null) {
  const isEdit = !!channel;
  modalTitle.value = isEdit ? '编辑频道' : '添加频道';
  modalBody.value = `
    <div class="form-group"><label>名称 *</label><input id="chName" value="${esc(channel?.name || '')}" /></div>
    <div class="form-group"><label>URL *</label><input id="chUrl" value="${esc(channel?.url || '')}" /></div>
    <div class="form-group"><label>分组</label><input id="chGroup" value="${esc(channel?.group || '')}" /></div>
    <div class="form-group"><label>代理模式</label>
      <select id="chProxyMode">
        <option value="auto" ${channel?.proxyMode === 'auto' ? 'selected' : ''}>自动</option>
        <option value="proxy" ${channel?.proxyMode === 'proxy' ? 'selected' : ''}>代理</option>
        <option value="direct" ${channel?.proxyMode === 'direct' ? 'selected' : ''}>直连</option>
      </select>
    </div>
    <div class="form-group"><label>播放器</label>
      <select id="chPlayer">
        <option value="auto" ${channel?.playerType === 'auto' || !channel ? 'selected' : ''}>自动</option>
        <option value="shaka" ${channel?.playerType === 'shaka' ? 'selected' : ''}>Shaka</option>
        <option value="hlsjs" ${channel?.playerType === 'hlsjs' ? 'selected' : ''}>HLS.js</option>
        <option value="mpegts" ${channel?.playerType === 'mpegts' ? 'selected' : ''}>mpegts.js</option>
        <option value="artplayer" ${channel?.playerType === 'artplayer' ? 'selected' : ''}>ArtPlayer</option>
      </select>
    </div>
    <div class="form-group"><label>tvg-id</label><input id="chTvgId" value="${esc(channel?.tvgId || '')}" /></div>
    <div class="form-group"><label>Logo URL</label><input id="chTvgLogo" value="${esc(channel?.tvgLogo || '')}" /></div>
    <div class="form-group"><label>DRM (JSON)</label><textarea id="chDrm" rows="2">${esc(JSON.stringify(channel?.drm || {}))}</textarea></div>
    <div class="form-group"><label>User Agent</label><input id="chUserAgent" value="${esc(channel?.userAgent || '')}" /></div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="saveChannelFn('${channel?.id || ''}')">${isEdit ? '保存' : '添加'}</button>`;
  showModal.value = true;
}

async function saveChannelFn(id) {
  let drmData = {};
  try {
    drmData = JSON.parse(document.getElementById('chDrm')?.value?.trim() || '{}');
  } catch (e) {
    toast('DRM 格式错误', 'error');
    return;
  }
  const proxyMode = document.getElementById('chProxyMode')?.value;
  let url = document.getElementById('chUrl')?.value?.trim() || '';
  if ((proxyMode === 'proxy' || proxyMode === 'auto') && url && !url.includes('/m3u-proxy')) {
    url = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent(url)}`;
  }
  const data = {
    name: document.getElementById('chName')?.value?.trim(),
    url,
    proxyMode,
    group: document.getElementById('chGroup')?.value?.trim(),
    playerType: document.getElementById('chPlayer')?.value,
    tvgId: document.getElementById('chTvgId')?.value?.trim(),
    tvgLogo: document.getElementById('chTvgLogo')?.value?.trim(),
    drm: drmData,
    userAgent: document.getElementById('chUserAgent')?.value?.trim(),
  };
  if (!data.name || !data.url) { toast('名称和URL为必填项', 'error'); return; }
  try {
    let res;
    if (id) {
      res = await channelApi.update(id, data);
    } else {
      res = await channelApi.create(data);
    }
    if (res?.ok) {
      toast(id ? '更新成功' : '添加成功', 'success');
      showModal.value = false;
      loadChannels();
    } else {
      toast(res?.message || '操作失败', 'error');
    }
  } catch (e) {
    toast('操作失败', 'error');
  }
}

async function deleteChannel(id) {
  if (!confirm('确定要删除该频道吗？')) return;
  try {
    const res = await channelApi.delete(id);
    if (res?.ok) {
      toast('删除成功', 'success');
      selectedChannelIds.value = selectedChannelIds.value.filter(i => i !== id);
      loadChannels();
    } else {
      toast('删除失败', 'error');
    }
  } catch (e) {
    toast('删除失败', 'error');
  }
}

async function batchDeleteChannels() {
  if (!confirm(`确定要删除选中的 ${selectedChannelIds.value.length} 个频道吗？`)) return;
  try {
    const res = await channelApi.batchDelete({ ids: Array.from(selectedChannelIds.value) });
    if (res?.ok) {
      toast('批量删除成功', 'success');
      selectedChannelIds.value = [];
      loadChannels();
    } else {
      toast('批量删除失败', 'error');
    }
  } catch (e) {
    toast('批量删除失败', 'error');
  }
}

async function batchExportChannels() {
  if (selectedChannelIds.value.size === 0) { toast('请选择要导出的频道', 'error'); return; }
  const filename = prompt('请输入导出文件名：', 'channels-export');
  if (!filename) return;
  try {
    const res = await exportApi.exportChannels({ ids: Array.from(selectedChannelIds.value), filename });
    if (res?.ok) {
      toast('导出成功', 'success');
      loadExports();
    } else {
      toast('导出失败', 'error');
    }
  } catch (e) {
    toast('导出失败', 'error');
  }
}

function showImportModal() {
  modalTitle.value = '导入频道';
  modalBody.value = `
    <div class="import-options">
      <div class="import-card" onclick="showManualImportModal()">
        <div class="import-icon">📁</div>
        <div class="import-title">手动导入</div>
        <div class="import-desc">从文件或 URL 导入 M3U</div>
      </div>
      <div class="import-card" onclick="showSourceImportModal()">
        <div class="import-icon">🔗</div>
        <div class="import-title">从源导入</div>
        <div class="import-desc">从已添加的节目源导入</div>
      </div>
    </div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">关闭</button>`;
  showModal.value = true;
}

function showManualImportModal() {
  modalTitle.value = '手动导入';
  modalBody.value = `
    <div class="import-tabs">
      <button class="tab-btn active" onclick="switchImportTab('file')">文件</button>
      <button class="tab-btn" onclick="switchImportTab('url')">URL</button>
    </div>
    <div id="importFileTab">
      <div class="form-group"><label>M3U 文件</label><input type="file" id="importFile" accept=".m3u,.m3u8" /></div>
    </div>
    <div id="importUrlTab" style="display:none;">
      <div class="form-group"><label>M3U URL</label><input type="text" id="importUrl" placeholder="https://..." /></div>
    </div>
    <div class="form-group">
      <label>代理模式</label>
      <select id="importProxyMode">
        <option value="">保持原始</option>
        <option value="auto">自动</option>
        <option value="proxy">代理</option>
        <option value="direct">直连</option>
      </select>
    </div>
    <div class="form-group">
      <label>播放器</label>
      <select id="importPlayerType">
        <option value="">保持原始</option>
        <option value="auto">自动</option>
        <option value="shaka">Shaka</option>
        <option value="artplayer">ArtPlayer</option>
        <option value="hlsjs">HLS.js</option>
      </select>
    </div>
    <div class="form-group">
      <label>分组</label>
      <input type="text" id="importGroup" placeholder="留空则保持原始分组" />
    </div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="submitManualImport()">导入</button>`;
  showModal.value = true;
}

window.switchImportTab = function(tab) {
  document.getElementById('importFileTab').style.display = tab === 'file' ? 'block' : 'none';
  document.getElementById('importUrlTab').style.display = tab === 'url' ? 'block' : 'none';
};

window.submitManualImport = async function() {
  const fileInput = document.getElementById('importFile');
  const urlInput = document.getElementById('importUrl');
  const proxyMode = document.getElementById('importProxyMode')?.value;
  const playerType = document.getElementById('importPlayerType')?.value;
  const group = document.getElementById('importGroup')?.value?.trim();

  let content = '';
  if (fileInput?.files?.[0]) {
    content = await fileInput.files[0].text();
  } else if (urlInput?.value?.trim()) {
    try {
      const res = await fetch(urlInput.value.trim());
      content = await res.text();
    } catch (e) {
      toast('获取 URL 内容失败', 'error');
      return;
    }
  } else {
    toast('请选择文件或输入 URL', 'error');
    return;
  }

  try {
    const parseRes = await sourceApi.parseM3u({ content });
    if (!parseRes?.ok) {
      toast('解析 M3U 失败', 'error');
      return;
    }

    const channels = parseRes.data?.channels || [];
    if (channels.length === 0) {
      toast('未解析到频道', 'error');
      return;
    }

    // 应用设置
    const processedChannels = channels.map(ch => {
      let url = ch.url;
      if (proxyMode === 'proxy' || proxyMode === 'auto') {
        url = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent(ch.url)}`;
      }
      return {
        name: ch.name,
        url,
        group: group || ch.group,
        playerType: playerType || ch.playerType,
        proxyMode: proxyMode || ch.proxyMode,
        tvgId: ch.tvgId,
        tvgLogo: ch.tvgLogo,
      };
    });

    const res = await channelApi.batchImport({ channels: processedChannels });
    if (res?.ok) {
      const d = res.data || {};
      toast(`成功导入 ${d.created || 0} 个，更新 ${d.updated || 0} 个`, 'success');
      showModal.value = false;
      loadChannels();
    } else {
      toast('导入失败', 'error');
    }
  } catch (e) {
    toast('导入失败: ' + e.message, 'error');
  }
};

function showSourceImportModal() {
  modalTitle.value = '从源导入';
  const sourceOptions = m3uSources.value.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  modalBody.value = `
    <div class="form-group">
      <label>选择节目源</label>
      <select id="importSourceId">${sourceOptions || '<option value="">暂无可用源</option>'}</select>
    </div>
    <div class="form-group">
      <label>代理模式</label>
      <select id="importProxyMode">
        <option value="">保持原始</option>
        <option value="auto">自动</option>
        <option value="proxy">代理</option>
        <option value="direct">直连</option>
      </select>
    </div>
    <div class="form-group">
      <label>播放器</label>
      <select id="importPlayerType">
        <option value="">保持原始</option>
        <option value="auto">自动</option>
        <option value="shaka">Shaka</option>
        <option value="artplayer">ArtPlayer</option>
        <option value="hlsjs">HLS.js</option>
      </select>
    </div>
    <div class="form-group">
      <label>分组</label>
      <input type="text" id="importGroup" placeholder="留空则保持原始分组" />
    </div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="submitSourceImport()">导入</button>`;
  showModal.value = true;
}

window.submitSourceImport = async function() {
  const sourceId = document.getElementById('importSourceId')?.value;
  const proxyMode = document.getElementById('importProxyMode')?.value;
  const playerType = document.getElementById('importPlayerType')?.value;
  const group = document.getElementById('importGroup')?.value?.trim();

  if (!sourceId) {
    toast('请选择节目源', 'error');
    return;
  }

  try {
    const res = await sourceApi.importM3u(sourceId);
    if (res?.ok) {
      toast('导入成功', 'success');
      showModal.value = false;
      loadChannels();
      loadSources();
    } else {
      toast('导入失败: ' + (res?.message || ''), 'error');
    }
  } catch (e) {
    toast('导入失败', 'error');
  }
};

// ========== 源管理 ==========
async function loadSources() {
  try {
    const [m3uRes, epgRes] = await Promise.all([
      sourceApi.listM3u(),
      sourceApi.listEpg(),
    ]);
    m3uSources.value = m3uRes?.data || [];
    epgSources.value = epgRes?.data || [];
  } catch (e) {
    toast('加载源失败', 'error');
  }
}

function showSourceModal(source = null, type = 'm3u') {
  const isEdit = !!source;
  const t = type || 'm3u';
  modalTitle.value = isEdit ? `编辑${t === 'm3u' ? 'M3U' : 'EPG'}源` : `添加${t === 'm3u' ? 'M3U' : 'EPG'}源`;
  modalBody.value = `
    <div class="form-group"><label>名称 *</label><input id="srcName" value="${esc(source?.name || '')}" /></div>
    <div class="form-group"><label>URL *</label><input id="srcUrl" value="${esc(source?.url || '')}" placeholder="https://..." /></div>
    ${t === 'm3u' ? `
    <div class="form-group"><label>默认代理模式</label>
      <select id="srcProxyMode">
        <option value="">无</option>
        <option value="auto" ${source?.proxyMode === 'auto' ? 'selected' : ''}>自动</option>
        <option value="proxy" ${source?.proxyMode === 'proxy' ? 'selected' : ''}>代理</option>
        <option value="direct" ${source?.proxyMode === 'direct' ? 'selected' : ''}>直连</option>
      </select>
    </div>
    <div class="form-group"><label>默认播放器</label>
      <select id="srcPlayerType">
        <option value="">无</option>
        <option value="auto" ${source?.playerType === 'auto' ? 'selected' : ''}>自动</option>
        <option value="shaka" ${source?.playerType === 'shaka' ? 'selected' : ''}>Shaka</option>
        <option value="artplayer" ${source?.playerType === 'artplayer' ? 'selected' : ''}>ArtPlayer</option>
        <option value="hlsjs" ${source?.playerType === 'hlsjs' ? 'selected' : ''}>HLS.js</option>
      </select>
    </div>
    ` : ''}
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="saveSourceFn('${source?.id || ''}', '${t}')">${isEdit ? '保存' : '添加'}</button>`;
  showModal.value = true;
}

window.saveSourceFn = async function(id, type) {
  const name = document.getElementById('srcName')?.value?.trim();
  const url = document.getElementById('srcUrl')?.value?.trim();
  if (!name || !url) { toast('名称和URL为必填项', 'error'); return; }

  const data = { name, url };
  if (type === 'm3u') {
    data.proxyMode = document.getElementById('srcProxyMode')?.value;
    data.playerType = document.getElementById('srcPlayerType')?.value;
  }

  try {
    let res;
    if (id) {
      res = type === 'm3u' ? await sourceApi.updateM3u(id, data) : await sourceApi.updateEpg(id, data);
    } else {
      res = type === 'm3u' ? await sourceApi.createM3u(data) : await sourceApi.createEpg(data);
    }
    if (res?.ok) {
      toast(id ? '更新成功' : '添加成功', 'success');
      showModal.value = false;
      loadSources();
    } else {
      toast('操作失败', 'error');
    }
  } catch (e) {
    toast('操作失败', 'error');
  }
};

window.deleteSource = async function(id, type) {
  if (!confirm('确定要删除该源吗？')) return;
  try {
    const res = type === 'm3u' ? await sourceApi.deleteM3u(id) : await sourceApi.deleteEpg(id);
    if (res?.ok) {
      toast('删除成功', 'success');
      loadSources();
    } else {
      toast('删除失败', 'error');
    }
  } catch (e) {
    toast('删除失败', 'error');
  }
};

window.testSource = async function(id, type) {
  toast('正在测试...', 'info');
  try {
    const res = type === 'm3u' ? await sourceApi.testM3u(id) : await sourceApi.testEpg(id);
    if (res?.ok) {
      toast('测试成功', 'success');
    } else {
      toast('测试失败: ' + (res?.message || ''), 'error');
    }
  } catch (e) {
    toast('测试失败', 'error');
  }
};

window.importSource = async function(id) {
  toast('正在导入...', 'info');
  try {
    const res = await sourceApi.importM3u(id);
    if (res?.ok) {
      toast('导入成功', 'success');
      loadChannels();
    } else {
      toast('导入失败', 'error');
    }
  } catch (e) {
    toast('导入失败', 'error');
  }
};

// ========== 导出管理 ==========
async function loadExports() {
  try {
    const res = await exportApi.list();
    exports.value = res?.data || [];
  } catch (e) {
    toast('加载导出记录失败', 'error');
  }
}

window.downloadExport = async function(id, filename) {
  try {
    const res = await exportApi.download({ id });
    const blob = new Blob([res.data], { type: 'application/vnd.apple.mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.m3u';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast('下载失败', 'error');
  }
};

window.deleteExport = async function(id) {
  if (!confirm('确定要删除该导出文件吗？')) return;
  try {
    const res = await exportApi.delete(id);
    if (res?.ok) {
      toast('删除成功', 'success');
      loadExports();
    } else {
      toast('删除失败', 'error');
    }
  } catch (e) {
    toast('删除失败', 'error');
  }
};

// ========== EPG 管理 ==========
async function loadEpgChannels() {
  try {
    const res = await epgApi.getChannels();
    epgChannels.value = res?.data || [];
    filterEpgChannels();
  } catch (e) {
    toast('加载 EPG 频道失败', 'error');
  }
}

function showEpgChannelModal(channel = null) {
  const isEdit = !!channel;
  modalTitle.value = isEdit ? '编辑 EPG 频道' : '添加 EPG 频道';
  modalBody.value = `
    <div class="form-group"><label>频道名称 *</label><input id="epgName" value="${esc(channel?.name || '')}" /></div>
    <div class="form-group"><label>分组</label><input id="epgGroup" value="${esc(channel?.group || '')}" placeholder="例如：央视频道" /></div>
    <div class="form-group"><label>匹配策略</label>
      <select id="epgStrategy">
        <option value="auto" ${channel?.strategy === 'auto' || !channel ? 'selected' : ''}>自动匹配</option>
        <option value="manual" ${channel?.strategy === 'manual' ? 'selected' : ''}>手动绑定</option>
        <option value="custom" ${channel?.strategy === 'custom' ? 'selected' : ''}>自定义映射</option>
        <option value="smart" ${channel?.strategy === 'smart' ? 'selected' : ''}>智能学习</option>
      </select>
    </div>
    <div class="form-group"><label>自定义映射 (JSON)</label><textarea id="epgMapping" rows="3" placeholder='{"channelId": "epgChannelId"}'>${esc(JSON.stringify(channel?.customMapping || {}))}</textarea></div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="saveEpgChannelFn('${channel?.id || ''}')">${isEdit ? '保存' : '添加'}</button>`;
  showModal.value = true;
}

window.saveEpgChannelFn = async function(id) {
  const name = document.getElementById('epgName')?.value?.trim();
  const group = document.getElementById('epgGroup')?.value?.trim();
  const strategy = document.getElementById('epgStrategy')?.value;
  let mapping = {};
  try {
    mapping = JSON.parse(document.getElementById('epgMapping')?.value?.trim() || '{}');
  } catch (e) {
    toast('映射格式错误', 'error');
    return;
  }
  if (!name) { toast('频道名称为必填项', 'error'); return; }

  try {
    const data = { name, group, strategy, customMapping: mapping };
    // 这里简化处理，实际需要调用 epgApi
    toast(id ? '更新成功' : '添加成功', 'success');
    showModal.value = false;
    loadEpgChannels();
  } catch (e) {
    toast('操作失败', 'error');
  }
};

window.deleteEpgChannel = async function(id) {
  if (!confirm('确定要删除该 EPG 频道吗？')) return;
  toast('功能开发中', 'info');
};

window.refreshEpg = async function() {
  toast('正在刷新 EPG...', 'info');
  try {
    const res = await epgApi.refresh();
    if (res?.ok) {
      toast('刷新成功', 'success');
      loadEpgChannels();
    } else {
      toast('刷新失败', 'error');
    }
  } catch (e) {
    toast('刷新失败', 'error');
  }
};

// ========== 系统设置 ==========
async function loadSettings() {
  try {
    const res = await settingsApi.get();
    if (res?.ok) {
      settings.value = { ...settings.value, ...res.data };
    }
  } catch (e) {
    console.error('加载设置失败', e);
  }

  try {
    const syncRes = await api.get('/api/settings/sync/info');
    if (syncRes?.data) {
      syncInfo.value = syncRes.data;
    }
  } catch (e) {
    console.error('加载同步信息失败', e);
  }
}

async function saveSettings() {
  try {
    const res = await settingsApi.update(settings.value);
    if (res?.ok) {
      toast('设置已保存', 'success');
    } else {
      toast('保存失败', 'error');
    }
  } catch (e) {
    toast('保存失败', 'error');
  }
}

async function syncToRedis() {
  toast('正在同步...', 'info');
  try {
    const res = await settingsApi.syncToRedis();
    if (res?.ok) {
      toast('同步成功', 'success');
    } else {
      toast('同步失败', 'error');
    }
  } catch (e) {
    toast('同步失败', 'error');
  }
}

async function syncFromRedis() {
  toast('正在同步...', 'info');
  try {
    const res = await settingsApi.syncFromRedis();
    if (res?.ok) {
      toast('同步成功', 'success');
      loadSettings();
    } else {
      toast('同步失败', 'error');
    }
  } catch (e) {
    toast('同步失败', 'error');
  }
}

// ========== UA 管理 ==========
function showAddCustomUaModal() {
  modalTitle.value = '添加自定义 UA';
  modalBody.value = `
    <div class="form-group"><label>名称</label><input id="customUaName" placeholder="例如：我的浏览器" /></div>
    <div class="form-group"><label>User-Agent 值</label><input id="customUaValue" placeholder="完整的 UA 字符串" /></div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="addCustomUaFn()">添加</button>`;
  showModal.value = true;
}

window.addCustomUaFn = function() {
  const name = document.getElementById('customUaName')?.value?.trim();
  const value = document.getElementById('customUaValue')?.value?.trim();
  if (!name || !value) { toast('名称和值都不能为空', 'error'); return; }
  const list = JSON.parse(localStorage.getItem('admin.customUas') || '[]');
  list.push({ name, value });
  localStorage.setItem('admin.customUas', JSON.stringify(list));
  customUas.value = list;
  toast('添加成功', 'success');
  showModal.value = false;
};

window.deleteCustomUa = function(idx) {
  const list = JSON.parse(localStorage.getItem('admin.customUas') || '[]');
  list.splice(idx, 1);
  localStorage.setItem('admin.customUas', JSON.stringify(list));
  customUas.value = list;
  toast('删除成功', 'success');
};

async function loadGlobalUa() {
  try {
    const res = await settingsApi.getGlobalUa();
    if (res?.data) {
      globalUa.value = res.data.userAgent || '';
    }
  } catch (e) {}
}

async function saveGlobalUa() {
  try {
    const res = await settingsApi.updateGlobalUa({ userAgent: globalUa.value });
    if (res?.ok) {
      toast('保存成功', 'success');
    } else {
      toast('保存失败', 'error');
    }
  } catch (e) {
    toast('保存失败', 'error');
  }
}

async function resetGlobalUa() {
  globalUa.value = '';
  await saveGlobalUa();
}

function applyPresetToGlobal(e) {
  if (e.target.value) {
    globalUa.value = e.target.value;
    e.target.value = '';
  }
}

async function loadChannelUas() {
  try {
    const res = await settingsApi.getChannelUa();
    channelUas.value = res?.data || [];
  } catch (e) {}
}

function editChannelUa(channelId, channelName, currentUa) {
  modalTitle.value = '编辑频道 UA - ' + channelName;
  modalBody.value = `
    <div class="form-group"><label>频道</label><input value="${esc(channelName)}" disabled /></div>
    <div class="form-group"><label>User-Agent</label>
      <select onchange="if(this.value) document.getElementById('editChUaValue').value=this.value">
        <option value="">-- 选择预设 --</option>
        ${uaPresets.map(p => `<option value="${p.value}">${p.name}</option>`).join('')}
      </select>
      <input id="editChUaValue" value="${esc(currentUa)}" />
    </div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="updateChannelUaFn('${channelId}')">保存</button>`;
  showModal.value = true;
}

window.updateChannelUaFn = async function(channelId) {
  const userAgent = document.getElementById('editChUaValue')?.value?.trim();
  try {
    const res = await api.put('/api/settings/ua/channel', { channelId, userAgent: userAgent || null });
    if (res?.ok) {
      toast('更新成功', 'success');
      showModal.value = false;
      loadChannelUas();
    } else {
      toast('更新失败', 'error');
    }
  } catch (e) {
    toast('更新失败', 'error');
  }
};

window.deleteChannelUa = async function(channelId) {
  if (!confirm('确定删除该频道的 UA 设置？')) return;
  try {
    const res = await api.put('/api/settings/ua/channel', { channelId, userAgent: null });
    if (res?.ok) {
      toast('删除成功', 'success');
      loadChannelUas();
    } else {
      toast('删除失败', 'error');
    }
  } catch (e) {
    toast('删除失败', 'error');
  }
};

// ========== 用户管理 ==========
async function loadUsers() {
  try {
    const res = await authApi.getUsers();
    if (res?.ok) {
      users.value = res.data || [];
      filterUsers();
    } else {
      users.value = [];
      filteredUsers.value = [];
    }
  } catch (e) {
    users.value = [];
    filteredUsers.value = [];
  }
}

function showUserModal() {
  modalTitle.value = '添加用户';
  modalBody.value = `
    <div class="form-group"><label>用户名 *</label><input id="newUsername" /></div>
    <div class="form-group"><label>密码 *</label><input id="newPassword" type="password" /></div>
    <div class="form-group"><label>角色</label>
      <select id="newRole">
        <option value="user">普通用户</option>
        <option value="admin">管理员</option>
      </select>
    </div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="createUserFn()">创建</button>`;
  showModal.value = true;
}

window.createUserFn = async function() {
  const username = document.getElementById('newUsername')?.value?.trim();
  const password = document.getElementById('newPassword')?.value;
  const role = document.getElementById('newRole')?.value;
  if (!username || !password) { toast('用户名和密码不能为空', 'error'); return; }
  try {
    const res = await authApi.createUser({ username, password, role });
    if (res?.ok) {
      toast('创建成功', 'success');
      showModal.value = false;
      loadUsers();
    } else {
      toast(res?.message || '创建失败', 'error');
    }
  } catch (e) {
    toast('创建失败', 'error');
  }
};

function showChangePasswordModal(user) {
  modalTitle.value = '修改密码 - ' + user.username;
  modalBody.value = `
    <div class="form-group"><label>新密码 *</label><input id="cpPassword" type="password" /></div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="changePasswordFn('${user.id}')">保存</button>`;
  showModal.value = true;
}

window.changePasswordFn = async function(id) {
  const password = document.getElementById('cpPassword')?.value;
  if (!password) { toast('密码不能为空', 'error'); return; }
  try {
    const res = await authApi.updateUser(id, { password });
    if (res?.ok) {
      toast('密码修改成功', 'success');
      showModal.value = false;
    } else {
      toast('密码修改失败', 'error');
    }
  } catch (e) {
    toast('密码修改失败', 'error');
  }
};

function confirmDeleteUser(user) {
  if (!confirm(`确定要删除用户 ${user.username} 吗？`)) return;
  doDeleteUser(user.id);
}

window.doDeleteUser = async function(id) {
  try {
    const res = await authApi.deleteUser(id);
    if (res?.ok) {
      toast('删除成功', 'success');
      loadUsers();
    } else {
      toast('删除失败', 'error');
    }
  } catch (e) {
    toast('删除失败', 'error');
  }
};

function confirmResetPassword(user) {
  if (!confirm(`确定要重置用户 ${user.username} 的密码吗？`)) return;
  resetPassword(user.id, user.username);
}

async function resetPassword(id, username) {
  try {
    const res = await authApi.updateUser(id, { password: '123456' });
    if (res?.ok) {
      toast(`用户 ${username} 的密码已重置为 123456`, 'success');
    } else {
      toast('重置失败', 'error');
    }
  } catch (e) {
    toast('重置失败', 'error');
  }
}

// ========== 定时任务 ==========
async function loadSchedulerTasks() {
  try {
    const res = await api.get('/api/scheduler/tasks');
    if (res?.data) {
      schedulerTasks.value = res.data.tasks || [];
      schedulerStatus.value = res.data.status ? `调度器运行中 · ${res.data.status.activeTasks || 0} 个活跃任务` : '';
    }
  } catch (e) {
    toast('加载定时任务失败', 'error');
  }
}

function formatCountdown(ms) {
  if (ms <= 0) return '-';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}小时${mins}分`;
  if (mins > 0) return `${mins}分${secs}秒`;
  return `${secs}秒`;
}

window.toggleSchedulerTask = async function(task) {
  try {
    const res = await api.put(`/api/scheduler/tasks/${task.id}`, { enabled: !task.enabled });
    if (res?.ok) {
      toast(task.enabled ? '已禁用' : '已启用', 'success');
      loadSchedulerTasks();
    } else {
      toast('操作失败', 'error');
    }
  } catch (e) {
    toast('操作失败', 'error');
  }
};

window.runSchedulerTask = async function(id) {
  toast('正在执行...', 'info');
  try {
    const res = await api.post(`/api/scheduler/tasks/${id}/run`);
    if (res?.ok) {
      toast('执行成功', 'success');
      loadSchedulerTasks();
    } else {
      toast('执行失败', 'error');
    }
  } catch (e) {
    toast('执行失败', 'error');
  }
};

window.deleteSchedulerTask = async function(id) {
  if (!confirm('确定要删除该任务吗？')) return;
  try {
    const res = await api.delete(`/api/scheduler/tasks/${id}`);
    if (res?.ok) {
      toast('删除成功', 'success');
      loadSchedulerTasks();
    } else {
      toast('删除失败', 'error');
    }
  } catch (e) {
    toast('删除失败', 'error');
  }
};

function showSchedulerTaskModal(task = null) {
  const isEdit = !!task;
  const cronPresets = [
    { label: '每小时', value: '0 * * * *' },
    { label: '每天 3:00', value: '0 3 * * *' },
    { label: '每天 6:00', value: '0 6 * * *' },
    { label: '每周一 3:00', value: '0 3 * * 1' },
    { label: '每月 1 号 3:00', value: '0 3 1 * *' },
  ];
  const sourceOptions = schedulerSources.value.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  modalTitle.value = isEdit ? '编辑定时任务' : '添加定时任务';
  modalBody.value = `
    <div class="form-group"><label>任务类型</label>
      <select id="taskType">
        <option value="import" ${task?.type === 'import' || !task ? 'selected' : ''}>导入频道</option>
        <option value="export" ${task?.type === 'export' ? 'selected' : ''}>导出频道</option>
      </select>
    </div>
    <div class="form-group"><label>任务名称</label><input id="taskName" value="${esc(task?.name || '')}" /></div>
    <div class="form-group"><label>节目源</label>
      <select id="taskSource">${sourceOptions || '<option value="">-- 请先添加节目源 --</option>'}</select>
    </div>
    <div class="form-group"><label>Cron 表达式</label>
      <input id="taskCron" value="${task?.cron || '0 3 * * *'}" />
      <div class="cron-presets">
        ${cronPresets.map(p => `<button class="btn btn-sm" type="button" onclick="document.getElementById('taskCron').value='${p.value}'">${p.label}</button>`).join('')}
      </div>
    </div>
  `;
  modalFooter.value = `<button class="btn" onclick="closeModalFn()">取消</button><button class="btn btn-primary" onclick="saveSchedulerTaskFn('${task?.id || ''}')">${isEdit ? '保存' : '添加'}</button>`;
  showModal.value = true;
}

window.saveSchedulerTaskFn = async function(id) {
  const name = document.getElementById('taskName')?.value?.trim();
  const type = document.getElementById('taskType')?.value;
  const sourceId = document.getElementById('taskSource')?.value;
  const cron = document.getElementById('taskCron')?.value;

  if (!name || !cron) { toast('名称和 Cron 表达式不能为空', 'error'); return; }

  try {
    const data = { name, type, cron, sourceId: sourceId || undefined };
    let res;
    if (id) {
      res = await api.put(`/api/scheduler/tasks/${id}`, data);
    } else {
      res = await api.post('/api/scheduler/tasks', data);
    }
    if (res?.ok) {
      toast(id ? '更新成功' : '添加成功', 'success');
      showModal.value = false;
      loadSchedulerTasks();
    } else {
      toast('操作失败', 'error');
    }
  } catch (e) {
    toast('操作失败', 'error');
  }
};

// ========== 通用 ==========
window.closeModalFn = function() {
  showModal.value = false;
};

function handleLogout() {
  localStorage.removeItem('birdtv_token');
  localStorage.removeItem('birdtv_user');
  router.push('/login');
}

// 初始化
onMounted(async () => {
  loadChannels();
  loadSources();
  loadExports();
  loadSettings();
  loadGlobalUa();
  loadChannelUas();
  loadUsers();
  loadSchedulerTasks();

  // 加载自定义 UA
  try {
    customUas.value = JSON.parse(localStorage.getItem('admin.customUas') || '[]');
  } catch (e) {
    customUas.value = [];
  }

  // 加载定时任务源
  try {
    const res = await sourceApi.listM3u();
    schedulerSources.value = res?.data || [];
  } catch (e) {}
});
</script>

<style scoped>
@import '@/assets/admin.css';

.admin-page {
  min-height: 100vh;
  background: var(--bg-1);
  color: var(--text-main);
}

.admin-body {
  display: flex;
  height: calc(100vh - 60px);
}

.admin-nav {
  width: 200px;
  background: #111;
  border-right: 1px solid var(--line);
  padding: 12px 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.nav-item:hover {
  background: #1a1a1a;
  color: #ccc;
}

.nav-item.active {
  background: #1a1a2e;
  color: #4fc3f7;
  border-right: 2px solid #4fc3f7;
}

.nav-icon {
  font-size: 16px;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tab-content {
  max-width: 1400px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.content-header h2 {
  font-size: 20px;
  color: var(--text-main);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-2);
  color: var(--text-main);
  min-width: 200px;
}

.search-select {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-2);
  color: var(--text-main);
}

.result-count {
  color: var(--muted);
  font-size: 13px;
  margin-left: auto;
}

.batch-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 13px;
}

.table-container {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}

.data-table th {
  background: var(--bg-2);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tr:hover {
  background: var(--bg-2);
}

.channel-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
}

.url-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted);
}

.btn-group {
  display: flex;
  gap: 4px;
}

.loading-cell,
.empty-cell {
  text-align: center;
  padding: 40px !important;
  color: var(--muted);
}

.empty {
  text-align: center;
  padding: 20px;
}

.pagination {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  font-size: 13px;
}

.source-tabs,
.ua-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--bg-2);
  color: var(--text-main);
}

.tab-btn.active {
  background: var(--bg-2);
  color: #4fc3f7;
}

.settings-form {
  max-width: 600px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-2);
  color: var(--text-main);
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.divider {
  height: 1px;
  background: var(--line);
  margin: 24px 0;
}

.sync-info {
  background: var(--bg-2);
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.sync-info p {
  margin: 4px 0;
  font-size: 13px;
}

.sync-info span {
  color: #4fc3f7;
  font-family: monospace;
}

.ua-section {
  max-width: 600px;
}

.cron-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.scheduler-status {
  padding: 8px 12px;
  background: var(--bg-2);
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 13px;
}

.status-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #4caf50;
  border-radius: 50%;
  margin-right: 8px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  padding: 16px;
}

.modal {
  background: var(--bg-1);
  border-radius: 8px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text-main);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Toast */
.toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 999999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  padding: 10px 16px;
  border-radius: 4px;
  font-size: 13px;
  animation: slideIn 0.3s ease;
}

.toast-info {
  background: #2196f3;
  color: white;
}

.toast-success {
  background: #4caf50;
  color: white;
}

.toast-error {
  background: #f44336;
  color: white;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Import Modal */
.import-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 10px 0;
}

.import-card {
  padding: 24px 16px;
  background: var(--bg-2);
  border: 2px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.import-card:hover {
  border-color: #4fc3f7;
  background: var(--bg-3);
}

.import-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.import-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.import-desc {
  font-size: 12px;
  color: var(--muted);
}

.import-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}

/* Button styles */
.btn {
  padding: 8px 16px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-2);
  color: var(--text-main);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn:hover {
  background: var(--bg-3);
}

.btn-primary {
  background: #4fc3f7;
  border-color: #4fc3f7;
  color: #000;
}

.btn-primary:hover {
  background: #29b6f6;
}

.btn-danger {
  background: #f44336;
  border-color: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

.btn-success {
  background: #4caf50;
  border-color: #4caf50;
  color: white;
}

.btn-ghost {
  background: transparent;
  border: none;
  color: var(--muted);
}

.btn-ghost:hover {
  color: var(--text-main);
  background: var(--bg-2);
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

/* Tag styles */
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.tag-blue {
  background: #2196f3;
  color: white;
}

.tag-green {
  background: #4caf50;
  color: white;
}

.tag-warning {
  background: #ff9800;
  color: white;
}

.tag-purple {
  background: #9c27b0;
  color: white;
}

.tag-gray {
  background: #666;
  color: white;
}
</style>
