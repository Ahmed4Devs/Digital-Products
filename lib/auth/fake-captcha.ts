import type { BetterAuthPlugin } from "better-auth";
import { AUTH_PATHS } from "./policy";
import { CAPTCHA_HEADER, TURNSTILE_TEST_TOKEN } from "./turnstile";

/**
 * Test double for Better Auth's Turnstile check (TEST_DOUBLES=on, loopback only): the
 * same header contract and error codes, without calling Cloudflare (spec §5.3).
 */
export function fakeCaptcha(basePath: string): BetterAuthPlugin {
  const protectedPath = `${basePath}${AUTH_PATHS.signUpEmail}`;

  return {
    id: "captcha",
    async onRequest(request) {
      if (new URL(request.url).pathname !== protectedPath) return;

      const token = request.headers.get(CAPTCHA_HEADER);
      if (!token) {
        return {
          response: Response.json(
            { code: "MISSING_RESPONSE", message: "Missing CAPTCHA response" },
            { status: 400 },
          ),
        };
      }
      if (token !== TURNSTILE_TEST_TOKEN) {
        return {
          response: Response.json(
            { code: "VERIFICATION_FAILED", message: "Captcha verification failed" },
            { status: 403 },
          ),
        };
      }
    },
  };
}
