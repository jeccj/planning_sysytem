// dotenv MUST be loaded before any other imports so process.env is populated
// when modules evaluate their top-level constants (JWT_SECRET, DATABASE_PATH, etc.)
import * as path from 'path';
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SystemConfigService } from './system-config/system-config.service';
import { DataSource } from 'typeorm';
import { ensureLegacySqliteUsersColumns } from './common/sqlite-schema.util';

const IMPORT_MAINTENANCE_ACTIVE_KEY = 'import_maintenance_active';
const IMPORT_MAINTENANCE_MESSAGE_KEY = 'import_maintenance_message';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Backward compatibility: old sqlite db files may miss newer user session columns.
  try {
    const dataSource = app.get(DataSource);
    await ensureLegacySqliteUsersColumns(dataSource);
  } catch (error) {
    console.warn(
      '[bootstrap] Failed to patch legacy sqlite users schema:',
      error?.message || error,
    );
  }

  // Guard against stale maintenance lock after abnormal process exit.
  try {
    const configService = app.get(SystemConfigService);
    await configService.setBoolean(
      IMPORT_MAINTENANCE_ACTIVE_KEY,
      false,
      'Whether import maintenance mode is active',
    );
    await configService.setConfig(
      IMPORT_MAINTENANCE_MESSAGE_KEY,
      '',
      'Import maintenance message',
    );
  } catch (error) {
    console.warn(
      '[bootstrap] Failed to clear stale import maintenance flag:',
      error?.message || error,
    );
  }

  // Set global API prefix so frontend can use /api/... in production
  app.setGlobalPrefix('api', {
    exclude: [], // all routes get /api prefix
  });

  // CORS configuration – allow any origin so the front-end can be
  // accessed via IP / domain on cloud servers.
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const expressApp = app.getHttpAdapter().getInstance();
  const express = require('express');

  // Support reverse proxies that forward /app1/* without stripping prefix.
  expressApp.use((req: any, _res: any, next: any) => {
    if (req.url === '/app1') {
      req.url = '/';
    } else if (req.url.startsWith('/app1/')) {
      req.url = req.url.slice('/app1'.length) || '/';
    }
    next();
  });

  // Serve uploaded files
  const uploadsPath = path.join(__dirname, '..', 'uploads');
  expressApp.use('/uploads', express.static(uploadsPath));
  expressApp.use('/api/uploads', express.static(uploadsPath)); // 同时支持 /api/uploads 路径

  // Serve built frontend (npm run build in frontend/, output to frontend/dist)
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  const fs = require('fs');
  if (fs.existsSync(frontendDist)) {
    expressApp.use(express.static(frontendDist));
    // SPA fallback: any non-API route returns index.html
    expressApp.use((req: any, res: any, next: any) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      const indexPath = path.join(frontendDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
    console.log(`Serving frontend from: ${frontendDist}`);
  } else {
    console.warn(`⚠ Frontend dist not found at: ${frontendDist}`);
    console.warn(`  Run "cd frontend && npm run build" first.`);
  }

  const port = process.env.PORT || 8001;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
