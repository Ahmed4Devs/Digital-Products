import { resetTestDatabase } from "@/tests/support/reset-database";
import { seedStoreSettings } from "@/lib/auth/owner-account";
import { createPrismaClient } from "@/lib/db/create-client";
import { seedDemoCatalog } from "@/scripts/lib/demo-catalog";
import { TEST_CATALOG_EXTRAS } from "@/tests/support/catalog";
import { configureTestDatabase } from "@/tests/support/test-env";
import { ensureOwner } from "@/tests/support/users";

// Runs before the E2E build (see playwright.config.ts): catalog pages are prerendered at
// build time, so the test database must hold its final catalog first. Starts from an
// empty, fully migrated database, then seeds settings, the owner and the test catalog.
await resetTestDatabase();
const db = createPrismaClient({ connectionString: configureTestDatabase(), poolMax: 1 });
try {
  await seedStoreSettings(db, { ar: "المتجر الرقمي", en: "Digital Store" });
  await ensureOwner(db);
  await seedDemoCatalog(db, TEST_CATALOG_EXTRAS);
  console.log("E2E database ready.");
} finally {
  await db.$disconnect();
}
