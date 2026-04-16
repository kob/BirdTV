<template>
  <div class="setup-page">
    <div class="setup-card">
      <h1>BirdTV 初始化配置</h1>
      <p class="desc">请输入后端服务器地址，完成后即可正常使用</p>

      <!-- 已有配置时显示 -->
      <div v-if="savedUrl" class="current-url">
        <span class="label">当前连接：</span>
        <code>{{ savedUrl }}</code>
      </div>

      <!-- 快捷入口 -->
      <div class="quick-actions">
        <button class="btn-quick" :disabled="detecting" @click="detectLocal">
          {{ detecting ? '检测中...' : '🔍 自动检测本地' }}
        </button>
        <button class="btn-quick btn-local" @click="useLocal">
          💻 使用本机 (localhost:8771)
        </button>
      </div>

      <div class="form-group">
        <label>后端服务器地址</label>
        <input
          v-model="serverUrl"
          type="text"
          placeholder="http://127.0.0.1:8771"
          @keyup.enter="save"
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
const savedUrl = ref('');
const serverUrl = ref('');
const timeout = ref(10000);
const saving = ref(false);
const detecting = ref(false);
const error = ref('');
const success = ref(false);

// 常见后端端口
const COMMON_PORTS = [8771, 3000, 5173, 8080, 5174, 3001, 8000];

onMounted(() => {
  const saved = localStorage.getItem('birdtv_api_base_url');
  if (saved) {
    savedUrl.value = saved;
    serverUrl.value = saved;
  }
});

// 自动检测本机端口
async function detectLocal() {
  detecting.value = true;
  error.value = '';
  serverUrl.value = '';

  const hostname = window.location.hostname;
  // 并发检测所有端口
  const checks = COMMON_PORTS.map(async (port) => {
    try {
      await axios.get(`http://${hostname}:${port}/health`, { timeout: 2000 });
      return port;
    } catch {
      return null;
    }
  });

  const found = await Promise.all(checks);
  const available = found.filter(Boolean);

  detecting.value = false;

  if (available.length > 0) {
    // 优先使用 8771，否则用找到的第一个
    const port = available.includes(8771) ? 8771 : available[0];
    serverUrl.value = `http://${hostname}:${port}`;
  } else {
    error.value = `未检测到本地后端服务，请确保服务器已启动（尝试端口：${COMMON_PORTS.join(', ')}）`;
  }
}

// 直接使用本机 8771
function useLocal() {
  const hostname = window.location.hostname;
  serverUrl.value = `http://${hostname}:8771`;
  error.value = '';
}

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
  max-width: 460px;
}

h1 {
  font-size: 1.4rem;
  margin: 0 0 8px;
}

.desc {
  color: #888;
  font-size: 0.9rem;
  margin: 0 0 20px;
}

.current-url {
  background: #111;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 16px;
  font-size: 0.85rem;
}

.current-url .label {
  color: #666;
}

.current-url code {
  color: #4a9eff;
  font-family: monospace;
}

.quick-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.btn-quick {
  flex: 1;
  padding: 8px 6px;
  background: #222;
  border: 1px solid #444;
  border-radius: 6px;
  color: #ccc;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-quick:hover:not(:disabled) {
  background: #2a2a2a;
  border-color: #4a9eff;
  color: #fff;
}

.btn-quick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-local {
  border-color: #4a9eff;
  color: #4a9eff;
}

.btn-local:hover {
  background: rgba(74, 158, 255, 0.1);
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
  margin-top: 24px;
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
