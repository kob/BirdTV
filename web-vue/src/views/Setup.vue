<template>
  <div class="setup-page">
    <div class="setup-card">
      <h1>BirdTV 初始化配置</h1>
      <p class="desc">请输入后端服务器地址，完成后即可正常使用</p>

      <div class="form-group">
        <label>后端服务器地址</label>
        <input
          v-model="serverUrl"
          type="url"
          placeholder="http://127.0.0.1:8771"
          @keyup.enter="save"
          autofocus
        />
        <span class="hint">例如：http://192.168.1.100:8771</span>
      </div>

      <div class="form-group">
        <label>连接超时</label>
        <select v-model="timeout">
          <option :value="5000">5 秒</option>
          <option :value="10000">10 秒</option>
          <option :value="30000">30 秒</option>
        </select>
      </div>

      <div class="actions">
        <button class="btn-primary" :disabled="saving || !serverUrl" @click="save">
          {{ saving ? '连接中...' : '保存并连接' }}
        </button>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>
      <div v-if="success" class="success-msg">连接成功！正在跳转...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const serverUrl = ref('');
const timeout = ref(10000);
const saving = ref(false);
const error = ref('');
const success = ref(false);

onMounted(() => {
  // 已有配置则直接跳转
  const saved = localStorage.getItem('birdtv_api_base_url');
  if (saved) {
    serverUrl.value = saved;
  }
});

async function save() {
  if (!serverUrl.value) return;
  saving.value = true;
  error.value = '';

  let url = serverUrl.value.trim();
  // 自动补全协议
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
    serverUrl.value = url;
  }
  // 去除末尾斜杠
  url = url.replace(/\/$/, '');

  // 先验证连接
  const testUrl = `${url}/health`;
  try {
    await axios.get(testUrl, { timeout: timeout.value });
  } catch (e) {
    saving.value = false;
    error.value = `无法连接到 ${url}，请检查地址是否正确、服务器是否运行`;
    return;
  }

  // 保存配置
  localStorage.setItem('birdtv_api_base_url', url);

  success.value = true;
  setTimeout(() => {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    router.replace(redirect || '/login');
  }, 800);
}
</script>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f0f0f;
  color: #fff;
}

.setup-card {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
}

h1 {
  font-size: 1.4rem;
  margin: 0 0 8px;
}

.desc {
  color: #888;
  font-size: 0.9rem;
  margin: 0 0 28px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-size: 0.85rem;
  color: #ccc;
  margin-bottom: 6px;
}

input, select {
  width: 100%;
  padding: 10px 12px;
  background: #111;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 1rem;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s;
}

input:focus, select:focus {
  border-color: #4a9eff;
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: #666;
  margin-top: 4px;
}

.actions {
  margin-top: 28px;
}

.btn-primary {
  width: 100%;
  padding: 12px;
  background: #4a9eff;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #3a8eef;
}

.btn-primary:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}

.error-msg {
  margin-top: 16px;
  padding: 10px;
  background: rgba(255, 80, 80, 0.15);
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 6px;
  color: #ff6060;
  font-size: 0.85rem;
}

.success-msg {
  margin-top: 16px;
  padding: 10px;
  background: rgba(80, 200, 80, 0.15);
  border: 1px solid rgba(80, 200, 80, 0.3);
  border-radius: 6px;
  color: #6f6;
  font-size: 0.85rem;
}
</style>
