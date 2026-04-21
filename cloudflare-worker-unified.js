/**
 * Cloudflare Worker - 统一代理层
 * 解决服务器部署位置限制和不同 CF-Ray 节点的 WAF 差异问题
 *
 * 部署方式：
 *   1. 在 Cloudflare Dashboard 创建 Worker
 *   2. 将此文件内容粘贴为 Worker 代码
 *   3. 设置环境变量 CLOUDFLARE_WORKER_URL 为 Worker 的 URL
 *   4. 设置环境变量 CLOUDFLARE_WORKER_DOMAINS 为需要走 Worker 的域名（逗号分隔）
 *      例如：CLOUDFLARE_WORKER_DOMAINS=.touch-u.fun,example.com
 *
 * 请求格式：
 *   https://<worker-url>/?url=<encoded_target_url>&ua=<user_agent>
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, X-Requested-With',
        'Access-Control-Expose-Headers': 'X-Final-Url, X-Worker-Final-Url, X-Redirected, Content-Range, Accept-Ranges',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const url = new URL(request.url);

  // 健康检查端点
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ ok: true, service: 'birdtv-proxy-worker' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 只代理目标域名
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', {
      status: 400,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 验证目标 URL 格式
  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return new Response('Invalid target URL', {
      status: 400,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 复制请求头（过滤敏感头和客户端不可控的头）
  const headers = new Headers();
  const skipHeaders = new Set([
    'host', 'cookie', 'authorization', 'cf-ray', 'cf-connecting-ip',
    'cf-ipcountry', 'cf-visitor', 'cf-worker'
  ]);

  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!skipHeaders.has(lowerKey)) {
      headers.set(key, value);
    }
  }

  // 设置标准 User-Agent
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'okhttp/4.3');
  }

  // 添加来自查询参数的 UA
  const customUa = url.searchParams.get('ua');
  if (customUa) {
    headers.set('User-Agent', customUa);
  }

  // Range 请求支持（视频 seek）
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    headers.set('Range', rangeHeader);
  }

  // 构建代理请求
  const proxyRequest = new Request(target, {
    method: request.method,
    headers,
    body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect: 'follow'
  });

  try {
    const response = await fetch(proxyRequest);

    // 复制响应头
    const responseHeaders = new Headers();
    const skipResponseHeaders = new Set([
      'set-cookie', 'cf-ray', 'cf-cache-status', 'cf-mitigated'
    ]);

    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (!skipResponseHeaders.has(lowerKey)) {
        responseHeaders.set(key, value);
      }
    }

    // 添加自定义头
    responseHeaders.set('X-Worker-Proxy', 'true');
    // 记录最终 URL（重定向后的真实地址），供后端解析使用
    const finalUrl = response.url || targetUrl;
    responseHeaders.set('X-Worker-Final-Url', finalUrl);
    // 同时设置 X-Final-Url，与 BirdTV 后端 m3u-proxy 行为一致
    // 前端 Shaka 的 response filter 依赖 X-Final-Url 解析重定向
    responseHeaders.set('X-Final-Url', finalUrl);
    responseHeaders.set('X-Redirected', finalUrl !== targetUrl ? 'true' : 'false');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    // 对于流式内容（视频/音频），直接透传不缓冲
    const contentType = String(response.headers.get('Content-Type') || '').toLowerCase();
    const isStreaming = contentType.includes('video/') ||
                        contentType.includes('audio/') ||
                        contentType.includes('octet-stream') ||
                        contentType.includes('mpegurl') ||
                        contentType.includes('dash');

    if (isStreaming) {
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    }

    // 非流式内容：读取完整 body 后返回（确保 Worker 不会因 body 未消费而报错）
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Proxy error: ${error.message}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'X-Worker-Error': String(error.message || 'unknown')
      }
    });
  }
}
