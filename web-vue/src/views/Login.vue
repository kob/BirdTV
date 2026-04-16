<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">BirdTV</h1>
      <p class="login-subtitle">IPTV 管理系统</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label>用户名</label>
          <input
            v-model="username"
            type="text"
            class="input"
            placeholder="请输入用户名"
            autocomplete="username"
            required
          />
        </div>

        <div class="form-group">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            class="input"
            placeholder="请输入密码"
            autocomplete="current-password"
            required
          />
        </div>

        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <button type="submit" class="btn btn-primary login-btn" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <button class="btn-link" @click="$router.push('/setup')">⚙️ 重设服务器地址</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');

async function handleLogin() {
  if (!username.value || !password.value) return;

  loading.value = true;
  errorMsg.value = '';

  try {
    const data = await authStore.login(username.value, password.value);
    if (data.ok) {
      const redirect = route.query.redirect || '/';
      router.push(redirect);
    } else {
      errorMsg.value = data.error || '登录失败';
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.error || '网络错误';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
}

.login-card {
  width: 400px;
  padding: 40px;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.login-title {
  font-size: 32px;
  font-weight: 700;
  text-align: center;
  color: #4fc3f7;
  margin-bottom: 4px;
}

.login-subtitle {
  text-align: center;
  color: #666;
  margin-bottom: 32px;
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  color: #888;
  font-weight: 500;
}

.form-group .input {
  width: 100%;
  padding: 10px 14px;
  font-size: 15px;
}

.error-msg {
  color: #ef5350;
  font-size: 13px;
  padding: 8px 12px;
  background: rgba(239, 83, 80, 0.1);
  border-radius: 6px;
}

.login-btn {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  margin-top: 8px;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-link {
  background: none;
  border: none;
  color: #555;
  font-size: 12px;
  cursor: pointer;
  margin-top: 16px;
  padding: 0;
  text-align: center;
  width: 100%;
  transition: color 0.2s;
}

.btn-link:hover {
  color: #888;
}
</style>
