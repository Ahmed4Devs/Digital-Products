import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/create-client";
import { configureTestDatabase } from "./test-env";

let client: PrismaClient | undefined;

/** Direct database access for E2E fixtures (lib/db is server-only). */
export function e2eDb(): PrismaClient {
  client ??= createPrismaClient({ connectionString: configureTestDatabase(), poolMax: 2 });
  return client;
}
