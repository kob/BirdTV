#!/bin/bash

# BirdTV 服务管理方案对比和部署指南

# ==================== 方案对比 ====================

echo "=========================================="
echo "BirdTV 服务稳定运行方案"
echo "=========================================="
echo ""

# 方案 1: PM2（推荐用于 Node.js）
echo "方案 1: PM2 进程管理器 (推荐)"
echo "----------------------------------------"
echo "优点:"
echo "  ✓ 专为 Node.js 设计，功能完善"
echo "  ✓ 支持日志管理、监控、集群模式"
echo "  ✓ 自动重启，性能监控"
echo "  ✓ 简单易用，一行命令启动"
echo ""
echo "缺点:"
echo "  ✗ 需要额外安装 PM2"
echo "  ✗ 不是系统级服务"
echo ""

# 方案 2: Systemd（推荐用于生产环境）
echo "方案 2: Systemd 服务"
echo "----------------------------------------"
echo "优点:"
echo "  ✓ Linux 原生服务管理，最稳定"
echo "  ✓ 系统级守护，开机自启"
echo "  ✓ 资源限制完善"
echo "  ✓ 日志集成到系统日志"
echo ""
echo "缺点:"
echo "  ✗ 配置相对复杂"
echo "  ✗ 需要 root 权限"
echo ""

# 方案 3: 守护脚本（临时方案）
echo "方案 3: 自定义守护脚本"
echo "----------------------------------------"
echo "优点:"
echo "  ✓ 无需额外依赖"
echo "  ✓ 配置简单，易于理解"
echo "  ✓ 自定义逻辑灵活"
echo ""
echo "缺点:"
echo "  ✗ 稳定性不如 PM2/Systemd"
echo "  ✗ 需要手动管理"
echo ""

echo "=========================================="
echo ""

# ==================== 快速部署 ====================

read -p "选择部署方案 (1/2/3): " choice

case $choice in
    1)
        echo ""
        echo ">>> 部署 PM2 方案"
        echo "----------------------------------------"
        
        # 检查 PM2
        if ! command -v pm2 &> /dev/null; then
            echo "PM2 未安装，正在安装..."
            npm install -g pm2
        fi
        
        # 创建日志目录
        mkdir -p logs
        
        # 启动服务
        pm2 start ecosystem.config.js
        pm2 save
        pm2 startup
        
        echo ""
        echo "✓ PM2 部署完成"
        echo "常用命令:"
        echo "  pm2 status      - 查看状态"
        echo "  pm2 logs        - 查看日志"
        echo "  pm2 restart     - 重启服务"
        echo "  pm2 stop        - 停止服务"
        echo "  pm2 monit       - 监控面板"
        ;;
        
    2)
        echo ""
        echo ">>> 部署 Systemd 方案"
        echo "----------------------------------------"
        
        # 复制服务文件
        sudo cp birdtv.service /etc/systemd/system/
        
        # 重新加载 systemd
        sudo systemctl daemon-reload
        
        # 启动服务
        sudo systemctl enable birdtv
        sudo systemctl start birdtv
        
        echo ""
        echo "✓ Systemd 部署完成"
        echo "常用命令:"
        echo "  systemctl status birdtv    - 查看状态"
        echo "  systemctl restart birdtv   - 重启服务"
        echo "  systemctl stop birdtv      - 停止服务"
        echo "  journalctl -u birdtv      - 查看日志"
        ;;
        
    3)
        echo ""
        echo ">>> 部署守护脚本方案"
        echo "----------------------------------------"
        
        # 启动守护进程
        nohup bash daemon.sh start > daemon.log 2>&1 &
        
        echo ""
        echo "✓ 守护脚本启动完成"
        echo "常用命令:"
        echo "  bash daemon.sh status   - 查看状态"
        echo "  bash daemon.sh restart  - 重启服务"
        echo "  bash daemon.sh stop     - 停止服务"
        echo "  bash daemon.sh clean    - 清理日志"
        ;;
        
    *)
        echo "无效选择"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
