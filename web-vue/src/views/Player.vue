<template>
  <div class="player-page page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="app-title">BirdTV</h1>
      </div>
      <div class="header-right">
        <router-link to="/admin" class="btn btn-ghost" v-if="authStore.isAdmin">管理后台</router-link>
        <router-link to="/mobile" class="btn btn-ghost">移动版</router-link>
        <button class="btn btn-ghost" @click="handleLogout">退出</button>
      </div>
    </header>

    <main class="player-main">
      <div class="player-placeholder">
        <div class="placeholder-icon">&#9654;</div>
        <h2>播放器</h2>
        <p>播放器组件将逐步从 web/src/modules/ 迁移至此</p>
        <p class="hint">包含：频道列表、EPG 节目单、Shaka Player、DRM 支持等</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
.player-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  color: #4fc3f7;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-placeholder {
  text-align: center;
  color: #555;
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 16px;
  color: #333;
}

.player-placeholder h2 {
  font-size: 24px;
  color: #888;
  margin-bottom: 8px;
}

.player-placeholder p {
  font-size: 14px;
  margin-bottom: 4px;
}

.hint {
  color: #444 !important;
  font-size: 12px !important;
  margin-top: 12px !important;
}
</style>
