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
        <div class="content-placeholder">
          <h2>{{ currentLabel }}</h2>
          <p>该模块将从 web/src/admin/ 逐步迁移至此</p>
          <p class="sub">API 已就绪，UI 组件逐步开发</p>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const activeTab = ref('channels');

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

const currentLabel = computed(() => {
  return navItems.find(i => i.key === activeTab.value)?.label || '';
});

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.admin-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.admin-nav {
  width: 200px;
  background: #111;
  border-right: 1px solid #2a2a2a;
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

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: #4fc3f7;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content-placeholder {
  text-align: center;
  padding: 80px 20px;
  color: #555;
}

.content-placeholder h2 {
  font-size: 22px;
  color: #888;
  margin-bottom: 12px;
}

.content-placeholder p {
  font-size: 14px;
  margin-bottom: 6px;
}

.sub {
  color: #444;
  font-size: 12px;
}
</style>
