# Cloudflare WAF/Challenge 问题解决方案

## 问题现象

两个平台请求相同 URL 返回不同结果：

### idxtv.kob8.dpdns.org
- CF-Ray 节点：TPE (台湾)
- 状态：520（源站连接失败）
- 未触发 Cloudflare Challenge

### tv.kob8.dpdns.org
- CF-Ray 节点：SIN (新加坡)
- 状态：403
- 响应头包含：`cf-mitigated: challenge`
- **触发了 Cloudflare Challenge/验证机制**

## 根本原因

Cloudflare 的 WAF/Challenge 机制对不同 CF-Ray 节点的请求有不同的安全策略和触发条件：

1. **地理位置差异**：TPE 和 SIN 节点可能配置了不同的安全级别
2. **请求特征差异**：不同节点的请求路由可能导致 Cloudflare 识别出不同的威胁特征
3. **时间差影响**：13 分钟的时间差，上游策略可能发生变化

## 解决方案

### 方案 1：使用 Cloudflare Workers 统一代理（推荐）

**优点**：
- 绕过不同 CF-Ray 节点的 WAF 差异
- 统一请求出口 IP 和特征
- 减少重复请求

**步骤**：

1. **部署 Workers**
   - 将 `cloudflare-worker-unified.js` 部署到 Cloudflare Workers
   - 获取 Workers 的 URL：`https://your-worker.your-subdomain.workers.dev`

2. **配置 BirdTV**
   在 `.env` 文件中添加：
   ```env
   # Cloudflare Workers 代理地址
   CLOUDFLARE_WORKER_URL=https://your-worker.your-subdomain.workers.dev
   ```

3. **代码已自动修改**
   - 添加了 `CLOUDFLARE_WORKER_URL` 配置支持
   - 实现了自动重试机制：当检测到 403/520 并带有 Cloudflare 特征时，自动切换到 Workers 代理重试
   - 无需手动干预，透明代理

### 方案 2：仅配置环境变量（无需重启）

如果已经部署了 Cloudflare Worker，只需要在两个平台的 `.env` 文件中都添加：

```env
CLOUDFLARE_WORKER_URL=https://your-worker.your-subdomain.workers.dev
```

然后重启 BirdTV 服务即可。

### 方案 3：不使用 Workers，直接重试（临时方案）

如果不想部署 Workers，可以修改代码增加简单重试逻辑（已在 `birdtv.js` 中实现部分逻辑）。

## 部署 Cloudflare Worker

### 步骤 1：创建 Worker

1. 登录 Cloudflare Dashboard
2. 进入 **Workers & Pages**
3. 点击 **Create application**
4. 选择 **Create Worker**
5. 命名为 `birdtv-proxy`

### 步骤 2：部署代码

1. 复制 `cloudflare-worker-unified.js` 的内容
2. 粘贴到 Worker 编辑器
3. 点击 **Deploy**

### 步骤 3：获取 URL

部署成功后，会得到类似这样的 URL：
```
https://birdtv-proxy.your-subdomain.workers.dev
```

### 步骤 4：配置 BirdTV

在两个平台的 `.env` 文件中添加：

```env
CLOUDFLARE_WORKER_URL=https://birdtv-proxy.your-subdomain.workers.dev
```

重启服务：

```bash
npm run start
```

## 工作原理

1. **正常请求**：直接请求目标 URL
2. **检测 WAF 拦截**：当收到 403 或 520，且响应头包含 Cloudflare 特征（`cf-mitigated: challenge`）时
3. **自动切换**：自动将请求通过 Cloudflare Worker 代理
4. **成功返回**：通过 Worker 代理的请求绕过 WAF，返回正常内容

## 验证

测试请求是否正常：

```bash
# 请求一（应该成功）
curl "https://idxtv.kob8.dpdns.org/m3u-proxy?url=https%3A%2F%2Ftv.iill.top%2Fm3u%2FMyTV&ua=okhttp%2F1.9.89"

# 请求二（也应该成功）
curl "https://tv.kob8.dpdns.org/m3u-proxy?url=https%3A%2F%2Ftv.iill.top%2Fm3u%2FMyTV&ua=okhttp%2F1.9.89"
```

## 注意事项

1. **Workers 请求限制**：免费版 Workers 每天有 100,000 次请求限制
2. **延迟增加**：通过 Worker 代理会增加 50-100ms 延迟
3. **仅在检测到 WAF 时使用**：正常情况下不会使用 Worker，只有检测到 Cloudflare 拦截时才启用<tool_call>replace_in_file<arg_key>filePath</arg_key><arg_value>/workspace/BirdTV/birdtv.js