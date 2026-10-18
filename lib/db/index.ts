import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env/server";

// One client (and one pg pool) per process; dev hot reloads would otherwise leak pools.
const globalForDb = globalThis as typeof globalThis & { __prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const env = serverEnv();
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}

/** Returns the shared Prisma client, creating it on first use. */
export function getDb(): PrismaClient {
  globalForDb.__prisma ??= createPrismaClient();
  return globalForDb.__prisma;
}
