import { createPrismaClient } from "@/lib/db/create-client";
import { resetTestDatabase } from "../support/reset-database";
import { configureTestDatabase } from "../support/test-env";
import { ensureOwner } from "../support/users";

// Every E2E run starts from an empty, fully migrated test database with the owner seeded.
export default async function globalSetup(): Promise<void> {
  await resetTestDatabase();
  const db = createPrismaClient({ connectionString: configureTestDatabase(), poolMax: 1 });
  try {
    await ensureOwner(db);
  } finally {
    await db.$disconnect();
  }
}
