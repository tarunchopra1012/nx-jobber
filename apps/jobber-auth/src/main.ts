/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AUTH_PACKAGE_NAME } from '@jobber/types/proto/auth';
import { join } from 'path';
import { GrpcOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
  const port = app.get(ConfigService).getOrThrow('PORT') || 3000;
  app.connectMicroservice<GrpcOptions>({
    transport: Transport.GRPC,
    options: {
      package: AUTH_PACKAGE_NAME,
      protoPath: join(__dirname, 'proto/auth.proto'),
    },
  });
  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
