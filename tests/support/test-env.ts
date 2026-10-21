import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Points the current process (and the processes it spawns) at the separate test database
 * and switches external services to their test doubles.
 * Refuses any database whose name does not end in `_test`, so a typo in .env.local can
 * never let a test run reset development data.
 */
export function configureTestDatabase(): string {
  const envFile = resolve(process.cwd(), ".env.local");
  if (existsSync(envFile)) {
    // Does not override variables that are already set (e.g. by CI).
    process.loadEnvFile(envFile);
  }

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is required to run integration and E2E tests.");
  }

  const databaseName = new URL(testUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error("DATABASE_URL_TEST must point to a database whose name ends with _test.");
  }

  process.env.DATABASE_URL = testUrl;
  process.env.APP_URL ??= "http://localhost:3000";
  // Tests never call live services (spec §5.3): local fakes replace Turnstile and the
  // compromised-password API, and email always goes to Mailpit, even when a developer
  // has a Resend key in .env.local (empty values count as unset).
  process.env.TEST_DOUBLES = "on";
  process.env.RESEND_API_KEY = "";
  return testUrl;
}
