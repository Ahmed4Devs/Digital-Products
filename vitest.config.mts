import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    restoreMocks: true,
    server: {
      deps: {
        // next-intl's ESM build imports `next/navigation` without an extension, which only
        // resolves when Vite processes the package instead of Node.
        inline: ["next-intl"],
      },
    },
    coverage: {
      provider: "v8",
      include: [
        "lib/**/*.ts",
        "i18n/**/*.ts",
        "features/**/*.ts",
        "app/**/route.ts",
        "components/shared/**/*.tsx",
        "instrumentation.ts",
        "proxy.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "lib/utils.ts",
        // 'use cache' wrappers only run inside Next.js; the reads they wrap (data.ts)
        // are integration-tested and the wrappers are exercised end to end.
        "features/**/queries.ts",
      ],
      reporter: ["text", "html", "lcov"],
      // A floor a little below the current figures (94 % lines), so coverage cannot
      // quietly erode; raise it as it grows.
      thresholds: { lines: 90, statements: 88, functions: 90, branches: 78 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup-env.ts"],
          // Files share one database; run them one at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
