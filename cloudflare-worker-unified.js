/**
 * Cloudflare Worker - 统一代理层
 * 解决不同 CF-Ray 节点的 WAF 差异问题
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // 只代理目标域名
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // 构建新的请求
  const target = new URL(targetUrl);

  // 复制请求头（过滤敏感头）
  const headers = new Headers();
  const skipHeaders = ['host', 'cookie', 'authorization', 'cf-ray', 'cf-connecting-ip'];
  
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!skipHeaders.includes(lowerKey)) {
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

  // 构建代理请求
  const proxyRequest = new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow'
  });

  try {
    const response = await fetch(proxyRequest);

    // 复制响应头
    const responseHeaders = new Headers();
    const skipResponseHeaders = ['set-cookie', 'cf-ray', 'cf-cache-status'];
    
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (!skipResponseHeaders.includes(lowerKey)) {
        responseHeaders.set(key, value);
      }
    }

    // 添加自定义头
    responseHeaders.set('X-Worker-Proxy', 'true');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Proxy error: ${error.message}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
