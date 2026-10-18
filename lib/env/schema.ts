import { z } from "zod";

// Pure schema module (no `server-only`) so it can be unit-tested and reused by
// instrumentation.ts. Application code reads values through lib/env/server.ts.

const SECURE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** Distinguishes a missing variable from a malformed one in error messages. */
function requiredOr(message: string) {
  return (issue: { input?: unknown }) => (issue.input === undefined ? "is required" : message);
}

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: requiredOr("must be a postgres:// or postgresql:// URL"),
});

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url({ protocol: /^https?$/, error: requiredOr("must be an http(s) URL") }),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    const appUrl = new URL(env.APP_URL);
    const databaseUrl = new URL(env.DATABASE_URL);
    // A production build running entirely on this machine (e.g. Lighthouse or E2E against
    // `next start`) gains nothing from TLS on loopback. A real deployment never has a
    // loopback APP_URL, so this cannot relax the checks for a deployed server.
    if (isLoopback(appUrl.hostname) && isLoopback(databaseUrl.hostname)) return;

    if (appUrl.protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
    }

    // The production database is a separate service; never connect to it without TLS.
    const sslMode = databaseUrl.searchParams.get("sslmode");
    if (sslMode === null || !SECURE_SSL_MODES.has(sslMode)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "must set sslmode=require, verify-ca or verify-full in production",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  override readonly name = "EnvValidationError";
}

/**
 * Validates environment variables and throws a readable error listing every problem.
 * Messages name the variable only, never its value, because values may be secrets.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  // Treat empty strings as unset so `FOO=` in an env file falls back to defaults.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );

  const result = serverEnvSchema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new EnvValidationError(`Invalid environment configuration:\n${problems}`);
}
