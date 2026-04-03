#!/bin/bash

cd "$(dirname "$0")"

PORT=8771
[ -f ".env" ] && PORT=$(grep '^PORT=' .env | cut -d= -f2)
PORT=${PORT:-8771}

case "${1:-start}" in
    stop)
        if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1; then
            echo "停止 BirdTV..."
            pkill -f "node.*birdtv\.js"
            echo "已停止"
        else
            echo "BirdTV 未在运行"
        fi
        ;;
    start)
        if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
            echo "BirdTV 已在运行 (端口 ${PORT})"
            exit 0
        fi
        [ ! -d "node_modules" ] && echo "安装依赖..." && npm install --production
        echo "启动 BirdTV (端口 ${PORT})..."
        nohup npx cross-env M3U_PROXY_STATIC_ROOT=web node birdtv.js > birdtv.log 2>&1 &
        sleep 1
        if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1; then
            echo "BirdTV 启动成功 -> http://localhost:${PORT}"
        else
            echo "启动失败，查看 birdtv.log"
        fi
        ;;
    *)
        echo "用法: $0 [start|stop]"
        ;;
esac
