import { defineConfig, env } from 'prisma/config';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI and hosting platforms provide DATABASE_URL directly.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations take a session-level advisory lock, which the connection pooler can't hold.
  datasource: { url: env('DATABASE_URL').replace('-pooler.', '.') },
});
