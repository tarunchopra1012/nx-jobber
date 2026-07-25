import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer auto-loads .env, so load the workspace-root file
// explicitly. __dirname here is apps/jobber-auth; the .env lives two levels up.
process.loadEnvFile(path.join(__dirname, '../../.env'));

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // The connection URL moved out of schema.prisma in Prisma 7 and is
  // required here for Migrate commands (migrate dev, db push, etc.).
  datasource: {
    url: env('AUTH_DATABASE_URL'),
  },
});
