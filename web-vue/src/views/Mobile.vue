<template>
  <div class="mobile-page page-container">
    <header class="page-header">
      <div class="header-left">
        <h1 class="app-title">BirdTV</h1>
      </div>
      <div class="header-right">
        <router-link to="/" class="btn btn-ghost">桌面版</router-link>
        <button class="btn btn-ghost" @click="handleLogout">退出</button>
      </div>
    </header>

    <main class="mobile-main">
      <div class="player-placeholder">
        <div class="placeholder-icon">&#9654;</div>
        <h2>移动端播放器</h2>
        <p>移动端播放器组件将逐步从 web/mobile.html 迁移至此</p>
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
.mobile-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-title {
  font-size: 18px;
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
  font-size: 48px;
  margin-bottom: 12px;
  color: #333;
}

.player-placeholder h2 {
  font-size: 20px;
  color: #888;
  margin-bottom: 8px;
}

.player-placeholder p {
  font-size: 14px;
}
</style>
