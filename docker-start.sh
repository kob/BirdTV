#!/usr/bin/env bash
set -euo pipefail

# ==================== 颜色定义 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ==================== 路径与配置 ====================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

# ==================== 检查 Docker ====================
check_docker() {
    if ! command -v docker &>/dev/null; then
        error "未安装 Docker，请先安装：https://docs.docker.com/get-docker/"
    fi

    if ! docker info &>/dev/null; then
        error "Docker 未运行，请先启动 Docker"
    fi

    # 检查 docker compose（V2）或 docker-compose（V1）
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        error "未安装 Docker Compose，请先安装：https://docs.docker.com/compose/install/"
    fi

    info "使用 Compose: $COMPOSE_CMD"
}

# ==================== 初始化 .env ====================
init_env() {
    if [[ -f "$ENV_FILE" ]]; then
        info "检测到 .env 文件已存在"
        return
    fi

    if [[ ! -f "$ENV_EXAMPLE" ]]; then
        error "未找到 .env.example 文件"
    fi

    warn ".env 文件不存在，正在从 .env.example 创建..."

    # 生成随机 JWT 密钥
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | head -c 64)

    cp "$ENV_EXAMPLE" "$ENV_FILE"

    # 替换 JWT 密钥
    if [[ -n "$JWT_SECRET" ]]; then
        sed -i "s|^AUTH_JWT_SECRET=.*|AUTH_JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
        info "已自动生成 JWT 密钥"
    fi

    # docker-compose 中 AUTH_REDIS_HOST 默认是 kvrocks，确保 .env 也一致
    sed -i 's|^AUTH_REDIS_HOST=.*|AUTH_REDIS_HOST=kvrocks|' "$ENV_FILE"

    info ".env 文件已创建，JWT 密钥已自动生成"
    echo ""
    warn "请检查 .env 中的以下配置："
    warn "  - AUTH_DEFAULT_PASSWORD  （默认 admin123，请修改）"
    warn "  - AUTH_DEFAULT_ADMIN     （默认 admin）"
    warn "  - M3U_PROXY_TIMEOUT_MS   （默认 40000ms）"
    echo ""
}

# ==================== 显示菜单 ====================
show_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║          BirdTV Docker 管理          ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  1. 启动服务                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  2. 停止服务                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  3. 重启服务                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  4. 查看状态                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  5. 查看日志                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  6. 更新镜像并重启                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  7. 重置数据（危险）                  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  0. 退出                             ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
    echo ""
    read -rp "请选择操作 [0-7]: " choice
}

# ==================== 启动服务 ====================
do_start() {
    info "正在启动 BirdTV 服务..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" up -d

    echo ""
    info "等待 KVRocks 健康检查..."
    local retry=0
    while [[ $retry -lt 30 ]]; do
        if docker exec birdtv-kvrocks curl -sf http://localhost:6666 &>/dev/null; then
            break
        fi
        retry=$((retry + 1))
        sleep 2
    done

    if [[ $retry -eq 30 ]]; then
        warn "KVRocks 健康检查超时，请手动确认"
    else
        info "KVRocks 已就绪"
    fi

    # 获取映射端口
    local port
    port=$(docker port birdtv 8771/tcp 2>/dev/null | head -1 | cut -d: -f2 || echo "8771")

    echo ""
    info "BirdTV 已启动！"
    info "访问地址: http://localhost:${port}"
    info "默认账号: admin / admin123"
    info "请登录后立即修改密码！"
}

# ==================== 停止服务 ====================
do_stop() {
    info "正在停止 BirdTV 服务..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" down
    info "服务已停止"
}

# ==================== 重启服务 ====================
do_restart() {
    info "正在重启 BirdTV 服务..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" restart
    info "服务已重启"
}

# ==================== 查看状态 ====================
do_status() {
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" ps
}

# ==================== 查看日志 ====================
do_logs() {
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" logs -f --tail=100 birdtv
}

# ==================== 更新镜像 ====================
do_update() {
    info "正在拉取最新镜像..."
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" pull

    info "正在重启服务..."
    $COMPOSE_CMD --env-file "$ENV_FILE" up -d

    info "更新完成！"
}

# ==================== 重置数据 ====================
do_reset() {
    echo -e "${RED}⚠️  警告：此操作将删除所有数据（频道、用户、设置等），不可恢复！${NC}"
    read -rp "确认要重置吗？输入 YES 继续: " confirm
    if [[ "$confirm" != "YES" ]]; then
        info "已取消"
        return
    fi

    cd "$SCRIPT_DIR"
    $COMPOSE_CMD --env-file "$ENV_FILE" down -v
    info "所有数据已清除，重新启动请选择 1"
}

# ==================== 主流程 ====================
main() {
    check_docker
    init_env

    # 如果带参数，直接执行对应操作
    case "${1:-}" in
        start)   do_start;  return ;;
        stop)    do_stop;   return ;;
        restart) do_restart; return ;;
        status)  do_status; return ;;
        logs)    do_logs;   return ;;
        update)  do_update; return ;;
        reset)   do_reset;  return ;;
    esac

    # 交互式菜单
    while true; do
        show_menu
        case "$choice" in
            1) do_start  ;;
            2) do_stop   ;;
            3) do_restart ;;
            4) do_status ;;
            5) do_logs   ;;
            6) do_update ;;
            7) do_reset  ;;
            0) info "再见！"; exit 0 ;;
            *) error "无效选择" ;;
        esac
        echo ""
        read -rp "按回车键继续..."
    done
}

main "$@"
