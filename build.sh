#!/bin/bash
# BirdTV 前后端分离 - 生产构建脚本
#
# 使用方式:
#   ./build.sh          # 构建前端 + 安装后端依赖
#   ./build.sh docker   # 构建 Docker 镜像

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/web-vue"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[Build]${NC} $1"; }

# 构建前端
log "构建前端 (Vue 3 + Vite)..."
cd "$WEB_DIR"
npm install
npm run build
log "前端构建完成: $WEB_DIR/dist/"

# 安装后端依赖
log "安装后端依赖 (production)..."
cd "$SERVER_DIR"
npm install --production
log "后端依赖安装完成"

echo ""
log "构建完成！"
echo -e "  ${CYAN}前端产物:${NC} $WEB_DIR/dist/"
echo -e "  ${CYAN}后端入口:${NC} $SERVER_DIR/server.js"
echo ""
echo "启动方式:"
echo "  开发模式: SERVE_STATIC=true node $SERVER_DIR/server.js"
echo "  独立部署: 前端部署到 CDN，后端运行 API 服务"
