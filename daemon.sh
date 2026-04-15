#!/bin/bash

# BirdTV 守护进程管理脚本
# 自动监控服务运行状态，异常退出时自动重启

cd "$(dirname "$0")"

# 配置
LOG_FILE="daemon.log"
SERVICE_NAME="birdtv"
CHECK_INTERVAL=30  # 检查间隔（秒）
MAX_RESTART_COUNT=10  # 最大重启次数
RESTART_WINDOW=300  # 重启窗口（秒）

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 初始化重启计数
declare -A restart_times
restart_count=0

# 日志函数
log() {
    local level=$1
    shift
    local msg="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${msg}" | tee -a "${LOG_FILE}"
}

# 检查服务是否运行
check_service() {
    local port=8771
    [ -f ".env" ] && port=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)
    port=${port:-8771}

    # 检查进程和端口
    if pgrep -f "node.*${SERVICE_NAME}\.js" >/dev/null 2>&1 && \
       ss -tlnp 2>/dev/null | grep -q ":${port} "; then
        return 0  # 运行中
    else
        return 1  # 未运行
    fi
}

# 启动服务
start_service() {
    # 禁止生成 core 文件
    ulimit -c 0
    log "INFO" "正在启动 ${SERVICE_NAME}..."

    # 清理可能的僵尸进程
    pkill -9 -f "node.*${SERVICE_NAME}\.js" 2>/dev/null

    # 每次启动前拉取最新代码
    log "INFO" "正在拉取最新代码..."
    if git pull origin $(git rev-parse --abbrev-ref HEAD) 2>&1 | tee -a "${LOG_FILE}"; then
        log "INFO" "代码已更新"
    else
        log "WARN" "代码更新失败，继续启动..."
    fi

    # 启动服务
    [ ! -d "node_modules" ] && log "INFO" "安装依赖..." && npm install --production --silent

    nohup node ${SERVICE_NAME}.js >> birdtv.log 2>&1 &
    local pid=$!

    sleep 2

    if check_service; then
        log "SUCCESS" "${SERVICE_NAME} 启动成功 (PID: ${pid})"
        return 0
    else
        log "ERROR" "${SERVICE_NAME} 启动失败"
        return 1
    fi
}

# 停止服务
stop_service() {
    log "INFO" "正在停止 ${SERVICE_NAME}..."

    if pgrep -f "node.*${SERVICE_NAME}\.js" >/dev/null 2>&1; then
        pkill -f "node.*${SERVICE_NAME}\.js"
        sleep 2

        # 强制杀死残留进程
        if pgrep -f "node.*${SERVICE_NAME}\.js" >/dev/null 2>&1; then
            log "WARN" "强制停止进程"
            pkill -9 -f "node.*${SERVICE_NAME}\.js"
        fi

        log "SUCCESS" "${SERVICE_NAME} 已停止"
    else
        log "INFO" "${SERVICE_NAME} 未在运行"
    fi
}

# 重启服务
restart_service() {
    log "INFO" "正在重启 ${SERVICE_NAME}..."
    stop_service
    sleep 1
    start_service
}

# 检查并清理重启计数
check_restart_limit() {
    local current_time=$(date +%s)
    local window_start=$((current_time - RESTART_WINDOW))

    # 清理过期的重启记录
    for timestamp in "${!restart_times[@]}"; do
        if [ "${timestamp}" -lt "${window_start}" ]; then
            unset restart_times[${timestamp}]
        fi
    done

    restart_count=${#restart_times[@]}

    if [ "${restart_count}" -ge "${MAX_RESTART_COUNT}" ]; then
        log "ERROR" "重启次数过多 (${restart_count}/${MAX_RESTART_COUNT})，停止自动重启"
        log "ERROR" "请检查日志文件 birdtv.log 排查问题"
        return 1
    fi

    return 0
}

# 记录重启时间
record_restart() {
    local timestamp=$(date +%s)
    restart_times[${timestamp}]=1
}

# 守护循环
daemon_loop() {
    log "INFO" "守护进程启动，监控间隔: ${CHECK_INTERVAL}秒"
    log "INFO" "最大重启次数: ${MAX_RESTART_COUNT} 次 / ${RESTART_WINDOW} 秒"

    while true; do
        if ! check_service; then
            log "WARN" "检测到服务异常停止"

            # 检查重启限制
            if check_restart_limit; then
                record_restart
                log "INFO" "尝试重启 (${restart_count}/${MAX_RESTART_COUNT})"

                if start_service; then
                    log "INFO" "服务已恢复运行"
                else
                    log "ERROR" "服务启动失败，将在 ${CHECK_INTERVAL} 秒后重试"
                fi
            else
                log "ERROR" "达到重启上限，停止监控"
                exit 1
            fi
        fi

        sleep ${CHECK_INTERVAL}
    done
}

# 显示状态
show_status() {
    local port=8771
    [ -f ".env" ] && port=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)
    port=${port:-8771}

    echo "=== BirdTV 服务状态 ==="
    echo ""
    echo "服务名称: ${SERVICE_NAME}"
    echo "监听端口: ${port}"

    if check_service; then
        echo -e "运行状态: ${GREEN}运行中${NC}"

        # 显示 PID 和内存占用
        local pid=$(pgrep -f "node.*${SERVICE_NAME}\.js" | head -1)
        if [ -n "${pid}" ]; then
            local mem=$(ps -p ${pid} -o rss= 2>/dev/null | awk '{print int($1/1024)"MB"}')
            local cpu=$(ps -p ${pid} -o %cpu= 2>/dev/null)
            local uptime=$(ps -p ${pid} -o etimes= 2>/dev/null | awk '{printf "%.2f小时", $1/3600}')
            echo "进程 PID: ${pid}"
            echo "内存占用: ${mem}"
            echo "CPU 占用: ${cpu}%"
            echo "运行时长: ${uptime}"
        fi
    else
        echo -e "运行状态: ${RED}已停止${NC}"
    fi

    # 检查日志文件
    if [ -f "birdtv.log" ]; then
        local log_size=$(du -h birdtv.log | cut -f1)
        echo "日志大小: ${log_size}"
    fi

    echo ""
}

# 清理日志
clean_logs() {
    log "INFO" "清理日志文件..."

    # 备份最近 7 天的日志
    find . -name "birdtv.log.*" -mtime +7 -delete 2>/dev/null

    # 压缩当前日志
    if [ -f "birdtv.log" ] && [ $(stat -f%z birdtv.log 2>/dev/null || stat -c%s birdtv.log) -gt 10485760 ]; then
        local archive_name="birdtv.log.$(date +%Y%m%d_%H%M%S).gz"
        gzip -c birdtv.log > "${archive_name}"
        echo "" > birdtv.log
        log "INFO" "日志已归档: ${archive_name}"
    fi
}

# 主函数
main() {
    case "${1:-start}" in
        start)
            if check_service; then
                log "INFO" "服务已在运行，跳过启动"
            else
                start_service
                daemon_loop
            fi
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            show_status
            ;;
        daemon)
            daemon_loop
            ;;
        clean)
            clean_logs
            ;;
        *)
            echo "用法: $0 {start|stop|restart|status|daemon|clean}"
            echo ""
            echo "命令说明:"
            echo "  start   - 启动服务并进入守护模式"
            echo "  stop    - 停止服务"
            echo "  restart - 重启服务"
            echo "  status  - 显示服务状态"
            echo "  daemon  - 仅运行守护循环（用于手动管理）"
            echo "  clean   - 清理和归档日志"
            exit 1
            ;;
    esac
}

main "$@"
