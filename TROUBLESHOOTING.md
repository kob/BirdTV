# BirdTV 问题排查指南

## 🔧 按钮无响应问题

### 问题症状
点击 `index.html` 页面上的任何按钮都没有反应，无法进行操作。

### 已知原因
重复调用 `init()` 函数导致初始化冲突，已在 `src/modules/init.js` 中修复（删除了第 692 行的重复调用）。

### 解决方法

#### 方法 1：清除浏览器缓存
1. 按 `Ctrl + Shift + Delete`（Windows）或 `Cmd + Shift + Delete`（Mac）
2. 选择"缓存的图像和文件"
3. 点击"清除数据"
4. 刷新页面（`F5` 或 `Ctrl + R`）

#### 方法 2：硬刷新
- **Windows**: `Ctrl + Shift + R` 或 `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

#### 方法 3：使用调试页面
访问 `http://localhost:8771/debug.html` 进行诊断：
1. 检查 DOM 元素是否存在
2. 测试模块导入
3. 查看控制台错误日志
4. 清除本地存储

#### 方法 4：手动修复
如果上述方法无效，手动修复代码：
1. 打开 `web/src/modules/init.js`
2. 确保文件末尾只有一处 `init();` 调用
3. 删除重复的调用（第 692 行附近）

---

## 🌐 其他常见问题

### Q: 页面白屏，无法加载

**原因：**
- JS 文件加载失败
- 模块导入错误
- 网络问题

**解决方法：**
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签页的错误信息
3. 查看 Network 标签页确认文件加载状态
4. 检查后端服务是否正常运行：`npm run start:web:local`

### Q: 认证失败，自动跳转登录页

**原因：**
- Token 过期
- 后端认证服务异常

**解决方法：**
1. 清除本地 Token：`localStorage.removeItem('authToken')`
2. 重新登录
3. 检查 `.env` 文件中的认证配置

### Q: M3U 导入失败

**原因：**
- M3U 链接无效
- 网络问题
- 格式不正确

**解决方法：**
1. 使用有效的 M3U 源进行测试：`https://iptv-org.github.io/iptv/countries/cn.m3u`
2. 检查网络连接
3. 查看 Console 中的错误信息

### Q: 播放失败，显示错误

**原因：**
- 播放器类型不匹配
- 代理配置问题
- 源地址失效

**解决方法：**
1. 尝试切换播放器类型（自动 → HLS → Shaka → 原生）
2. 调整代理模式（自动 → 直连 → 代理）
3. 检查源地址是否有效

### Q: 部署后无法访问

**原因：**
- CloudStudio 服务未启动
- 端口未开放
- 域名配置错误

**解决方法：**
1. 检查 CloudStudio 控制台服务状态
2. 确认环境 ID 正确
3. 查看云日志排查错误

### Q: 手机端无法使用

**原因：**
- 浏览器兼容性问题
- 数据存储被清空

**解决方法：**
1. 使用现代浏览器（Chrome 90+、Safari 14+）
2. 重新导入 M3U 链接
3. 查看手机端使用指南：`MOBILE_GUIDE.md`

---

## 🛠️ 开发环境问题

### Q: 后端服务启动失败

**错误示例：**
```
Error: listen EADDRINUSE: address already in use :::8771
```

**解决方法：**
1. 查找占用端口的进程：`lsof -i :8771`（Mac/Linux）或 `netstat -ano | findstr :8771`（Windows）
2. 杀死进程或更换端口
3. 修改 `.env` 文件中的 `PORT` 配置

### Q: 依赖安装失败

**错误示例：**
```
npm ERR! code ERESOLVE
```

**解决方法：**
1. 删除 `node_modules` 目录和 `package-lock.json`
2. 重新安装：`npm install`
3. 如仍有问题，使用 `npm install --legacy-peer-deps`

### Q: Vite 构建失败

**错误示例：**
```
[vite] Internal server error: EACCES
```

**解决方法：**
1. 检查文件权限
2. 确保 Vite 配置正确
3. 清除 Vite 缓存：`rm -rf node_modules/.vite`

---

## 📊 诊断工具

### 使用调试页面
访问 `/debug.html` 可以：
- 检查 DOM 元素是否存在
- 测试模块导入
- 查看控制台日志
- 清除本地存储

### 浏览器开发者工具
1. **Console**：查看 JS 错误和日志
2. **Network**：检查文件加载状态
3. **Application**：查看 LocalStorage 和 Cookie
4. **Elements**：检查 DOM 结构

### CloudStudio 控制台
- **云日志**：查看后端运行日志
- **云函数监控**：CPU、内存使用情况
- **请求统计**：API 调用统计

---

## 🔍 获取帮助

### 提交问题时请提供：
1. 浏览器类型和版本
2. 操作系统版本
3. 错误截图或控制台日志
4. 复现步骤
5. `debug.html` 的诊断结果

### 联系方式
- 查看项目文档：`README.md`
- 查看部署指南：`CLOUDSTUDIO_DEPLOY.md`
- 查看手机端指南：`MOBILE_GUIDE.md`

---

## 📝 最新修复记录

### 2025-03-29
- ✅ 修复 `index.html` 按钮无响应问题
- ✅ 删除 `init.js` 中重复的 `init()` 调用
- ✅ 添加调试页面 `debug.html`
- ✅ 更新文档和问题排查指南

---

**版本**：v1.0.0
**更新日期**：2025-03-29
