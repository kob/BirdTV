# BirdTV 服务自动停止问题解决方案

## 🔍 问题现象

在 SAP BAS 工作区部署 BirdTV 后，服务经常自动停止运行。

## 📋 可能的原因

### 1. **内存不足**
- BAS 工作区可能限制了内存使用
- 内存泄漏导致占用持续增长
- 被 OOM Killer 杀死

### 2. **异常未捕获**
- 未处理的 Promise 拒绝
- 未捕获的异常导致进程退出
- 网络错误未妥善处理

### 3. **网络问题**
- 网络连接不稳定导致超时
- Cloudflare WAF 拦截返回 403/520
- Redis 连接断开

### 4. **资源限制**
- 文件描述符耗尽
- 连接数过多
- 磁盘空间不足

## ✅ 解决方案（按推荐顺序）

---

### 方案 1: PM2 进程管理器（推荐）

**适用场景**: Node.js 应用，需要监控和自动重启

**优点**:
- ✓ 专为 Node.js 设计
- ✓ 自动重启，监控面板
- ✓ 日志管理
- ✓ 简单易用

**部署步骤**:

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 创建日志目录
mkdir -p logs

# 3. 启动服务
pm2 start ecosystem.config.js

# 4. 保存配置
pm2 save

# 5. 开机自启
pm2 startup

# 查看状态
pm2 status

# 查看日志
pm2 logs birdtv

# 监控面板
pm2 monit

# 重启服务
pm2 restart birdtv

# 停止服务
pm2 stop birdtv
```

---

### 方案 2: Systemd 服务（生产环境推荐）

**适用场景**: Linux 服务器，需要系统级管理

**优点**:
- ✓ Linux 原生，最稳定
- ✓ 开机自启
- ✓ 资源限制完善
- ✓ 日志集成系统

**部署步骤**:

```bash
# 1. 复制服务文件
sudo cp birdtv.service /etc/systemd/system/

# 2. 重新加载 systemd
sudo systemctl daemon-reload

# 3. 启动服务
sudo systemctl start birdtv

# 4. 开机自启
sudo systemctl enable birdtv

# 查看状态
sudo systemctl status birdtv

# 查看日志
sudo journalctl -u birdtv -f

# 重启服务
sudo systemctl restart birdtv

# 停止服务
sudo systemctl stop birdtv
```

---

### 方案 3: 守护脚本（临时方案）

**适用场景**: 快速测试，临时部署

**优点**:
- ✓ 无需额外依赖
- ✓ 简单易用
- ✓ 自定义逻辑

**使用方法**:

```bash
# 启动（进入守护模式）
bash daemon.sh start

# 查看状态
bash daemon.sh status

# 重启服务
bash daemon.sh restart

# 停止服务
bash daemon.sh stop

# 清理日志
bash daemon.sh clean
```

---

## 🛠️ 诊断工具

使用诊断脚本快速定位问题：

```bash
bash diagnose.sh
```

诊断内容包括：
- ✓ 进程状态
- ✓ 端口监听
- ✓ 日志分析
- ✓ 系统资源
- ✓ 网络连接
- ✓ Redis 连接
- ✓ 健康检查
- ✓ 问题建议

---

## 🔧 代码改进

已添加的改进：

### 1. 全局错误处理

```javascript
// 防止未捕获异常导致崩溃
process.on('uncaughtException', (error) => {
  console.error('[FATAL] 未捕获的异常:', error);
  // 记录日志但继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] 未处理的 Promise 拒绝:', reason);
  // 记录日志但继续运行
});
```

### 2. Cloudflare WAF 自动重试

```javascript
// 检测到 403/520 时自动切换到 Worker 代理重试
if ((code === 403 || code === 520) && !workerRetry && workerUrl) {
  const cfChallenge = resp.headers['cf-mitigated'] === 'challenge';
  if (cfChallenge) {
    console.log('[Cloudflare WAF] 检测到 WAF 拦截，尝试使用 Worker 代理重试');
    // 自动切换到 Worker 代理
  }
}
```

---

## 📊 监控和日志

### PM2 监控

```bash
# 实时监控
pm2 monit

# 查看日志
pm2 logs birdtv

# 日志清空
pm2 flush
```

### Systemd 日志

```bash
# 实时查看日志
sudo journalctl -u birdtv -f

# 查看最近 100 行
sudo journalctl -u birdtv -n 100

# 查看今天的日志
sudo journalctl -u birdtv --since today
```

### 应用日志

```bash
# 实时查看
tail -f birdtv.log

# 查看最近 100 行
tail -n 100 birdtv.log

# 搜索错误
grep -i "error\|exception\|fatal" birdtv.log
```

---

## 🚀 快速部署

使用部署脚本选择最适合的方案：

```bash
bash deploy-service.sh
```

脚本会提供三个选项：
1. PM2（推荐）
2. Systemd
3. 守护脚本

---

## ⚠️ 常见问题和解决

### 1. 内存溢出

**症状**: `JavaScript heap out of memory`

**解决**:

```bash
# 使用 PM2（已配置）
pm2 restart birdtv --max-memory-restart 500M

# 或手动增加内存限制
node --max-old-space-size=2048 birdtv.js
```

### 2. 端口占用

**症状**: `EADDRINUSE` 错误

**解决**:

```bash
# 查找占用端口的进程
lsof -i :8771

# 杀死进程
kill -9 <PID>

# 重启服务
pm2 restart birdtv
```

### 3. Cloudflare WAF 拦截

**症状**: 频繁 403/520 错误

**解决**: 配置 Cloudflare Worker 代理

```env
# 在 .env 中添加
CLOUDFLARE_WORKER_URL=https://your-worker.workers.dev
```

---

## 📝 部署检查清单

部署前检查：

- [ ] 确认 Node.js 版本 >= 16
- [ ] 检查依赖已安装: `npm install`
- [ ] 配置 .env 文件
- [ ] 检查 Redis 连接（如使用）
- [ ] 确认端口 8771 未被占用
- [ ] 检查磁盘空间 > 1GB
- [ ] 运行诊断脚本: `bash diagnose.sh`

部署后验证：

- [ ] 服务正常运行
- [ ] 健康检查通过: `curl http://localhost:8771/health`
- [ ] 查看日志无错误
- [ ] 进程监控正常
- [ ] 开机自启配置

---

## 🔗 相关文档

- `CLOUDFLARE_WAF_SOLUTION.md` - Cloudflare WAF 解决方案
- `ecosystem.config.js` - PM2 配置
- `birdtv.service` - Systemd 配置
- `daemon.sh` - 守护脚本
- `diagnose.sh` - 诊断工具

---

## 💡 最佳实践

1. **使用 PM2 或 Systemd**: 不要直接使用 nohup 或 screen
2. **定期检查日志**: 使用 `bash diagnose.sh` 定期诊断
3. **监控资源**: 设置内存和连接数警告
4. **配置 Worker 代理**: 解决 Cloudflare WAF 问题
5. **日志归档**: 定期清理和归档日志
6. **备份配置**: 定期备份 .env 和数据目录

---

## 📞 技术支持

如遇到问题：

1. 运行诊断脚本: `bash diagnose.sh`
2. 查看完整日志: `tail -f birdtv.log`
3. 检查系统资源: `htop` 或 `top`
4. 参考本文档的常见问题部分
