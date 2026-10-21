import {
  OwnerAccountError,
  ownerSeedSchema,
  seedOwner,
  seedStoreSettings,
} from "@/lib/auth/owner-account";
import { messagesByLocale } from "@/messages";
import { connectDatabase, loadLocalEnv, passwordChecks, readEnv } from "@/scripts/lib/cli-env";

// `pnpm db:seed`: the owner account (from OWNER_* variables) and default store settings.
// Idempotent; safe to run on every deployment.
async function main(): Promise<void> {
  loadLocalEnv();
  const ownerInput = readEnv(ownerSeedSchema);
  const db = connectDatabase();

  try {
    await seedStoreSettings(db, {
      ar: messagesByLocale.ar.common.storeName,
      en: messagesByLocale.en.common.storeName,
    });
    const owner = await seedOwner(db, ownerInput, passwordChecks());
    console.log(
      owner === "created"
        ? "Owner account created. Sign in at /ar/admin/sign-in with OWNER_USERNAME."
        : "Owner account already exists; left unchanged.",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof OwnerAccountError ? error.message : error);
  process.exit(1);
});
