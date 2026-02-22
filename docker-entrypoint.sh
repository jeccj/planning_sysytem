#!/bin/sh
set -e

# ── Seed initial data into volumes (only if empty / first run) ──

# 1. Database
if [ ! -f /app/data/campus.db ]; then
  echo "[entrypoint] Seeding initial database → /app/data/campus.db"
  cp /app/_seed/campus.db /app/data/campus.db
else
  echo "[entrypoint] Database already exists, skipping seed."
fi

# 2. Uploads
if [ -d /app/backend-ts/_seed_uploads ] && [ "$(ls -A /app/backend-ts/_seed_uploads 2>/dev/null)" ]; then
  if [ -z "$(ls -A /app/backend-ts/uploads 2>/dev/null)" ]; then
    echo "[entrypoint] Seeding initial uploads → /app/backend-ts/uploads/"
    cp -r /app/backend-ts/_seed_uploads/* /app/backend-ts/uploads/
  else
    echo "[entrypoint] Uploads directory not empty, skipping seed."
  fi
fi

# ── Start application ──
echo "[entrypoint] Starting NestJS application..."
cd /app/backend-ts
exec node dist/main
