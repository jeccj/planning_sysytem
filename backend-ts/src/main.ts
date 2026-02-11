import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';

async function bootstrap() {
  // Load .env manually to ensure it's loaded before anything else if not using ConfigModule
  dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
