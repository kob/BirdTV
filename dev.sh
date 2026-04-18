#!/bin/bash
# BirdTV 开发模式启动脚本
# 同时启动后端 API 和 Vite 开发服务器

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "====================================="
echo "  BirdTV 开发模式"
echo "====================================="

# 启动后端（使用 web/ 原版静态文件）
echo "[1/2] 启动后端 API (端口 8771)..."
cd "$ROOT_DIR"
BIRDTV_STATIC_ROOT="$ROOT_DIR/web" node birdtv.js &
BACKEND_PID=$!

# 等待后端启动
sleep 2

# 启动 Vite 开发服务器
echo "[2/2] 启动 Vite 开发服务器 (端口 5173)..."
cd "$ROOT_DIR/web"
npx vite --host 0.0.0.0 --port 5173 &
VITE_PID=$!

echo ""
echo "====================================="
echo "  后端 API:     http://localhost:8771"
echo "  前端开发:     http://localhost:5173"
echo "  (Vite 自动代理 API 请求到后端)"
echo "====================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

cleanup() {
  echo "正在停止服务..."
  kill $BACKEND_PID $VITE_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

wait
