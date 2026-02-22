# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:18-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Build backend
# ============================================================
FROM node:18-alpine AS backend-build

WORKDIR /build/backend-ts
COPY backend-ts/package.json backend-ts/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY backend-ts/ ./
RUN npm run build

# ============================================================
# Stage 3: Production image
# ============================================================
FROM node:18-alpine

WORKDIR /app

# Copy backend package.json + compiled output + node_modules from build stage
COPY backend-ts/package.json backend-ts/package-lock.json* ./backend-ts/
COPY --from=backend-build /build/backend-ts/dist ./backend-ts/dist
COPY --from=backend-build /build/backend-ts/nest-cli.json ./backend-ts/
COPY --from=backend-build /build/backend-ts/node_modules ./backend-ts/node_modules

# Remove devDependencies (much faster than a fresh npm install)
RUN cd backend-ts && npm prune --omit=dev --legacy-peer-deps

# Copy built frontend
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

# Copy scripts & docs (needed at runtime for structured import)
COPY backend-ts/scripts ./backend-ts/scripts
COPY backend-ts/docs ./backend-ts/docs
COPY backend-ts/reset_admin.js ./backend-ts/

# Create directories for runtime data
RUN mkdir -p /app/backend-ts/uploads /app/data /app/_seed

# Copy initial data: database + uploaded files
COPY campus.db /app/_seed/campus.db
COPY backend-ts/uploads ./backend-ts/_seed_uploads

# Default .env — can be overridden by docker-compose env_file or -e flags
COPY backend-ts/.env ./backend-ts/.env

# Entrypoint: seed data into volumes on first run, then start app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Expose port (default 80, overridable via PORT env)
ENV PORT=80
EXPOSE 80

# Data volume for SQLite database & uploads
VOLUME ["/app/data", "/app/backend-ts/uploads"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api || exit 1

WORKDIR /app/backend-ts
