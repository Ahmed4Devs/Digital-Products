import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

const LOCALES = routing.locales.join("|");
/** Areas that need a signed-in customer; checked for real in their layouts and the DAL. */
const CUSTOMER_AREA = new RegExp(`^/(${LOCALES})(/(?:account|checkout)(?:/.*)?)$`);
/** The admin, except its sign-in page. */
const ADMIN_AREA = new RegExp(`^/(${LOCALES})/admin(?!/sign-in(?:/|$))(?:/.*)?$`);

/**
 * Whether the request could belong to the owner, judged from cookies alone: no session
 * cookie means no; Better Auth's signed session cache, when present, tells the role.
 * Without a fresh cache it cannot tell, so the admin layout decides.
 */
async function mightBeOwner(request: NextRequest): Promise<boolean> {
  if (!getSessionCookie(request)) return false;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return true;
  for (const isSecure of [true, false]) {
    const cached = await getCookieCache(request, { secret, isSecure });
    if (cached) return (cached.user as { role?: unknown }).role === "owner";
  }
  return true;
}

/**
 * Optimistic edge layer only — never a security boundary (spec §6.3).
 * - Negotiates the locale (cookie → Accept-Language → default) and redirects `/`.
 * - Sends visitors without a session cookie straight to sign-in from customer areas.
 * - Answers the admin with a genuine 404 status for requests that clearly are not the
 *   owner's. Once a page starts streaming its status is fixed at 200, so the layouts'
 *   own checks can only render the 404 page; this gives most visitors the real status.
 * The account layout, the admin layout and the DAL make the actual decisions. Phase 9
 * adds the per-request CSP nonce for the routes of spec §17.5 §2.
 */
export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const customerArea = CUSTOMER_AREA.exec(pathname);
  if (customerArea && !getSessionCookie(request)) {
    const [, locale, rest] = customerArea;
    const signIn = new URL(`/${locale}/sign-in`, request.url);
    signIn.searchParams.set("next", `${rest}${search}`);
    return NextResponse.redirect(signIn);
  }

  const adminArea = ADMIN_AREA.exec(pathname);
  if (adminArea && !(await mightBeOwner(request))) {
    // A path no route matches renders the standard not-found page with status 404.
    return NextResponse.rewrite(new URL(`/${adminArea[1]}/admin/_not-found`, request.url));
  }

  return handleI18nRouting(request);
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension
  // (e.g. /favicon.ico, /twemoji/1f600.svg).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
