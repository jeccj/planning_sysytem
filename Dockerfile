# ============================================================
# 定义全局参数 & 环境变量
# ============================================================
ARG NODE_VERSION=20-alpine
ARG ALPINE_MIRROR="mirrors.aliyun.com"
ARG NPM_REGISTRY="https://registry.npmmirror.com"

# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:${NODE_VERSION} AS frontend-build
ARG ALPINE_MIRROR
ARG NPM_REGISTRY

RUN sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories \
    && npm config set registry ${NPM_REGISTRY}

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Install Dependencies (All)
# ============================================================
FROM node:${NODE_VERSION} AS backend-deps
ARG ALPINE_MIRROR
ARG NPM_REGISTRY

# 1. 替换 Alpine 源
# 2. 安装编译工具 (作为兜底，如果二进制下载不兼容，会 fallback 到本地编译)
# 3. 设置 npm 源
RUN sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories \
    && apk add --no-cache python3 make g++ \
    && npm config set registry ${NPM_REGISTRY}

# 【关键修复】使用 ENV 设置 sqlite3 镜像地址，而不是 npm config set
# npm 会自动读取 npm_config_ 前缀的环境变量
ENV npm_config_sqlite3_binary_site=https://npmmirror.com/mirrors/sqlite3

WORKDIR /build/backend-ts
COPY backend-ts/package.json backend-ts/package-lock.json* ./

# 安装依赖
RUN npm install --legacy-peer-deps

# ============================================================
# Stage 3: Build backend
# ============================================================
FROM node:${NODE_VERSION} AS backend-build

WORKDIR /build/backend-ts

# 从 deps 阶段复制 node_modules
COPY --from=backend-deps /build/backend-ts/node_modules ./node_modules
COPY backend-ts/ ./

RUN npm run build

# ============================================================
# Stage 4: Prune (准备生产依赖)
# ============================================================
FROM node:${NODE_VERSION} AS backend-prod-deps

WORKDIR /build/backend-ts
COPY --from=backend-deps /build/backend-ts/node_modules ./node_modules
COPY backend-ts/package.json backend-ts/package-lock.json* ./

# 移除开发依赖
RUN npm prune --production

# ============================================================
# Stage 5: Production image
# ============================================================
FROM node:${NODE_VERSION}

ENV NODE_ENV=production \
    PORT=80

ARG ALPINE_MIRROR
RUN sed -i "s/dl-cdn.alpinelinux.org/${ALPINE_MIRROR}/g" /etc/apk/repositories

WORKDIR /app

# 1. 复制后端 package.json
COPY backend-ts/package.json ./backend-ts/

# 2. 复制生产环境 node_modules (包含已处理好的 sqlite3)
COPY --from=backend-prod-deps /build/backend-ts/node_modules ./backend-ts/node_modules

# 3. 复制后端编译代码
COPY --from=backend-build /build/backend-ts/dist ./backend-ts/dist
COPY --from=backend-build /build/backend-ts/nest-cli.json ./backend-ts/

# 4. 复制前端构建产物
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

# 5. 复制脚本与文档
COPY backend-ts/scripts ./backend-ts/scripts
COPY backend-ts/docs ./backend-ts/docs
COPY backend-ts/reset_admin.js ./backend-ts/

# 6. 初始化数据目录
RUN mkdir -p /app/backend-ts/uploads /app/data /app/_seed

# 7. 复制初始数据
COPY campus.db /app/_seed/campus.db
COPY backend-ts/uploads ./backend-ts/_seed_uploads
COPY backend-ts/.env ./backend-ts/.env

# Entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
WORKDIR /app/backend-ts