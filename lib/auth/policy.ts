import { BASE_ERROR_CODES } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { PrismaClient } from "@/generated/prisma/client";
import { consumeRateLimit, type RateLimitRule } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/security/keyed-hash";

// Rules for spec §6 and §17.5 §7, enforced in Better Auth's `hooks.before`.
//
// Every path below was checked against the endpoints registered by Better Auth 1.7.12
// (core routes plus the username and magic-link plugins). A rule that names a path
// which does not exist silently enforces nothing, so tests/integration/auth covers each
// one through the real handler.
export const AUTH_PATHS = {
  signUpEmail: "/sign-up/email",
  signInEmail: "/sign-in/email",
  signInUsername: "/sign-in/username",
  signInMagicLink: "/sign-in/magic-link",
  magicLinkVerify: "/magic-link/verify",
  verifyEmail: "/verify-email",
  updateUser: "/update-user",
} as const;

/** The only fields a customer may send when signing up. */
const SIGN_UP_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "email",
  "password",
  "callbackURL",
  "rememberMe",
  "preferredLocale",
]);

/** Fields no customer-facing endpoint may ever set. */
export const PROTECTED_USER_FIELDS = [
  "role",
  "username",
  "displayUsername",
  "banned",
  "firstName",
  "lastName",
  "email",
  "emailVerified",
] as const;

/** Per-account sign-in attempts, on top of Better Auth's per-IP limits. */
export const SIGN_IN_IDENTIFIER_LIMIT: RateLimitRule = { windowSeconds: 15 * 60, max: 10 };

/** Better Auth requires a name; customers never type one (spec §6.1). */
export function deriveCustomerName(email: string): string {
  const localPart = email.split("@", 1)[0]?.trim() ?? "";
  return Array.from(localPart).slice(0, 64).join("") || "customer";
}

type Role = "customer" | "owner";

/**
 * Backstop for databaseHooks.session.create: even if a request slipped past the hooks,
 * the owner never gets a session from a customer sign-in path and vice versa.
 */
export function isSessionAllowed(role: Role, path: string | undefined): boolean {
  if (role === "owner") {
    return (
      path !== AUTH_PATHS.signInEmail &&
      path !== AUTH_PATHS.magicLinkVerify &&
      path !== AUTH_PATHS.verifyEmail
    );
  }
  return path !== AUTH_PATHS.signInUsername;
}

function fieldNotAllowed(field: string): APIError {
  return APIError.from("BAD_REQUEST", {
    code: BASE_ERROR_CODES.FIELD_NOT_ALLOWED.code,
    message: `${field} is not allowed to be set`,
  });
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

type PolicyDependencies = {
  db: PrismaClient;
  secret: string;
};

export function createAuthPolicy({ db, secret }: PolicyDependencies) {
  async function limitSignInAttempts(path: string, identifier: string): Promise<void> {
    const key = keyedHash(secret, "sign-in-identifier", `${path}:${identifier.toLowerCase()}`);
    const { allowed, retryAfterSeconds } = await consumeRateLimit(
      db,
      key,
      SIGN_IN_IDENTIFIER_LIMIT,
    );
    if (!allowed) {
      throw new APIError(
        "TOO_MANY_REQUESTS",
        { message: "Too many requests. Please try again later." },
        { "X-Retry-After": String(retryAfterSeconds ?? SIGN_IN_IDENTIFIER_LIMIT.windowSeconds) },
      );
    }
  }

  return createAuthMiddleware(async (ctx) => {
    const body = bodyRecord(ctx.body);

    switch (ctx.path) {
      case AUTH_PATHS.signUpEmail: {
        for (const key of Object.keys(body)) {
          if (!SIGN_UP_FIELDS.has(key)) throw fieldNotAllowed(key);
        }
        // Ignore whatever name the client sent.
        if (typeof body.email === "string") body.name = deriveCustomerName(body.email);
        return;
      }

      case AUTH_PATHS.signInEmail: {
        if (typeof body.email !== "string" || typeof body.password !== "string") return;
        await limitSignInAttempts(ctx.path, body.email);

        const found = await ctx.context.internalAdapter.findUserByEmail(body.email.toLowerCase());
        if (found && (found.user as { role?: unknown }).role === "owner") {
          // The owner's email is for recovery only (spec §6.2). Hash anyway so the
          // response takes as long as a real password check, then answer exactly like
          // a wrong password.
          await ctx.context.password.hash(body.password);
          throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD);
        }
        return;
      }

      case AUTH_PATHS.signInUsername: {
        if (typeof body.username !== "string" || typeof body.password !== "string") return;
        await limitSignInAttempts(ctx.path, body.username);

        const user = await ctx.context.adapter.findOne<{ role?: unknown }>({
          model: "user",
          where: [{ field: "username", value: body.username.toLowerCase() }],
        });
        if (user && user.role !== "owner") {
          await ctx.context.password.hash(body.password);
          throw APIError.from("UNAUTHORIZED", USERNAME_ERROR_CODES.INVALID_USERNAME_OR_PASSWORD);
        }
        return;
      }

      case AUTH_PATHS.signInMagicLink: {
        if (typeof body.email !== "string") return;
        const found = await ctx.context.internalAdapter.findUserByEmail(body.email.toLowerCase());
        const user = found?.user as { role?: unknown; banned?: unknown } | undefined;
        if (!user || user.role !== "customer" || user.banned === true) {
          // Same answer as a real request, and no token is created (spec §17.5 §7).
          return ctx.json({ status: true });
        }
        return;
      }

      case AUTH_PATHS.updateUser: {
        for (const field of PROTECTED_USER_FIELDS) {
          if (field in body) throw fieldNotAllowed(field);
        }
        return;
      }

      default:
        return;
    }
  });
}
