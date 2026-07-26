import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Prisma 7 no longer reads the datasource URL from the schema at runtime;
    // it requires a driver adapter built from the connection string.
    super({
      adapter: new PrismaPg({
        connectionString: process.env.AUTH_DATABASE_URL,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
