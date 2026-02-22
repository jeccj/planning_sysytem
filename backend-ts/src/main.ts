// dotenv MUST be loaded before any other imports so process.env is populated
// when modules evaluate their top-level constants (JWT_SECRET, DATABASE_PATH, etc.)
import * as path from 'path';
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);

  // CORS configuration matching Python backend
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Serve static assets
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use('/uploads', require('express').static(path.join(__dirname, '..', 'uploads')));

  const port = process.env.PORT || 8001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
