#!/bin/bash
# BirdTV 软路由/嵌入式设备 Docker 部署脚本
# 支持: OpenWrt, LEDE, ASUSWRT-Merlin, PandoraBox 等

set -e

echo "=========================================="
echo "  BirdTV 软路由 Docker 部署脚本"
echo "=========================================="
echo ""

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "[INFO] Docker 未安装，正在安装..."
        install_docker
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo "[INFO] Docker Compose 未安装，正在安装..."
        install_docker_compose
    fi
    
    echo "[OK] Docker 环境就绪"
}

# 安装 Docker (OpenWrt)
install_docker() {
    echo "[INFO] 安装 Docker..."
    
    if [ -f /etc/openwrt_release ]; then
        # OpenWrt
        opkg update
        opkg install docker dockerd
    elif [ -f /etc/armbian-release ]; then
        # Armbian (OrangePi, RockPi, etc.)
        curl -fsSL https://get.docker.com | sh
    elif [ -f /etc/debian_version ]; then
        # Debian/Ubuntu on router
        curl -fsSL https://get.docker.com | sh
    else
        echo "[ERROR] 不支持的平台"
        exit 1
    fi
}

# 安装 Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then return; fi
    
    echo "[INFO] 安装 Docker Compose..."
    
    if command -v python3 &> /dev/null; then
        pip3 install docker-compose
    else
        # 手动安装
        curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi
}

# 创建配置目录
setup_dirs() {
    echo "[INFO] 创建配置目录..."
    
    CONFIG_DIR="/opt/birdtv"
    mkdir -p $CONFIG_DIR/{data,config,logs}
    
    # 设置权限
    chmod -R 755 $CONFIG_DIR
}

# 生成 docker-compose.yml
create_docker_compose() {
    echo "[INFO] 生成 Docker Compose 配置..."
    
    cat > docker-compose.yml << 'EOF'
version: "3.8"

services:
  birdtv:
    image: registry.cn-shanghai.aliyuncs.com/birdtv/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    ports:
      - "8771:8771"
    environment:
      - NODE_ENV=production
      - PORT=8771
      - REDIS_ENABLED=${REDIS_ENABLED:-false}
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data
      - ./config:/app/config
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8771/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # 可选: Redis 缓存
  redis:
    image: redis:7-alpine
    container_name: birdtv-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  redis_data:
EOF
}

# 生成环境配置
create_env() {
    echo "[INFO] 生成环境配置..."
    
    cat > .env << 'EOF'
# BirdTV 配置
PORT=8771
REDIS_ENABLED=false

# 可选: Redis 配置 (REDIS_ENABLED=true 时生效)
# REDIS_HOST=redis
# REDIS_PORT=6379
# REDIS_PASSWORD=your-redis-password

# 可选: 管理员账户
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=admin123

# 时区
TZ=Asia/Shanghai
EOF
}

# 拉取镜像
pull_image() {
    echo "[INFO] 拉取 Docker 镜像..."
    
    # 使用阿里云加速
    docker pull registry.cn-shanghai.aliyuncs.com/birdtv/birdtv:latest || \
    docker pull ghcr.io/birdtv/birdtv:latest || \
    echo "[WARN] 镜像拉取失败，将使用本地构建"
}

# 启动服务
start_services() {
    echo "[INFO] 启动服务..."
    
    docker compose up -d
    
    sleep 3
    
    if docker compose ps | grep -q "Up"; then
        echo "[OK] 服务启动成功!"
    else
        echo "[ERROR] 服务启动失败"
        docker compose logs
        exit 1
    fi
}

# 防火墙/端口转发配置
setup_firewall() {
    echo "[INFO] 配置防火墙规则..."
    
    # iptables
    if command -v iptables &> /dev/null; then
        iptables -I INPUT -p tcp --dport 8771 -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
        
        # 保存规则
        if command -v iptables-save &> /dev/null; then
            iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
        fi
    fi
    
    # UFW
    if command -v ufw &> /dev/null; then
        ufw allow 8771/tcp
        ufw reload
    fi
}

# OpenWrt 特定配置
setup_openwrt() {
    if [ ! -f /etc/openwrt_release ]; then return; fi
    
    echo "[INFO] OpenWrt 特定配置..."
    
    # 启用 Docker daemon
    cat > /etc/init.d/dockerd << 'DOCKERD_EOF'
#!/bin/sh /etc/rc.common
START=95
STOP=1
USE_PROCD=0

start() {
    service_start /usr/bin/dockerd
}

stop() {
    service_stop /usr/bin/dockerd
}
DOCKERD_EOF

    chmod +x /etc/init.d/dockerd
    /etc/init.d/dockerd enable
    
    # 开机自启
    cat >> /etc/rc.local << 'RC_LOCAL_EOF'

# BirdTV Auto Start
cd /opt/birdtv && docker compose up -d
RC_LOCAL_EOF
}

# 显示状态
show_status() {
    echo ""
    echo "=========================================="
    echo "  服务状态"
    echo "=========================================="
    docker compose ps
    echo ""
    echo "访问地址: http://$(hostname -I | awk '{print $1}'):8771"
    echo ""
    echo "管理命令:"
    echo "  cd /opt/birdtv"
    echo "  docker compose ps          # 查看状态"
    echo "  docker compose logs -f     # 查看日志"
    echo "  docker compose restart     # 重启服务"
    echo "  docker compose down        # 停止服务"
    echo "  docker compose pull        # 更新镜像"
    echo "=========================================="
}

# 停止服务
stop_services() {
    echo "[INFO] 停止服务..."
    docker compose down
    echo "[OK] 服务已停止"
}

# 主流程
main() {
    check_docker
    setup_dirs
    create_docker_compose
    create_env
    pull_image
    start_services
    setup_firewall
    
    if [ -f /etc/openwrt_release ]; then
        setup_openwrt
    fi
    
    show_status
}

# 卸载
uninstall() {
    echo "[WARN] 即将卸载 BirdTV..."
    docker compose down -v
    rm -rf /opt/birdtv
    echo "[OK] 卸载完成"
}

# 帮助
usage() {
    cat << USAGE
用法: $0 {start|stop|restart|status|logs|uninstall}

命令:
  start     - 启动服务
  stop      - 停止服务
  restart   - 重启服务
  status    - 查看状态
  logs      - 查看日志
  uninstall - 卸载

示例:
  # 一键部署
  ./deploy-router.sh start
  
  # 查看日志
  ./deploy-router.sh logs
  
  # 更新版本
  cd /opt/birdtv && docker compose pull && docker compose up -d
USAGE
}

# 执行
case "${1:-start}" in
    start)
        main
        ;;
    stop)
        cd /opt/birdtv && stop_services
        ;;
    restart)
        cd /opt/birdtv && stop_services && start_services
        ;;
    status)
        cd /opt/birdtv && show_status
        ;;
    logs)
        cd /opt/birdtv && docker compose logs -f --tail=100
        ;;
    uninstall)
        uninstall
        ;;
    *)
        usage
        ;;
esac
