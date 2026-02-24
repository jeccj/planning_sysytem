#!/bin/sh
set -e

# ── Seed initial data ──

# 1. Database (针对直接挂载的文件)
# 注意：因为我们挂载了文件，/app/campus.db 肯定存在（哪怕是空的）。
# 为了防止覆盖你有数据的数据库，我们只在文件大小为0（空文件）时才初始化。
if [ ! -s /app/campus.db ]; then
  echo "[entrypoint] /app/campus.db is empty. Seeding from image..."
  # 覆盖挂载的文件（这会直接写入宿主机的 campus.db）
  cat /app/_seed/campus.db > /app/campus.db
else
  echo "[entrypoint] campus.db exists and is not empty. Skipping seed."
fi

# 2. Uploads
# 逻辑：如果宿主机的 uploads 文件夹是空的，就把镜像里的默认图片复制过去
if [ -d /app/backend-ts/_seed_uploads ] && [ "$(ls -A /app/backend-ts/_seed_uploads 2>/dev/null)" ]; then
  if [ -z "$(ls -A /app/backend-ts/uploads 2>/dev/null)" ]; then
    echo "[entrypoint] Seeding initial uploads → /app/backend-ts/uploads/"
    cp -r /app/backend-ts/_seed_uploads/* /app/backend-ts/uploads/
  else
    echo "[entrypoint] Uploads directory not empty, skipping seed."
  fi
fi

# 确保上传目录有写入权限 (防止宿主机权限过严导致报错)
chmod -R 777 /app/backend-ts/uploads

# ── Start application ──
echo "[entrypoint] Starting NestJS application..."
cd /app/backend-ts
exec node dist/main