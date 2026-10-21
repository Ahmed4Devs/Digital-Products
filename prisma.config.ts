import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env files. Load the same file Next.js uses in development;
// variables already present in the environment win, so CI and tests can override them.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Left undefined (not `env()`) so `prisma generate` works without a database URL;
    // commands that need a connection fail with a clear error instead. Migrations take a
    // session-level advisory lock, which transaction-mode poolers break, so a direct
    // (unpooled) DIRECT_DATABASE_URL wins when set; the app always uses DATABASE_URL.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
