# 密码管理修复说明

## 问题描述

在不使用 Redis 存储时（使用内存存储），每次服务重启后都会重新初始化默认管理员密码，用户修改后的密码会丢失。

## 根本原因

内存存储 (`memoryStorage`) 是模块级变量，每次服务重启时都会重新初始化为空的 Map：
```javascript
let memoryStorage = {
  users: new Map(),  // ← 每次重启都会重新创建空 Map
  tokens: new Map(),
  roles: new Map()
};
```

由于没有持久化机制，修改后的密码和 `isDefaultPassword: false` 标记无法保存到磁盘。

## 解决方案

为内存存储添加文件持久化功能，确保服务重启后用户数据不会丢失。

### 修改内容

1. **添加文件持久化功能** (`auth.js`):
   - 新增 `memoryStorageFile` 变量，存储持久化文件路径
   - 新增 `loadMemoryStorageFromFile()` 函数：从文件加载内存存储数据
   - 新增 `saveMemoryStorageToFile()` 函数：将内存存储数据保存到文件

2. **初始化时加载数据**:
   - 在 `initAuth()` 函数中，如果使用内存存储，首先尝试从文件加载历史数据
   - 只有在文件不存在或加载失败时，才创建新的默认管理员

3. **所有数据变更后自动保存**:
   - `createUser()` - 创建用户后保存
   - `verifyUser()` - 登录生成 token 后保存
   - `logout()` - 登出删除 token 后保存
   - `changePassword()` - 修改密码后保存
   - `updateUser()` - 更新用户信息后保存
   - `deleteUser()` - 删除用户后保存

4. **持久化文件位置**:
   - 文件路径：`{dataDir}/auth-storage.json`
   - `dataDir` 默认为 `./data`，可通过环境变量 `BIRDTV_DATA_DIR` 或 `M3U_PROXY_DATA_DIR` 配置
   - 已在 `.gitignore` 中添加 `data/*.json`，避免敏感数据被提交

## 使用说明

### 使用 Redis（生产环境推荐）

```env
# 在 .env 中配置
AUTH_ENABLED=true
AUTH_REDIS_HOST=localhost
AUTH_REDIS_PORT=6379
AUTH_REDIS_PASSWORD=your_password
AUTH_REDIS_DB=0
```

### 使用内存存储（开发环境）

```env
# 不配置 AUTH_REDIS_HOST，自动使用内存存储
AUTH_ENABLED=true
# AUTH_REDIS_HOST=  # 留空即可

# 可选：自定义数据目录
BIRDTV_DATA_DIR=/path/to/data
```

持久化文件将保存在：`{BIRDTV_DATA_DIR}/auth-storage.json`

## 验证修复

### 测试步骤

1. **首次启动**：
   ```bash
   cd BirdTV
   npm start
   ```
   - 查看日志，确认默认管理员已创建
   - 登录并修改密码

2. **验证文件持久化**：
   ```bash
   cat ./data/auth-storage.json
   ```
   - 应该看到包含修改后密码的 JSON 数据

3. **重启服务**：
   ```bash
   # 停止服务
   # Ctrl+C

   # 重新启动
   npm start
   ```
   - 查看日志，确认"管理员账户已存在（从文件加载）"
   - 使用修改后的密码登录，应该成功

4. **验证不再强制修改密码**：
   - 登录后不应跳转到修改密码页面
   - `isDefaultPassword` 应该为 `false`

## 技术细节

### 文件格式

```json
{
  "users": {
    "admin": "{\"id\":\"...\",\"username\":\"admin\",\"passwordHash\":\"...\",\"role\":\"admin\",\"createdAt\":...,\"isDefaultPassword\":false}"
  },
  "tokens": {
    "eyJ...": "{\"userId\":\"...\",\"username\":\"admin\"}"
  },
  "roles": {
    "admin": "{\"name\":\"管理员\",\"permissions\":[\"*\"]}",
    "user": "{\"name\":\"普通用户\",\"permissions\":[\"view\",\"play\"]}",
    "guest": "{\"name\":\"访客\",\"permissions\":[\"view\"]}"
  }
}
```

### 注意事项

1. **安全性**：
   - `auth-storage.json` 包含密码哈希值，应该妥善保管
   - 文件已在 `.gitignore` 中，不会被提交到代码仓库
   - 生产环境建议使用 Redis 而不是内存存储

2. **性能**：
   - 文件持久化是同步操作，每次数据变更都会立即写入磁盘
   - 对于高并发场景，建议使用 Redis 以获得更好的性能

3. **兼容性**：
   - 此修复向后兼容，不影响现有 Redis 用户
   - 如果 Redis 可用，优先使用 Redis；否则降级到内存存储 + 文件持久化

## 相关文件

- `auth.js` - 授权模块，主要修改文件
- `birdtv.js` - 服务器启动，传递配置参数
- `.gitignore` - 忽略数据文件
- `./data/auth-storage.json` - 内存存储持久化文件（自动生成）

## 日志示例

### 首次启动（无数据文件）
```
[Auth] Redis未配置，将使用内存存储
[Auth] 内存存储持久化文件: /workspace/BirdTV/data/auth-storage.json
[Auth] 默认管理员账户已创建（内存存储）
[Auth] 内存存储数据已保存到文件: /workspace/BirdTV/data/auth-storage.json
```

### 重启后（有数据文件）
```
[Auth] Redis未配置，将使用内存存储
[Auth] 内存存储持久化文件: /workspace/BirdTV/data/auth-storage.json
[Auth] 内存存储数据已从文件加载: /workspace/BirdTV/data/auth-storage.json
[Auth] 管理员账户已存在（从文件加载）
```

## 总结

✅ **修复完成**：使用内存存储时，密码和用户数据现在会持久化到文件，服务重启后不会丢失。
