import { defineConfig, devices } from "@playwright/test";
import { configureTestDatabase } from "./tests/support/test-env";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

// The app under test always talks to the separate, disposable test database, with
// external services replaced by their test doubles.
const databaseUrl = configureTestDatabase();
// Optional: a locally installed Chromium when the bundled revision cannot be downloaded.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

// The database is reset and seeded before the build, because catalog pages are
// prerendered from it. Production build by default (closest to real behaviour);
// E2E_DEV=1 uses `next dev` for faster iteration. A server that is already running is
// reused locally as is, without re-seeding.
const prepareDatabase = "pnpm exec tsx tests/e2e/prepare-database.ts";
const serverCommand = process.env.E2E_DEV
  ? `${prepareDatabase} && pnpm exec next dev --port ${PORT}`
  : `${prepareDatabase} && pnpm build && pnpm exec next start --port ${PORT}`;

const browser = {
  ...devices["Desktop Chrome"],
  ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /admin\.spec\.ts/,
      use: browser,
    },
    {
      // Owner specs change the catalog (publishing, categories), so they run after the
      // storefront specs that assert exact listings.
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      dependencies: ["chromium"],
      use: browser,
    },
  ],
  webServer: {
    command: serverCommand,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    env: {
      APP_URL: baseURL,
      DATABASE_URL: databaseUrl,
      TEST_DOUBLES: "on",
      RESEND_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
