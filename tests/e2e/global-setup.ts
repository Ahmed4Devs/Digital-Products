import { resetTestDatabase } from "../support/reset-database";

// Every E2E run starts from an empty, fully migrated test database.
export default async function globalSetup(): Promise<void> {
  await resetTestDatabase();
}
