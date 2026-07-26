import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env, so load the workspace-root file
// explicitly. __dirname here is apps/jobber-auth; the .env lives two levels up.
// Tolerate a missing file: CI (and prod) inject env vars directly, and
// `prisma generate` does not need the datasource URL at all.
try {
  process.loadEnvFile(path.join(__dirname, '../../.env'));
} catch {
  // no .env present — rely on the ambient environment
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // The connection URL moved out of schema.prisma in Prisma 7 and is
  // required here for Migrate commands (migrate dev, db push, etc.).
  // Read via process.env (not prisma's strict env() helper) so that
  // `generate`, which needs no URL, still works in CI where it's unset.
  datasource: {
    url: process.env.AUTH_DATABASE_URL,
  },
});
