import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type CreatePrismaClientOptions = {
  connectionString: string;
  poolMax?: number;
};

/**
 * Builds a Prisma client on a pooled PostgreSQL driver adapter. The app shares one
 * instance through lib/db; CLI scripts (seed, owner recovery) create their own.
 */
export function createPrismaClient({
  connectionString,
  poolMax = 10,
}: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}
