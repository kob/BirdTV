/**
 * Deno Deploy 代理 - 绕过 ASN / 地理 IP 限制
 *
 * 适用场景：目标站点在 Cloudflare 上且 WAF 基于 Cdn-Loop 头拦截 CF Worker 请求，
 * 导致 CF Worker 无法代理。Deno Deploy 不在 CF 生态内，不会注入此类头。
 *
 * 部署方式：
 *   1. 访问 https://dash.deno.com 创建新项目
 *   2. 将此文件内容粘贴为 Worker 代码
 *   3. 在 BirdTV 后端 .env 中设置：
 *      DENO_PROXY_URL=https://your-project.deno.dev
 *      DENO_PROXY_DOMAINS=.touch-u.fun
 *
 * 请求格式（与 CF Worker 一致）：
 *   https://<deno-url>/?url=<encoded_target_url>&ua=<user_agent>
 */

Deno.serve(async (request) => {
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
    return new Response(JSON.stringify({ ok: true, service: 'deno-proxy-worker' }), {
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

  // 构建请求头（不注入 Cdn-Loop / Cf-Worker 等 Cloudflare 特征头）
  const headers = new Headers();
  const skipHeaders = new Set([
    'host', 'cookie', 'authorization',
    'cf-ray', 'cf-connecting-ip', 'cf-ipcountry', 'cf-visitor', 'cf-worker',
    'cdn-loop', 'cf-ew-via',
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

  // Range 支持
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    headers.set('Range', rangeHeader);
  }

  // 最大重定向次数
  const MAX_REDIRECTS = 5;
  let currentUrl = targetUrl;
  let response = null;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const fetchTarget = new URL(currentUrl);
    // 确保每个请求都设置正确的 Host
    headers.set('Host', fetchTarget.host);

    const proxyRequest = new Request(fetchTarget, {
      method: request.method,
      headers,
      redirect: 'manual', // 手动跟随重定向
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
      // 消费 body 避免泄漏
      await response.body?.cancel();
      continue;
    }

    // 非重定向，退出循环
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
  ]);

  for (const [key, value] of response.headers.entries()) {
    if (!skipResponseHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }

  // 自定义头
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
});
