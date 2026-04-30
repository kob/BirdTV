# BirdTV 全代理版本

## 概述

全代理版本（All-Proxy Version）是 BirdTV 的一个特殊分支，所有网络流量都通过服务端代理转发，提供更好的兼容性和隐私保护。

## 主要特性

### 1. 强制代理模式
- 所有视频流量都通过服务端代理转发
- 无直连选项，无法切换到直连模式
- 确保所有请求都经过服务端处理

### 2. 代理优势
- **隐私保护**：用户真实IP不会暴露给视频源服务器
- **跨域支持**：解决浏览器跨域（CORS）问题
- **地理限制绕过**：服务端可以访问受地理限制的内容
- **伪装UA**：可以指定User-Agent伪装成其他客户端

### 3. 技术实现
- 前端所有请求都通过 `/m3u-proxy` 端点代理
- 后端 birdtv.js 处理所有代理请求
- 支持多种外部代理后端（Cloudflare Worker、Deno Deploy、阿里云ESA）

## 代码修改

### 核心修改

#### 1. proxy.js
```javascript
// 全代理模式开关
export const FORCE_PROXY_MODE = true;

// 强制使用代理
export function shouldUseProxy(url, preferDirectLan = false, source = null) {
    if (FORCE_PROXY_MODE) {
        return true;  // 始终返回true
    }
    // ... 原有的智能判断逻辑
}
```

#### 2. state.js
```javascript
// 默认代理模式设置为 m3u-proxy
tempProxyMode: 'm3u-proxy',
proxyMode: 'm3u-proxy',
```

#### 3. index.html
```html
<!-- 代理模式选择器被禁用和隐藏 -->
<select id="tempProxyModeSelect" disabled>
    <option value="m3u-proxy">全代理模式（服务端转发）</option>
</select>
```

## 部署

### 服务端部署
与标准版相同，部署 birdtv.js 到服务器：

```bash
# 安装依赖
npm install

# 启动服务
node birdtv.js
```

### Nginx 配置示例
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 使用说明

1. 部署全代理版本服务端
2. 用户访问前端页面
3. 所有频道播放请求都通过服务端代理转发
4. 无需配置代理模式（已强制启用）

## 与标准版的区别

| 特性 | 标准版 | 全代理版 |
|------|--------|----------|
| 直连模式 | 支持 | 不支持 |
| 代理模式 | 可选 | 强制 |
| 跨域处理 | 智能判断 | 全部代理 |
| 隐私保护 | 部分 | 完整 |
| 配置复杂度 | 较高 | 简化 |

## 适用场景

- 需要完整隐私保护的环境
- 服务端可访问但客户端无法直接访问的源
- 简化用户配置的托管服务
- 企业内网部署
