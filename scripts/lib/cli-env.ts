import { existsSync } from "node:fs";
import { isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { PasswordChecks } from "@/lib/auth/owner-account";
import { createPrismaClient } from "@/lib/db/create-client";

/** Loads .env.local like Next.js does; variables already set (e.g. in Docker) win. */
export function loadLocalEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

/** Validates the variables a script needs, printing names (never values) on failure. */
export function readEnv<T extends z.ZodObject>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;
  const problems = result.error.issues.map(
    (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
  );
  console.error(`Invalid environment:\n${problems.join("\n")}`);
  process.exit(1);
}

export function connectDatabase(): PrismaClient {
  const { DATABASE_URL } = readEnv(
    z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) }),
  );
  return createPrismaClient({ connectionString: DATABASE_URL, poolMax: 2 });
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The compromised-password check for CLI scripts. Like the web app, it is replaced by a
 * no-op only with TEST_DOUBLES=on and a loopback APP_URL, so a deployed server always
 * checks (and refuses to continue when the service cannot be reached).
 */
export function passwordChecks(): PasswordChecks {
  const appUrl = URL.parse(process.env.APP_URL ?? "");
  const offline =
    process.env.TEST_DOUBLES === "on" && appUrl !== null && LOOPBACK_HOSTS.has(appUrl.hostname);
  if (offline) {
    console.warn("TEST_DOUBLES=on: skipping the compromised-password check (local use only).");
    return { isCompromised: async () => false };
  }
  return { isCompromised: isPasswordCompromised };
}
