/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // Nest does not auto-load .env; load the workspace-root file so
  // AUTH_DATABASE_URL is available to the Prisma driver adapter.
  try {
    process.loadEnvFile();
  } catch {
    // no .env present (e.g. in production where env is injected another way)
  }

  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
