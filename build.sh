#!/bin/bash
# BirdTV 构建脚本
# 构建前端，后端自动检测 web/dist/ 并使用构建产物

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "====================================="
echo "  BirdTV 前端构建"
echo "====================================="

cd "$ROOT_DIR/web"

if [ ! -d "node_modules" ]; then
  echo "安装前端依赖..."
  npm install
fi

echo "构建前端..."
npx vite build

echo ""
echo "====================================="
echo "  构建完成！"
echo ""
echo "  启动生产模式："
echo "  cd $ROOT_DIR && node birdtv.js"
echo ""
echo "  后端会自动使用 web/dist/ 构建产物"
echo "====================================="
