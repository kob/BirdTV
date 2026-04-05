# 声明构建平台参数（BuildKit 多架构必需）
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# ==================== Stage 1: Build ====================
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

# bcrypt 需要原生编译依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ==================== Stage 2: Production ====================
FROM --platform=$TARGETPLATFORM node:20-alpine AS production

RUN apk add --no-cache curl dumb-init && rm -rf /var/cache/apk/*

WORKDIR /app

# 从 builder 复制 node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY birdtv.js auth.js ./
COPY backend/ ./backend/
COPY web/ ./web/

# 创建数据目录（运行时挂载）
RUN mkdir -p /app/data /app/files/cache

# 环境变量默认值
ENV HOST=0.0.0.0 \
    PORT=8771 \
    NODE_ENV=production \
    BIRDTV_STATIC_ROOT=/app/web \
    BIRDTV_DATA_DIR=/app/data \
    BIRDTV_CACHE_ROOT=/app/files/cache \
    AUTH_ENABLED=true \
    AUTH_JWT_SECRET=change-me-in-production \
    AUTH_TOKEN_EXPIRE_DAYS=7 \
    AUTH_DEFAULT_ADMIN=admin \
    AUTH_DEFAULT_PASSWORD=admin123 \
    AUTH_REDIS_HOST= \
    AUTH_REDIS_PORT=6379 \
    M3U_PROXY_TIMEOUT_MS=40000 \
    M3U_PROXY_REDIRECT_LIMIT=3 \
    M3U_PROXY_DEFAULT_UA=okhttp/4.3 \
    CLOUDFLARE_WORKER_URL= \
    NODE_OPTIONS=--max-old-space-size=500 \
    ULIMIT_CORE=0

EXPOSE 8771

# 数据持久化
VOLUME ["/app/data"]

# 使用 dumb-init 处理信号，避免僵尸进程
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "birdtv.js"]
