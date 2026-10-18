import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

/**
 * Optimistic edge layer only — never a security boundary (spec §6.3).
 * Today it negotiates the locale (cookie → Accept-Language → default) and redirects `/`.
 * Later phases add the session-cookie presence redirects and, for the protected routes of
 * spec §17.5 §2, a per-request CSP nonce; catalog routes keep a static policy.
 */
export default function proxy(request: NextRequest) {
  return handleI18nRouting(request);
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension
  // (e.g. /favicon.ico, /twemoji/1f600.svg).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
