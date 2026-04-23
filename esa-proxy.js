/**
 * 阿里云 ESA（边缘安全加速）函数 / Pages 代理
 *
 * 适用场景：
 *   - 目标站点在国内，CF Worker / Deno Deploy 海外节点延迟高或被 WAF 拦截
 *   - 需要国内边缘节点加速访问（ESA 节点覆盖中国大陆）
 *   - 作为 CF Worker / Deno 之外的第 3 种代理方式
 *
 * 部署方式一：ESA 函数计算
 *   1. 登录阿里云 ESA 控制台 https://esa.console.aliyun.com
 *   2. 创建站点，添加域名并完成 DNS 接入
 *   3. 进入「边缘函数」→ 创建函数，将此文件内容粘贴为函数代码
 *   4. 配置路由规则：/* → 该函数
 *
 * 部署方式二：ESA Pages
 *   1. 登录阿里云 ESA 控制台
 *   2. 进入「Pages」→ 创建项目
 *   3. 将此文件作为 functions/proxy.js 或 pages 入口部署
 *
 * BirdTV 后端 .env 配置：
 *   ESA_PROXY_URL=https://your-esa-domain.example.com
 *   ESA_PROXY_DOMAINS=.example.cn,.some-cdn.com
 *
 * 请求格式（与 CF Worker / Deno 一致）：
 *   https://<esa-url>/?url=<encoded_target_url>&ua=<user_agent>
 */

// ESA 函数入口（兼容 Pages 和边缘函数两种部署方式）
async function handleRequest(request) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, X-Requested-With',
        'Access-Control-Expose-Headers': 'X-Final-Url, X-Worker-Final-Url, X-Redirected, Content-Range, Accept-Ranges',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);

  // 健康检查
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ ok: true, service: 'esa-proxy-worker' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 获取目标 URL
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', {
      status: 400,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return new Response('Invalid target URL', {
      status: 400,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 构建请求头（过滤敏感头和 ESA/CDN 特征头，避免被目标站 WAF 拦截）
  const headers = new Headers();
  const skipHeaders = new Set([
    'host', 'cookie', 'authorization',
    'cf-ray', 'cf-connecting-ip', 'cf-ipcountry', 'cf-visitor', 'cf-worker',
    'cdn-loop', 'cf-ew-via',
    'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host',
    'x-real-ip', 'x-dlae-cdn', 'via',
    'ali-cdn', 'x-ali-tcp-info',
  ]);

  for (const [key, value] of request.headers.entries()) {
    if (!skipHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  // UA
  const customUa = url.searchParams.get('ua');
  if (customUa) {
    headers.set('User-Agent', customUa);
  } else if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'okhttp/4.3');
  }

  // Range 支持（视频 seek）
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    headers.set('Range', rangeHeader);
  }

  // 手动跟随重定向（ESA 环境下 redirect: 'follow' 可能丢失最终 URL）
  const MAX_REDIRECTS = 5;
  let currentUrl = targetUrl;
  let response = null;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const fetchTarget = new URL(currentUrl);
    headers.set('Host', fetchTarget.host);

    const proxyRequest = new Request(fetchTarget, {
      method: request.method,
      headers,
      redirect: 'manual',
      body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    });

    try {
      response = await fetch(proxyRequest);
    } catch (error) {
      return new Response(`Proxy error: ${error.message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 检查是否重定向
    if (response.status >= 300 && response.status < 400 && response.headers.get('Location')) {
      const location = response.headers.get('Location');
      currentUrl = new URL(location, currentUrl).href;
      await response.body?.cancel();
      continue;
    }

    break;
  }

  if (!response) {
    return new Response('Proxy error: no response', {
      status: 502,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 构建响应头
  const responseHeaders = new Headers();
  const skipResponseHeaders = new Set([
    'set-cookie', 'cf-ray', 'cf-cache-status', 'cf-mitigated',
    'x-dlae-cdn', 'ali-cdn', 'via',
  ]);

  for (const [key, value] of response.headers.entries()) {
    if (!skipResponseHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }

  // 自定义头（与 CF Worker / Deno 代理保持一致）
  const finalUrl = currentUrl;
  const isRedirected = finalUrl !== targetUrl;
  responseHeaders.set('X-Worker-Proxy', 'true');
  responseHeaders.set('X-Worker-Final-Url', finalUrl);
  responseHeaders.set('X-Final-Url', finalUrl);
  responseHeaders.set('X-Redirected', isRedirected ? 'true' : 'false');
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Expose-Headers', '*');

  // 流式内容直接透传
  const contentType = String(response.headers.get('Content-Type') || '').toLowerCase();
  const isStreaming = contentType.includes('video/') ||
                      contentType.includes('audio/') ||
                      contentType.includes('octet-stream') ||
                      contentType.includes('mpegurl') ||
                      contentType.includes('dash');

  if (isStreaming) {
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  }

  // 非流式内容
  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    headers: responseHeaders,
  });
}

// ESA 边缘函数入口
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});
