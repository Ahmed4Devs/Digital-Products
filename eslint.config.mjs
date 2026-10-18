import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import localRules from "./eslint-rules/no-physical-direction-classes.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project-specific ignores:
    "generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "public/**",
  ]),
  {
    rules: {
      // `_`-prefixed names and rest siblings are intentional omissions.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // RTL/LTR guard (spec §7.2): logical Tailwind utilities only.
    files: ["**/*.{ts,tsx}"],
    plugins: { local: localRules },
    rules: {
      "local/no-physical-direction-classes": "error",
    },
  },
]);

export default eslintConfig;
