import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import pg from "pg";
import { configureTestDatabase } from "./test-env";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Empties the test database and re-applies every migration.
 *
 * The owner approved automatic resets for the local `_test` database only (see
 * docs/DECISIONS.md), so this refuses any non-loopback host on top of the `_test` name
 * check in configureTestDatabase(). It drops and recreates the `public` schema itself and
 * then runs the non-destructive `prisma migrate deploy`.
 */
export async function resetTestDatabase(): Promise<void> {
  const testUrl = configureTestDatabase();

  const { hostname } = new URL(testUrl);
  if (!LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
    throw new Error("Refusing to reset a test database that is not on this machine.");
  }

  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  // Run the Prisma CLI through the current Node binary, so no shell is involved.
  // Resolved from the project root because Playwright loads this file as CommonJS.
  const projectRequire = createRequire(resolve(process.cwd(), "package.json"));
  const prismaCli = projectRequire.resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });
}
