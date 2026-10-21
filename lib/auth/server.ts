import "server-only";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins/captcha";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { magicLink } from "better-auth/plugins/magic-link";
import { username } from "better-auth/plugins/username";
import { hasLocale, type Locale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { getDb } from "@/lib/db";
import { sendAuthEmail } from "@/lib/email";
import type { ServerEnv } from "@/lib/env/schema";
import { serverEnv } from "@/lib/env/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/security/keyed-hash";
import { runInBackground } from "./background";
import { fakeCaptcha } from "./fake-captcha";
import { AUTH_PATHS, createAuthPolicy, isSessionAllowed } from "./policy";

export const AUTH_BASE_PATH = "/api/auth";

/** Magic links are single use and short-lived (spec §6.1). */
const MAGIC_LINK_TTL_SECONDS = 10 * 60;

/** Emails go out in the language the customer signed up in. */
function localeOf(user: object): Locale {
  const value = (user as { preferredLocale?: unknown }).preferredLocale;
  return typeof value === "string" && hasLocale(routing.locales, value)
    ? value
    : routing.defaultLocale;
}

/**
 * Builds a Better Auth instance. The app uses the shared one from getAuth(); tests also
 * build instances with test doubles switched off to exercise the real Turnstile and
 * compromised-password plugins against stubbed services.
 */
export function createAuth(env: ServerEnv = serverEnv()) {
  const db = getDb();
  const testDoubles = env.TEST_DOUBLES === "on";
  const hashIp = (ip: string) => keyedHash(env.BETTER_AUTH_SECRET, "ip-address", ip);

  const captchaPlugin: BetterAuthPlugin = testDoubles
    ? fakeCaptcha(AUTH_BASE_PATH)
    : captcha({
        provider: "cloudflare-turnstile",
        // Required by the schema whenever TEST_DOUBLES is off.
        secretKey: env.TURNSTILE_SECRET_KEY ?? "",
        endpoints: [AUTH_PATHS.signUpEmail],
      });

  return betterAuth({
    appName: "Digital Store",
    baseURL: env.APP_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.APP_URL).origin],
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    telemetry: { enabled: false },
    // Info-level logs include email addresses; keep personal data out of the logs.
    logger: { level: "warn" },

    user: {
      additionalFields: {
        role: {
          type: ["customer", "owner"],
          required: false,
          input: false,
          defaultValue: "customer",
        },
        preferredLocale: {
          type: ["ar", "en"],
          required: false,
          input: true,
          defaultValue: routing.defaultLocale,
          validator: { input: z.enum(routing.locales) },
        },
        banned: { type: "boolean", required: false, input: false, defaultValue: false },
        firstName: { type: "string", required: false, input: false },
        lastName: { type: "string", required: false, input: false },
      },
    },

    session: {
      // Signed cookie cache (spec §6.3). Sensitive operations bypass it in lib/auth/dal.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      async sendResetPassword({ user, url }) {
        await sendAuthEmail({
          kind: "resetPassword",
          to: user.email,
          locale: localeOf(user),
          url,
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      async sendVerificationEmail({ user, url }) {
        await sendAuthEmail({
          kind: "verifyEmail",
          to: user.email,
          locale: localeOf(user),
          url,
        });
      },
    },

    // Reset and magic-link tokens are stored hashed, never in the clear.
    verification: { storeIdentifier: "hashed" },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      // PostgreSQL-backed and keyed by a hash, so no IP address is stored.
      customStorage: {
        consume: (key, rule) =>
          consumeRateLimit(db, keyedHash(env.BETTER_AUTH_SECRET, "auth-rate-limit", key), {
            windowSeconds: rule.window,
            max: rule.max,
          }).then(({ allowed, retryAfterSeconds }) => ({
            allowed,
            retryAfter: retryAfterSeconds,
          })),
      },
      customRules: {
        [AUTH_PATHS.signInEmail]: { window: 60, max: 5 },
        [AUTH_PATHS.signInUsername]: { window: 15 * 60, max: 5 },
        [AUTH_PATHS.signInMagicLink]: { window: 5 * 60, max: 3 },
        [AUTH_PATHS.magicLinkVerify]: { window: 60, max: 10 },
        "/request-password-reset": { window: 15 * 60, max: 3 },
        "/reset-password": { window: 15 * 60, max: 5 },
        "/send-verification-email": { window: 15 * 60, max: 3 },
        [AUTH_PATHS.signUpEmail]: { window: 60 * 60, max: 5 },
        "/change-password": { window: 15 * 60, max: 5 },
      },
    },

    advanced: {
      // IDs come from PostgreSQL's uuidv7() column defaults.
      database: { generateId: "uuid" },
      ipAddress: {
        ipAddressHeaders: env.AUTH_IP_HEADERS,
        trustedProxies: env.AUTH_TRUSTED_PROXIES,
      },
      // Email sending runs after the response (see ./background).
      backgroundTasks: { handler: (task) => runInBackground(task, "auth email") },
    },

    // Endpoints the store does not use, or replaces with its own flows (account
    // deletion and email change arrive with the account page in Phase 8).
    disabledPaths: [
      "/is-username-available",
      "/update-user",
      "/update-session",
      "/change-email",
      "/delete-user",
      "/delete-user/callback",
      "/sign-in/social",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/account-info",
      "/refresh-token",
      "/get-access-token",
    ],

    hooks: {
      before: createAuthPolicy({ db, secret: env.BETTER_AUTH_SECRET }),
    },

    databaseHooks: {
      session: {
        create: {
          async before(session, context) {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { role: true, banned: true },
            });
            if (!user || user.banned || !isSessionAllowed(user.role, context?.path)) return false;
            return {
              data: { ...session, ipAddress: session.ipAddress ? hashIp(session.ipAddress) : null },
            };
          },
        },
      },
    },

    plugins: [
      // Usernames exist only on the owner account (enforced by policy and a CHECK).
      username({ displayUsername: false, minUsernameLength: 3, maxUsernameLength: 32 }),
      magicLink({
        disableSignUp: true,
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        async sendMagicLink({ email, url }) {
          // The policy hook already answered for unknown, owner and banned accounts.
          const user = await db.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { preferredLocale: true },
          });
          if (!user) return;
          runInBackground(
            sendAuthEmail({ kind: "magicLink", to: email, locale: user.preferredLocale, url }),
            "magic link email",
          );
        },
      }),
      captchaPlugin,
      haveIBeenPwned({ enabled: !testDoubles }),
      // Must stay last: lets Server Actions that call auth.api set cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __auth?: Auth };

/** The Better Auth instance, created on first use so builds need no runtime secrets. */
export function getAuth(): Auth {
  globalForAuth.__auth ??= createAuth();
  return globalForAuth.__auth;
}
