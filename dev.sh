#!/bin/bash
# BirdTV 前后端分离 - 开发环境启动脚本
#
# 使用方式:
#   ./dev.sh           # 同时启动前后端
#   ./dev.sh server    # 仅启动后端
#   ./dev.sh web       # 仅启动前端
#   ./dev.sh install   # 安装依赖

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/web-vue"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[BirdTV]${NC} $1"; }
warn() { echo -e "${YELLOW}[BirdTV]${NC} $1"; }

install_deps() {
  log "安装后端依赖..."
  cd "$SERVER_DIR" && npm install

  log "安装前端依赖..."
  cd "$WEB_DIR" && npm install

  log "依赖安装完成"
}

start_server() {
  log "启动后端 API 服务器 (端口 8771)..."
  cd "$SERVER_DIR"
  npx nodemon server.js &
  SERVER_PID=$!
}

start_web() {
  log "启动前端开发服务器 (端口 5173)..."
  cd "$WEB_DIR"
  npx vite --host &
  WEB_PID=$!
}

cleanup() {
  warn "正在停止服务..."
  [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null
  [ -n "$WEB_PID" ] && kill $WEB_PID 2>/dev/null
  wait 2>/dev/null
  log "已停止"
  exit 0
}

trap cleanup SIGINT SIGTERM

case "${1:-all}" in
  install)
    install_deps
    ;;
  server)
    start_server
    wait
    ;;
  web)
    start_web
    wait
    ;;
  all)
    start_server
    start_web
    echo ""
    log "前后端分离开发环境已启动:"
    echo -e "  ${CYAN}前端:${NC} http://localhost:5173"
    echo -e "  ${CYAN}后端:${NC} http://localhost:8771"
    echo -e "  ${CYAN}API: ${NC} http://localhost:8771/api/"
    echo -e "  ${CYAN}健康:${NC} http://localhost:8771/health"
    echo ""
    warn "按 Ctrl+C 停止所有服务"
    wait
    ;;
  *)
    echo "用法: $0 [install|server|web|all]"
    exit 1
    ;;
esac
