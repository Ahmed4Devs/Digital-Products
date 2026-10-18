import { resetTestDatabase } from "../support/reset-database";

// The test database is reset once before every integration run.
export default async function setup(): Promise<void> {
  await resetTestDatabase();
}
