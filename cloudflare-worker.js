/**
 * Cloudflare Worker for BirdTV
 * 用于 CDN 加速和边缘缓存
 *
 * 部署步骤：
 * 1. 注册 Cloudflare 账号：https://dash.cloudflare.com/
 * 2. 创建 Worker：Workers & Pages → Create Worker
 * 3. 粘贴此代码
 * 4. 部署后绑定自定义域名
 */

const BACKEND_URL = 'https://your-cloudstudio-domain.com'; // 替换为 CloudStudio 部署后的域名

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 缓存策略配置
    const CACHE_TTL = {
      // 静态资源：1小时
      static: 3600,
      // M3U 列表：10分钟
      m3u: 600,
      // 播放流：不缓存（直接代理）
      stream: 0,
      // API：1分钟
      api: 60
    };

    // M3U/MPD/TS 文件直接代理到后端
    if (/\.(m3u|mpd|ts|m4s|m3u8)$/.test(pathname)) {
      const cacheKey = `${BACKEND_URL}${pathname}${url.search}`;
      const cache = caches.default;

      // 播放流不缓存
      if (/\.(ts|m4s)$/.test(pathname)) {
        return fetch(new Request(cacheKey, request));
      }

      // M3U/MPD 缓存 10 分钟
      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await fetch(new Request(cacheKey, request));
      if (response.ok && response.status === 200) {
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Cache-Control', `public, max-age=${CACHE_TTL.m3u}`);
        newResponse.headers.set('CF-Cache-Status', 'MISS');
        ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));
        return newResponse;
      }

      return response;
    }

    // API 请求
    if (pathname.startsWith('/api/')) {
      const cacheKey = `${BACKEND_URL}${pathname}${url.search}`;

      // GET 请求缓存 1 分钟
      if (request.method === 'GET') {
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) {
          return cached;
        }

        const response = await fetch(new Request(cacheKey, request));
        if (response.ok && response.status === 200) {
          const newResponse = new Response(response.body, response);
          newResponse.headers.set('Cache-Control', `public, max-age=${CACHE_TTL.api}`);
          newResponse.headers.set('CF-Cache-Status', 'MISS');
          ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));
          return newResponse;
        }

        return response;
      }

      // POST/PUT/DELETE 不缓存
      return fetch(new Request(cacheKey, request));
    }

    // 静态文件（HTML/CSS/JS）
    if (/\.(html|css|js|woff2?|png|jpg|jpeg|svg|ico)$/.test(pathname)) {
      const cacheKey = `${BACKEND_URL}${pathname}${url.search}`;
      const cache = caches.default;
      const cached = await cache.match(cacheKey);

      if (cached) {
        return cached;
      }

      const response = await fetch(new Request(cacheKey, request));
      if (response.ok && response.status === 200) {
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Cache-Control', `public, max-age=${CACHE_TTL.static}`);
        newResponse.headers.set('CF-Cache-Status', 'MISS');
        ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));
        return newResponse;
      }

      return response;
    }

    // 其他请求直接代理
    const cacheKey = `${BACKEND_URL}${pathname}${url.search}`;
    return fetch(new Request(cacheKey, request));
  }
};
