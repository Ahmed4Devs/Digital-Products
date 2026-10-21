import { connectDatabase, loadLocalEnv } from "@/scripts/lib/cli-env";
import { seedDemoCatalog } from "@/scripts/lib/demo-catalog";

// `pnpm db:seed:demo`: a bilingual demo catalog for local development, until products
// can be created in the admin (Phase 5). Refused unless APP_URL is a loopback address,
// so demo data can never reach a deployed store.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

async function main(): Promise<void> {
  loadLocalEnv();
  const appUrl = URL.parse(process.env.APP_URL ?? "");
  if (!appUrl || !LOOPBACK_HOSTS.has(appUrl.hostname)) {
    console.error("Refusing to seed demo data: APP_URL is not a local address.");
    process.exit(1);
  }

  const db = connectDatabase();
  try {
    const { categories, products } = await seedDemoCatalog(db);
    console.log(`Demo catalog ready: ${categories} categories, ${products} products.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
