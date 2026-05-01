#!/bin/bash

cd "$(dirname "$0")"

BIRDTV_PORT=8771
[ -f ".env" ] && BIRDTV_PORT=$(grep '^BIRDTV_PORT=' .env | cut -d= -f2)
BIRDTV_PORT=${BIRDTV_PORT:-8771}

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
        if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1; then
            echo "BirdTV 已在运行"
            exit 0
        fi
        [ ! -d "node_modules" ] && echo "安装依赖..." && npm install --production
        echo "启动 BirdTV..."
        ulimit -c 0
        nohup npx cross-env M3U_PROXY_STATIC_ROOT=web node birdtv.js > birdtv.log 2>&1 &
        sleep 1
        if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1; then
            echo "BirdTV 启动成功 -> https://localhost:$((BIRDTV_PORT + 1))"
            echo "  (HTTP 重定向: http://localhost:${BIRDTV_PORT})"
        else
            echo "启动失败，查看 birdtv.log"
        fi
        ;;
    *)
        echo "用法: $0 [start|stop]"
        ;;
esac
