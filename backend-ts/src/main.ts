// dotenv MUST be loaded before any other imports so process.env is populated
// when modules evaluate their top-level constants (JWT_SECRET, DATABASE_PATH, etc.)
import * as path from 'path';
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);

  // Set global API prefix so frontend can use /api/... in production
  app.setGlobalPrefix('api', {
    exclude: [],  // all routes get /api prefix
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
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Serve uploaded files
  const expressApp = app.getHttpAdapter().getInstance();
  const express = require('express');
  expressApp.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
