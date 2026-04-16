import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
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

// 路由守卫 - 认证检查
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('birdtv_token');

  if (to.meta.requiresAuth !== false && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }
  next();
});

export default router;
