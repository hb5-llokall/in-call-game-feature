// Prisma CLI config (migrate dev / migrate deploy / generate).
// Prisma 7 no longer reads .env on its own, so load it here for local use.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` doesn't need a database, so allow it to be unset at build time.
    url: process.env.DATABASE_URL ?? '',
  },
});
