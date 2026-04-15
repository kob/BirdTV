#!/bin/bash
# BirdTV Docker 快速部署脚本 (通用版)

set -e

echo "=========================================="
echo "  BirdTV Docker 一键部署"
echo "=========================================="

# 配置
NAME="birdtv"
PORT=${PORT:-8771}
DATA_DIR="./birdtv-data"

# 颜色
GREEN='\033[0;32m'
NC='\033[0m'

# 创建目录
mkdir -p $DATA_DIR/{data,config,logs}

# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  birdtv:
    image: ghcr.io/birdtv/birdtv:latest
    container_name: birdtv
    restart: unless-stopped
    ports:
      - "8771:8771"
    environment:
      - NODE_ENV=production
      - PORT=8771
      - REDIS_ENABLED=false
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data
      - ./config:/app/config
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8771/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

# 启动
case "${1:-up}" in
    up)
        echo -e "${GREEN}[INFO]${NC} 启动服务..."
        docker compose up -d
        echo -e "${GREEN}[OK]${NC} 服务已启动"
        echo "访问地址: http://localhost:8771"
        ;;
    down)
        echo -e "${GREEN}[INFO]${NC} 停止服务..."
        docker compose down
        ;;
    restart)
        echo -e "${GREEN}[INFO]${NC} 重启服务..."
        docker compose restart
        ;;
    logs)
        docker compose logs -f --tail=50
        ;;
    status)
        docker compose ps
        ;;
    update)
        echo -e "${GREEN}[INFO]${NC} 更新镜像..."
        docker compose pull
        docker compose up -d
        ;;
    *)
        echo "用法: $0 {up|down|restart|logs|status|update}"
        ;;
esac
