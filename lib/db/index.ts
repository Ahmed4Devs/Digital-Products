import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env/server";
import { createPrismaClient } from "./create-client";

// One client (and one pg pool) per process; dev hot reloads would otherwise leak pools.
const globalForDb = globalThis as typeof globalThis & { __prisma?: PrismaClient };

/** Returns the shared Prisma client, creating it on first use. */
export function getDb(): PrismaClient {
  if (!globalForDb.__prisma) {
    const env = serverEnv();
    globalForDb.__prisma = createPrismaClient({
      connectionString: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
    });
  }
  return globalForDb.__prisma;
}
