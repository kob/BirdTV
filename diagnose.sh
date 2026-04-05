#!/bin/bash

# BirdTV 服务诊断工具
# 用于排查服务自动停止的问题

cd "$(dirname "$0")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} BirdTV 服务诊断工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 检查进程状态
echo -e "${YELLOW}[1] 检查进程状态${NC}"
echo "----------------------------------------"

PORT=8771
[ -f ".env" ] && PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)
PORT=${PORT:-8771}

if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1; then
    PID=$(pgrep -f "node.*birdtv\.js" | head -1)
    echo -e "进程状态: ${GREEN}运行中${NC} (PID: ${PID})"
    
    # 显示资源占用
    if [ -n "${PID}" ]; then
        MEM=$(ps -p ${PID} -o rss= 2>/dev/null | awk '{print int($1/1024)"MB"}')
        CPU=$(ps -p ${PID} -o %cpu= 2>/dev/null)
        UPTIME=$(ps -p ${PID} -o etimes= 2>/dev/null | awk '{printf "%.2f小时", $1/3600}')
        echo "内存占用: ${MEM}"
        echo "CPU 占用: ${CPU}%"
        echo "运行时长: ${UPTIME}"
        
        # 检查是否超过内存限制
        MEM_KB=$(ps -p ${PID} -o rss= 2>/dev/null | awk '{print $1}')
        if [ "${MEM_KB}" -gt 524288 ]; then  # 512MB
            echo -e "${RED}警告: 内存占用超过 512MB，可能导致被系统杀掉${NC}"
        fi
    fi
else
    echo -e "进程状态: ${RED}已停止${NC}"
fi

# 2. 检查端口监听
echo ""
echo -e "${YELLOW}[2] 检查端口监听${NC}"
echo "----------------------------------------"

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    echo -e "端口 ${PORT}: ${GREEN}已监听${NC}"
    ss -tlnp 2>/dev/null | grep ":${PORT} "
else
    echo -e "端口 ${PORT}: ${RED}未监听${NC}"
fi

# 3. 检查日志
echo ""
echo -e "${YELLOW}[3] 检查日志文件${NC}"
echo "----------------------------------------"

if [ -f "birdtv.log" ]; then
    LOG_SIZE=$(du -h birdtv.log | cut -f1)
    LOG_LINES=$(wc -l < birdtv.log)
    echo "日志文件: birdtv.log"
    echo "文件大小: ${LOG_SIZE}"
    echo "总行数: ${LOG_LINES}"
    
    # 检查最近的错误
    echo ""
    echo "最近的错误日志 (最后 10 条):"
    echo "----------------------------------------"
    grep -i "error\|exception\|fatal\|failed" birdtv.log | tail -10 || echo "  无错误日志"
    
    # 检查内存溢出
    echo ""
    echo "检查内存溢出:"
    if grep -q "JavaScript heap out of memory\|ENOMEM\|Killed" birdtv.log; then
        echo -e "  ${RED}✗ 检测到内存溢出错误${NC}"
        grep "JavaScript heap out of memory\|ENOMEM\|Killed" birdtv.log | tail -3
    else
        echo -e "  ${GREEN}✓ 未检测到内存溢出${NC}"
    fi
    
    # 检查端口占用
    echo ""
    echo "检查端口占用:"
    if grep -q "EADDRINUSE\|already in use\|port.*already" birdtv.log; then
        echo -e "  ${RED}✗ 检测到端口占用错误${NC}"
        grep "EADDRINUSE\|already in use\|port.*already" birdtv.log | tail -3
    else
        echo -e "  ${GREEN}✓ 未检测到端口冲突${NC}"
    fi
else
    echo "  日志文件不存在"
fi

# 4. 检查系统资源
echo ""
echo -e "${YELLOW}[4] 检查系统资源${NC}"
echo "----------------------------------------"

# 可用内存
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
AVAILABLE_MEM=$(free -m | awk 'NR==2{print $7}')
echo "总内存: ${TOTAL_MEM} MB"
echo "可用内存: ${AVAILABLE_MEM} MB"

if [ "${AVAILABLE_MEM}" -lt 512 ]; then
    echo -e "${RED}警告: 可用内存不足 512MB${NC}"
else
    echo -e "${GREEN}内存充足${NC}"
fi

# 磁盘空间
DISK_USAGE=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h . | tail -1 | awk '{print $4}')
echo "磁盘使用: ${DISK_USAGE}%"
echo "可用空间: ${DISK_AVAIL}"

if [ "${DISK_USAGE}" -gt 90 ]; then
    echo -e "${RED}警告: 磁盘使用率超过 90%${NC}"
else
    echo -e "${GREEN}磁盘空间充足${NC}"
fi

# 5. 网络连接
echo ""
echo -e "${YELLOW}[5] 检查网络连接${NC}"
echo "----------------------------------------"

if pgrep -f "node.*birdtv\.js" >/dev/null 2>&1; then
    PID=$(pgrep -f "node.*birdtv\.js" | head -1)
    CONN_COUNT=$(ss -tnp 2>/dev/null | grep "${PID}" | wc -l)
    echo "当前连接数: ${CONN_COUNT}"
    
    if [ "${CONN_COUNT}" -gt 1000 ]; then
        echo -e "${YELLOW}注意: 连接数较多 (${CONN_COUNT})${NC}"
    else
        echo -e "${GREEN}连接数正常${NC}"
    fi
else
    echo "  服务未运行，无法检查连接"
fi

# 6. 检查 Redis 连接
echo ""
echo -e "${YELLOW}[6] 检查 Redis 连接${NC}"
echo "----------------------------------------"

REDIS_HOST=$(grep '^AUTH_REDIS_HOST' .env 2>/dev/null | cut -d= -f2)
REDIS_PORT=$(grep '^AUTH_REDIS_PORT' .env 2>/dev/null | cut -d= -f2)

if [ -n "${REDIS_HOST}" ]; then
    echo "Redis 配置: ${REDIS_HOST}:${REDIS_PORT}"
    
    if command -v redis-cli &> /dev/null; then
        if timeout 3 redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} ping 2>/dev/null | grep -q PONG; then
            echo -e "Redis 连接: ${GREEN}正常${NC}"
        else
            echo -e "Redis 连接: ${RED}失败${NC}"
        fi
    else
        echo "  redis-cli 未安装，无法测试连接"
    fi
else
    echo "  未配置 Redis"
fi

# 7. 服务健康检查
echo ""
echo -e "${YELLOW}[7] 服务健康检查${NC}"
echo "----------------------------------------"

HEALTH_URL="http://localhost:${PORT}/health"
if command -v curl &> /dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" ${HEALTH_URL} --max-time 5 || echo "000")
    
    if [ "${HTTP_CODE}" = "200" ]; then
        echo -e "健康检查: ${GREEN}通过${NC} (HTTP ${HTTP_CODE})"
    else
        echo -e "健康检查: ${RED}失败${NC} (HTTP ${HTTP_CODE})"
    fi
else
    echo "  curl 未安装，无法进行健康检查"
fi

# 8. 建议和解决方案
echo ""
echo -e "${YELLOW}[8] 诊断建议${NC}"
echo "----------------------------------------"

# 分析常见问题
if [ -f "birdtv.log" ]; then
    if grep -q "JavaScript heap out of memory" birdtv.log; then
        echo -e "${RED}✗ 内存溢出问题${NC}"
        echo "  解决方案:"
        echo "  1. 增加 Node.js 内存限制: node --max-old-space-size=2048 birdtv.js"
        echo "  2. 优化代码内存使用"
        echo "  3. 检查是否有内存泄漏"
        echo ""
    fi
    
    if grep -q "ECONNREFUSED\|ETIMEDOUT" birdtv.log | tail -20; then
        echo -e "${RED}✗ 网络连接问题${NC}"
        echo "  解决方案:"
        echo "  1. 检查网络连接稳定性"
        echo "  2. 增加请求超时时间"
        echo "  3. 考虑使用 Cloudflare Worker 代理"
        echo ""
    fi
    
    if grep -q "403\|cf-mitigated" birdtv.log | tail -20; then
        echo -e "${RED}✗ Cloudflare WAF 拦截${NC}"
        echo "  解决方案:"
        echo "  1. 配置 CLOUDFLARE_WORKER_URL"
        echo "  2. 查阅 CLOUDFLARE_WAF_SOLUTION.md"
        echo ""
    fi
fi

if [ "${AVAILABLE_MEM}" -lt 512 ]; then
    echo -e "${YELLOW}✗ 系统内存不足${NC}"
    echo "  解决方案:"
    echo "  1. 关闭不必要的进程"
    echo "  2. 增加服务器内存"
    echo "  3. 使用进程管理器限制内存使用"
    echo ""
fi

echo -e "${GREEN}✓ 诊断完成${NC}"
echo ""
echo "推荐操作:"
echo "  1. 如果服务停止，使用以下命令重启:"
echo "     bash deploy-service.sh    # 选择 PM2 或 Systemd 部署"
echo "  2. 查看实时日志:"
echo "     tail -f birdtv.log"
echo "  3. 使用 PM2 监控:"
echo "     pm2 monit"
echo ""
