#!/bin/bash

# ============================================================
#  BirdTV 启动脚本
# ============================================================

set -e

cd "$(dirname "$0")"

# ---------- 颜色 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------- 前置检查 ----------
check_node() {
    command -v node >/dev/null 2>&1 || err "未找到 Node.js，请先安装 (>= 18)"
    local v
    v=$(node -v | sed 's/^v//')
    local major
    major=$(echo "$v" | cut -d. -f1)
    if [ "$major" -lt 18 ]; then
        err "Node.js 版本过低: v${v}，需要 >= 18"
    fi
    ok "Node.js v${v}"
}

check_deps() {
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
        warn "未检测到 node_modules，正在安装依赖..."
        npm install --production 2>&1 || err "依赖安装失败"
        ok "依赖安装完成"
    else
        ok "依赖已就绪"
    fi
}

check_env() {
    if [ ! -f ".env" ]; then
        warn ".env 文件不存在，从 .env.example 复制..."
        cp .env.example .env 2>/dev/null || warn ".env.example 也不存在，将使用默认配置"
    fi
}

# ---------- 启动方式 ----------
start_server() {
    local mode="$1"
    info "启动 BirdTV 服务 (${mode}) ..."

    # 加载 .env
    if [ -f ".env" ]; then
        export $(grep -v '^\s*#' .env | grep -v '^\s*$' | xargs)
    fi

    case "$mode" in
        local)
            # 本地开发模式：静态文件从 web/ 目录提供
            exec npx cross-env M3U_PROXY_STATIC_ROOT=web node birdtv.js
            ;;
        prod|production)
            exec node birdtv.js
            ;;
        dev)
            # 开发模式：使用 nodemon 实现热重载（需全局安装 nodemon）
            command -v nodemon >/dev/null 2>&1 || {
                warn "未安装 nodemon，使用普通模式启动 (npm i -g nodemon 可启用热重载)"
                exec npx cross-env M3U_PROXY_STATIC_ROOT=web node birdtv.js
            }
            exec npx cross-env M3U_PROXY_STATIC_ROOT=web nodemon birdtv.js
            ;;
        *)
            exec node birdtv.js
            ;;
    esac
}

# ---------- 用法 ----------
usage() {
    cat <<EOF
用法: $0 [命令]

命令:
  (无参数)       检查环境后启动 BirdTV 服务
  local          本地开发模式 (静态文件从 web/ 目录加载，端口 8771)
  prod           生产模式 (使用 core dump 文件作为静态资源)
  dev            开发模式 (nodemon 热重载)
  install        仅安装依赖
  stop           停止运行中的 BirdTV 进程
  status         查看 BirdTV 运行状态
  logs           查看日志 (Docker 模式)
  docker         使用 Docker Compose 启动
  help           显示此帮助

示例:
  $0              # 默认启动 (本地开发模式)
  $0 local        # 显式指定本地模式
  $0 dev          # 开发模式 (热重载)
  $0 docker       # Docker Compose 启动 (含 Kvrocks)
  $0 stop         # 停止服务
EOF
}

# ---------- 停止 ----------
stop_server() {
    local pids
    pids=$(pgrep -f "node.*birdtv\.js" 2>/dev/null || true)
    if [ -z "$pids" ]; then
        warn "未发现运行中的 BirdTV 进程"
        return
    fi
    info "正在停止 BirdTV (PID: $pids)..."
    echo "$pids" | xargs kill -TERM 2>/dev/null
    sleep 1
    # 强制杀死残留
    pids=$(pgrep -f "node.*birdtv\.js" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null
    fi
    ok "BirdTV 已停止"
}

# ---------- 状态 ----------
show_status() {
    local pids
    pids=$(pgrep -f "node.*birdtv\.js" 2>/dev/null || true)
    if [ -z "$pids" ]; then
        warn "BirdTV 未运行"
    else
        ok "BirdTV 正在运行 (PID: $pids)"
        # 尝试获取端口
        local port
        port=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo "8771")
        info "访问地址: http://localhost:${port}"
    fi
}

# ---------- 主入口 ----------
main() {
    local cmd="${1:-local}"

    case "$cmd" in
        help|--help|-h)
            usage
            ;;
        install)
            check_node
            npm install 2>&1 || err "依赖安装失败"
            ok "依赖安装完成"
            ;;
        stop)
            stop_server
            ;;
        status)
            show_status
            ;;
        logs)
            if command -v docker-compose >/dev/null 2>&1; then
                docker-compose logs -f birdtv
            elif command -v docker >/dev/null 2>&1; then
                docker compose logs -f birdtv
            else
                err "未安装 Docker，无法查看容器日志"
            fi
            ;;
        docker)
            if ! command -v docker >/dev/null 2>&1; then
                err "未安装 Docker，请先安装 Docker 和 Docker Compose"
            fi
            info "使用 Docker Compose 启动..."
            if command -v docker-compose >/dev/null 2>&1; then
                docker-compose up -d --build
            else
                docker compose up -d --build
            fi
            ok "BirdTV 容器已启动"
            info "访问地址: http://localhost:${BIRDTV_PORT:-8771}"
            ;;
        local|prod|production|dev)
            check_node
            check_deps
            check_env
            start_server "$cmd"
            ;;
        *)
            # 无参数时默认本地模式
            check_node
            check_deps
            check_env
            start_server "local"
            ;;
    esac
}

main "$@"
