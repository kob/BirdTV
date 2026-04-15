#!/bin/bash
# BirdTV VPS 一键部署脚本 (支持 Ubuntu/Debian/CentOS)

set -e

echo "=========================================="
echo "  BirdTV VPS 一键部署脚本"
echo "=========================================="
echo ""

# 配置
INSTALL_DIR="/opt/birdtv"
SERVICE_NAME="birdtv"
PORT=${PORT:-8771}
REDIS_ENABLED=${REDIS_ENABLED:-false}
DOMAIN=${DOMAIN:-""}

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 root 权限
if [[ $EUID -ne 0 ]]; then
   log_error "请使用 root 权限运行此脚本"
   exit 1
fi

# 检测系统
detect_os() {
    if [ -f /etc/debian_version ]; then
        OS="debian"
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
    elif [ -f /etc/rocky-release ]; then
        OS="centos"
    elif [ -f /etc/alpine-release ]; then
        OS="alpine"
    else
        OS="unknown"
    fi
}

# 安装依赖
install_deps() {
    log_info "安装系统依赖..."
    
    case $OS in
        debian)
            apt-get update -qq
            apt-get install -y -qq curl git nginx certbot > /dev/null 2>&1
            ;;
        centos)
            yum install -y -q curl git nginx > /dev/null 2>&1
            ;;
        alpine)
            apk add --quiet curl git nginx > /dev/null 2>&1
            ;;
    esac
    
    log_info "依赖安装完成"
}

# 创建用户
create_user() {
    if ! id -u $SERVICE_NAME > /dev/null 2>&1; then
        useradd -r -s /bin/false $SERVICE_NAME
        log_info "创建系统用户: $SERVICE_NAME"
    fi
}

# 下载/更新代码
deploy_code() {
    log_info "部署 BirdTV 到 $INSTALL_DIR..."
    
    mkdir -p $INSTALL_DIR
    cd $INSTALL_DIR
    
    # 如果是 git 仓库则 pull，否则全新克隆
    if [ -d ".git" ]; then
        log_info "更新现有代码..."
        git pull origin main
    else
        log_info "克隆代码仓库..."
        # 替换为你的仓库地址
        if [ -z "$GIT_REPO" ]; then
            log_error "请设置环境变量 GIT_REPO 指定仓库地址"
            exit 1
        fi
        git clone $GIT_REPO .
    fi
    
    # 安装 Node 依赖
    log_info "安装 Node 依赖..."
    npm install --production
    
    chown -R $SERVICE_NAME:$SERVICE_NAME $INSTALL_DIR
    log_info "代码部署完成"
}

# 配置环境变量
configure_env() {
    log_info "配置环境变量..."
    
    cat > $INSTALL_DIR/.env << EOF
PORT=$PORT
NODE_ENV=production
REDIS_ENABLED=$REDIS_ENABLED
CORS_ORIGIN=${DOMAIN:+"https://$DOMAIN"}
# JWT_SECRET=your-secret-key-change-in-production
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=admin123
EOF
    
    chown $SERVICE_NAME:$SERVICE_NAME $INSTALL_DIR/.env
    chmod 600 $INSTALL_DIR/.env
}

# 配置 Systemd 服务
setup_systemd() {
    log_info "配置 Systemd 服务..."
    
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=BirdTV IPTV Server
After=network.target redis.service
Wants=redis.service

[Service]
Type=simple
User=$SERVICE_NAME
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node $INSTALL_DIR/birdtv.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    log_info "Systemd 服务已配置"
}

# 配置 Nginx 反向代理
setup_nginx() {
    if [ -z "$DOMAIN" ]; then
        log_warn "未设置 DOMAIN，跳过 Nginx 配置"
        return
    fi
    
    log_info "配置 Nginx + SSL..."
    
    cat > /etc/nginx/sites-available/$SERVICE_NAME << EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/
    
    # 获取 SSL 证书
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
    
    systemctl reload nginx
}

# 启动服务
start_service() {
    log_info "启动服务..."
    
    systemctl restart $SERVICE_NAME
    sleep 2
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_info "服务启动成功!"
        systemctl status $SERVICE_NAME --no-pager
    else
        log_error "服务启动失败，请检查日志:"
        journalctl -u $SERVICE_NAME -n 20 --no-pager
    fi
}

# 防火墙配置
setup_firewall() {
    if command -v ufw &> /dev/null; then
        log_info "配置 UFW 防火墙..."
        ufw --force enable
        ufw allow ssh
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow $PORT/tcp
    elif command -v firewall-cmd &> /dev/null; then
        log_info "配置 firewalld..."
        firewall-cmd --permanent --add-port=$PORT/tcp
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
    fi
}

# 主流程
main() {
    detect_os
    log_info "检测到系统: $OS"
    
    install_deps
    create_user
    deploy_code
    configure_env
    
    if [ "$REDIS_ENABLED" = "true" ]; then
        log_info "安装 Redis..."
        case $OS in
            debian) apt-get install -y -qq redis-server ;;
            centos) yum install -y -q redis ;;
            alpine) apk add --quiet redis ;;
        esac
        systemctl enable redis
        systemctl start redis
    fi
    
    setup_systemd
    setup_nginx
    setup_firewall
    start_service
    
    echo ""
    echo "=========================================="
    log_info "部署完成!"
    echo "=========================================="
    echo "访问地址: http://127.0.0.1:$PORT"
    [ -n "$DOMAIN" ] && echo "HTTPS地址: https://$DOMAIN"
    echo ""
    echo "管理命令:"
    echo "  systemctl start $SERVICE_NAME   # 启动"
    echo "  systemctl stop $SERVICE_NAME    # 停止"
    echo "  systemctl restart $SERVICE_NAME  # 重启"
    echo "  journalctl -u $SERVICE_NAME -f   # 查看日志"
    echo "=========================================="
}

# 卸载
uninstall() {
    log_warn "即将卸载 BirdTV..."
    systemctl stop $SERVICE_NAME
    systemctl disable $SERVICE_NAME
    rm -rf $INSTALL_DIR
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
    log_info "卸载完成"
}

# 根据参数执行
case "${1:-install}" in
    install) main ;;
    uninstall) uninstall ;;
    *) echo "用法: $0 {install|uninstall}" ;;
esac
