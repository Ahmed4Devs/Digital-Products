import { defineConfig, devices } from "@playwright/test";
import { configureTestDatabase } from "./tests/support/test-env";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

// The app under test always talks to the separate, disposable test database.
const databaseUrl = configureTestDatabase();

// Production build by default (closest to real behaviour); E2E_DEV=1 uses `next dev`
// for faster iteration.
const serverCommand = process.env.E2E_DEV
  ? `pnpm exec next dev --port ${PORT}`
  : `pnpm build && pnpm exec next start --port ${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: serverCommand,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    env: {
      APP_URL: baseURL,
      DATABASE_URL: databaseUrl,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
