import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('birdtv_token') || '');
  const user = ref(JSON.parse(localStorage.getItem('birdtv_user') || 'null'));

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  async function login(username, password) {
    const res = await authApi.login(username, password);
    const data = res.data;
    if (data.ok) {
      token.value = data.token;
      user.value = data.user || { username, role: 'admin' };
      localStorage.setItem('birdtv_token', data.token);
      localStorage.setItem('birdtv_user', JSON.stringify(user.value));
    }
    return data;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {}
    token.value = '';
    user.value = null;
    localStorage.removeItem('birdtv_token');
    localStorage.removeItem('birdtv_user');
  }

  async function fetchUserInfo() {
    try {
      const res = await authApi.getUserInfo();
      if (res.data.ok) {
        user.value = res.data.user;
        localStorage.setItem('birdtv_user', JSON.stringify(user.value));
      }
    } catch {}
  }

  return { token, user, isLoggedIn, isAdmin, login, logout, fetchUserInfo };
});
