import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/Setup.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    name: 'Player',
    component: () => import('@/views/Player.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/Admin.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/mobile',
    name: 'Mobile',
    component: () => import('@/views/Mobile.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const API_URL_KEY = 'birdtv_api_base_url';

function getApiBaseUrl() {
  return localStorage.getItem(API_URL_KEY) || '';
}

// 路由守卫
router.beforeEach((to, from, next) => {
  // /setup 页面跳过检查
  if (to.name === 'Setup') {
    next();
    return;
  }

  // 未配置后端地址 → 跳转设置向导
  if (!getApiBaseUrl()) {
    next({ name: 'Setup', query: { redirect: to.fullPath } });
    return;
  }

  const token = localStorage.getItem('birdtv_token');

  if (to.meta.requiresAuth !== false && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }
  next();
});

export { API_URL_KEY, getApiBaseUrl };
export default router;
