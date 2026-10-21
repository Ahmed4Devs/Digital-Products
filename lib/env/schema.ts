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

/** Comma-separated list → trimmed, non-empty entries. */
const commaList = z.string().transform((value) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url({ protocol: /^https?$/, error: requiredOr("must be an http(s) URL") }),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    // Authentication. The secret signs cookies and tokens and keys the IP hashes.
    BETTER_AUTH_SECRET: z.string({ error: requiredOr("is required") }).min(32, {
      error: "must be at least 32 characters (use `openssl rand -base64 32`)",
    }),
    // Client IP resolution for rate limits: headers to read, and the reverse proxies
    // allowed to append to a forwarded chain (CIDRs). See docs/DECISIONS.md.
    AUTH_IP_HEADERS: commaList.default(["x-forwarded-for"]),
    AUTH_TRUSTED_PROXIES: commaList.default([]),

    // Email: Resend in production, Mailpit locally.
    MAIL_FROM: z.string({ error: requiredOr("is required") }).min(3),
    RESEND_API_KEY: z.string().min(1).optional(),
    MAILPIT_URL: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }).optional(),

    // Cloudflare Turnstile on customer sign-up. The site key is public by design and is
    // handed to the widget at request time, so it needs no NEXT_PUBLIC_ prefix.
    TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

    // Object storage (MinIO locally, Cloudflare R2 in production), S3 API with
    // path-style addressing. Product files go to the private bucket only; the public
    // bucket holds product images (spec §5.1, §10.6).
    S3_ENDPOINT: z.url({ protocol: /^https?$/, error: requiredOr("must be an http(s) URL") }),
    S3_REGION: z.string({ error: requiredOr("is required") }).min(1),
    S3_ACCESS_KEY_ID: z.string({ error: requiredOr("is required") }).min(1),
    S3_SECRET_ACCESS_KEY: z.string({ error: requiredOr("is required") }).min(1),
    S3_BUCKET_PRIVATE: z.string({ error: requiredOr("is required") }).min(3),
    S3_BUCKET_PUBLIC: z.string({ error: requiredOr("is required") }).min(3),

    // Replaces external services (Turnstile, the compromised-password API and, from
    // Phase 6, the payment gateways) with local fakes for automated tests. Refused
    // unless APP_URL is loopback, so a deployed server can never enable it.
    TEST_DOUBLES: z.enum(["on", "off"]).default("off"),
  })
  .superRefine((env, ctx) => {
    const appUrl = new URL(env.APP_URL);
    const testDoubles = env.TEST_DOUBLES === "on";

    if (testDoubles && !isLoopback(appUrl.hostname)) {
      ctx.addIssue({
        code: "custom",
        path: ["TEST_DOUBLES"],
        message: "can only be enabled when APP_URL is a loopback address",
      });
    }

    if (!testDoubles) {
      for (const key of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({ code: "custom", path: [key], message: "is required" });
        }
      }
    }

    if (env.S3_BUCKET_PRIVATE === env.S3_BUCKET_PUBLIC) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET_PRIVATE"],
        message: "must differ from S3_BUCKET_PUBLIC (product files are never public)",
      });
    }

    if (env.RESEND_API_KEY === undefined && env.MAILPIT_URL === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "is required (or MAILPIT_URL for local development)",
      });
    }

    if (env.NODE_ENV !== "production") return;

    const databaseUrl = new URL(env.DATABASE_URL);
    // A production build running entirely on this machine (e.g. Lighthouse or E2E against
    // `next start`) gains nothing from TLS on loopback. A real deployment never has a
    // loopback APP_URL, so this cannot relax the checks for a deployed server.
    if (isLoopback(appUrl.hostname) && isLoopback(databaseUrl.hostname)) return;

    // Mailpit only captures mail; a deployed store must really deliver it.
    if (env.RESEND_API_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "is required in production",
      });
    }

    if (appUrl.protocol !== "https:") {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
    }

    if (new URL(env.S3_ENDPOINT).protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["S3_ENDPOINT"],
        message: "must use https in production",
      });
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
