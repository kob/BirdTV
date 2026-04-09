#!/bin/bash

# 授权管理脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 加载 .env 文件
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# 默认值
AUTH_ENABLED=${AUTH_ENABLED:-false}
REDIS_HOST=${AUTH_REDIS_HOST:-localhost}
REDIS_PORT=${AUTH_REDIS_PORT:-6379}

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Redis 是否可用
check_redis() {
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &> /dev/null; then
            return 0
        fi
    fi
    return 1
}

# 显示授权状态
show_status() {
    echo "=== BirdTV 授权系统状态 ==="
    echo "授权状态: $([ "$AUTH_ENABLED" = "true" ] && echo -e "${GREEN}已启用${NC}" || echo -e "${YELLOW}未启用${NC}")"
    
    if check_redis; then
        echo "Redis 状态: ${GREEN}连接正常${NC} ($REDIS_HOST:$REDIS_PORT)"
    else
        echo "Redis 状态: ${RED}未连接${NC}"
    fi
    
    if [ "$AUTH_ENABLED" = "true" ]; then
        echo ""
        echo "默认管理员: ${AUTH_DEFAULT_ADMIN:-admin}"
        echo "Token有效期: ${AUTH_TOKEN_EXPIRE_DAYS:-7} 天"
    fi
}

# 启用授权
enable_auth() {
    if [ -f .env ]; then
        sed -i 's/^AUTH_ENABLED=.*/AUTH_ENABLED=true/' .env
        echo -e "${GREEN}授权系统已启用${NC}"
        echo "请重启服务以使更改生效"
    else
        echo -e "${RED}错误: .env 文件不存在${NC}"
    fi
}

# 禁用授权
disable_auth() {
    if [ -f .env ]; then
        sed -i 's/^AUTH_ENABLED=.*/AUTH_ENABLED=false/' .env
        echo -e "${YELLOW}授权系统已禁用${NC}"
        echo "请重启服务以使更改生效"
    else
        echo -e "${RED}错误: .env 文件不存在${NC}"
    fi
}

# 创建新用户
create_user() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "用法: $0 create_user <用户名> <密码> [角色]"
        exit 1
    fi
    
    local username="$1"
    local password="$2"
    local role="${3:-user}"
    
    # 这里需要调用 Node.js 脚本来创建用户
    echo "创建用户: $username (角色: $role)"
    node -e "
        const auth = require('./backend/auth.js');
        const crypto = require('crypto');
        const bcrypt = require('bcrypt');
        
        // 模拟配置
        auth.initAuth({
            authEnabled: 'true',
            jwtSecret: 'test-secret',
            tokenExpireDays: '7',
            redisHost: '$REDIS_HOST',
            redisPort: '$REDIS_PORT'
        }).then(async () => {
            try {
                await auth.createUser('$username', '$password', '$role');
                console.log('\\x1b[32m用户创建成功\\x1b[0m');
                process.exit(0);
            } catch (error) {
                console.error('\\x1b[31m创建用户失败:', error.message, '\\x1b[0m');
                process.exit(1);
            }
        });
    "
}

# 列出所有用户
list_users() {
    echo "=== 用户列表 ==="
    node -e "
        const redis = require('redis');
        
        (async () => {
            const client = redis.createClient({
                socket: { host: '$REDIS_HOST', port: parseInt('$REDIS_PORT') }
            });
            
            try {
                await client.connect();
                const keys = await client.keys('auth:user:*');
                
                if (keys.length === 0) {
                    console.log('没有找到用户');
                    process.exit(0);
                }
                
                for (const key of keys) {
                    const data = await client.get(key);
                    const user = JSON.parse(data);
                    console.log(\`  - \${user.username} (\${user.role})\`);
                }
            } catch (error) {
                console.error('Error:', error.message);
            } finally {
                await client.quit();
            }
        })();
    "
}

# 重置管理员密码
reset_admin_password() {
    local new_password="${1:-admin123}"
    
    echo "重置管理员密码"
    node -e "
        const auth = require('./backend/auth.js');
        
        auth.initAuth({
            authEnabled: 'true',
            jwtSecret: 'test-secret',
            tokenExpireDays: '7',
            redisHost: '$REDIS_HOST',
            redisPort: '$REDIS_PORT'
        }).then(async () => {
            try {
                // 这里需要实现重置密码的逻辑
                // 目前需要手动删除旧用户重新创建
                console.log('请在 .env 中设置 AUTH_DEFAULT_PASSWORD，然后重启服务');
                console.log('默认管理员用户名:', process.env.AUTH_DEFAULT_ADMIN || 'admin');
            } catch (error) {
                console.error('Error:', error.message);
                process.exit(1);
            }
        });
    "
}

# 清除所有 Token
clear_tokens() {
    echo "清除所有用户 Token"
    node -e "
        const redis = require('redis');
        
        (async () => {
            const client = redis.createClient({
                socket: { host: '$REDIS_HOST', port: parseInt('$REDIS_PORT') }
            });
            
            try {
                await client.connect();
                const keys = await client.keys('auth:token:*');
                
                if (keys.length === 0) {
                    console.log('没有找到 Token');
                    process.exit(0);
                }
                
                await client.del(keys);
                console.log('\\x1b[32m已清除', keys.length, '个 Token\\x1b[0m');
            } catch (error) {
                console.error('Error:', error.message);
                process.exit(1);
            } finally {
                await client.quit();
            }
        })();
    "
}

# 显示帮助
show_help() {
    echo "BirdTV 授权管理工具"
    echo ""
    echo "用法: $0 [命令] [参数]"
    echo ""
    echo "命令:"
    echo "  status              显示授权系统状态"
    echo "  enable              启用授权系统"
    echo "  disable             禁用授权系统"
    echo "  create_user <user> <pass> [role]  创建新用户"
    echo "  list_users          列出所有用户"
    echo "  reset_admin [pass]  重置管理员密码"
    echo "  clear_tokens        清除所有用户 Token"
    echo "  help                显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 status"
    echo "  $0 create_user testuser testpass user"
    echo "  $0 list_users"
}

# 主逻辑
case "${1:-help}" in
    status)
        show_status
        ;;
    enable)
        enable_auth
        ;;
    disable)
        disable_auth
        ;;
    create_user)
        create_user "$2" "$3" "$4"
        ;;
    list_users)
        list_users
        ;;
    reset_admin)
        reset_admin_password "$2"
        ;;
    clear_tokens)
        clear_tokens
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}错误: 未知命令 '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
