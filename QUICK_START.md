# 快速启动指南

## 🚀 立即解决问题

### 方案选择

如果您在 SAP BAS 工作区遇到服务自动停止的问题，**推荐使用 PM2**：

```bash
# 一键部署（会提示选择方案）
bash deploy-service.sh
```

选择 **1 (PM2)** 即可。

---

## 📦 快速安装和启动

### 使用 PM2（推荐）

```bash
# 1. 安装 PM2（如果没有）
npm install -g pm2

# 2. 进入目录
cd /workspace/BirdTV

# 3. 创建日志目录
mkdir -p logs

# 4. 启动服务
pm2 start ecosystem.config.js

# 5. 保存配置和设置开机自启
pm2 save
pm2 startup
```

### 使用 Systemd

```bash
# 1. 复制服务文件
sudo cp birdtv.service /etc/systemd/system/

# 2. 重新加载 systemd
sudo systemctl daemon-reload

# 3. 启动服务
sudo systemctl start birdtv

# 4. 开机自启
sudo systemctl enable birdtv
```

### 使用守护脚本

```bash
# 启动（后台运行守护进程）
bash daemon.sh start
```

---

## 🔍 诊断问题

运行诊断工具快速定位问题：

```bash
bash diagnose.sh
```

诊断工具会检查：
- ✓ 进程状态
- ✓ 端口监听
- ✓ 日志错误
- ✓ 系统资源
- ✓ 网络连接
- ✓ Redis 连接
- ✓ 服务健康

---

## 📊 监控服务

### PM2 监控

```bash
# 查看状态
pm2 status

# 实时监控面板
pm2 monit

# 查看日志
pm2 logs birdtv

# 重启服务
pm2 restart birdtv
```

### Systemd 监控

```bash
# 查看状态
sudo systemctl status birdtv

# 查看日志
sudo journalctl -u birdtv -f

# 重启服务
sudo systemctl restart birdtv
```

### 守护脚本监控

```bash
# 查看状态
bash daemon.sh status

# 查看守护日志
tail -f daemon.log

# 查看服务日志
tail -f birdtv.log
```

---

## 🛠️ 常见问题

### Q: 服务经常停止？

A: 使用 PM2 或 Systemd，它们会自动重启服务：

```bash
# PM2
pm2 start ecosystem.config.js

# Systemd
sudo systemctl restart birdtv
```

### Q: 内存溢出错误？

A: PM2 已配置 500MB 内存限制，超过会自动重启：

```bash
# 查看内存使用
pm2 monit

# 手动设置内存限制
pm2 restart birdtv --max-memory-restart 500M
```

### Q: 频繁 403/520 错误？

A: 配置 Cloudflare Worker 代理：

```bash
# 1. 编辑 .env
vim .env

# 2. 添加配置
CLOUDFLARE_WORKER_URL=https://your-worker.workers.dev

# 3. 重启服务
pm2 restart birdtv
```

详见 `CLOUDFLARE_WAF_SOLUTION.md`

---

## 📞 获取帮助

1. **诊断问题**: `bash diagnose.sh`
2. **查看日志**: `tail -f birdtv.log`
3. **详细文档**: `SERVICE_STABILITY_SOLUTION.md`

---

## ✅ 验证部署

部署完成后，验证服务正常运行：

```bash
# 健康检查
curl http://localhost:8771/health

# 应该返回:
# {"ok":true,"port":8771,"cacheEntries":X,"authEnabled":true}
```

---

## 🎯 推荐操作流程

```
1. 运行诊断: bash diagnose.sh
   ↓
2. 根据诊断结果选择方案
   ↓
3. 运行部署: bash deploy-service.sh
   ↓
4. 验证运行: curl http://localhost:8771/health
   ↓
5. 监控服务: pm2 monit
```
