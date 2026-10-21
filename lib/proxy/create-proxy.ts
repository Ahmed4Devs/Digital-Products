import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { safeEqual } from "@/lib/security/compare";

const handleI18nRouting = createIntlMiddleware(routing);

const LOCALES = routing.locales.join("|");
/** Areas that need a signed-in customer; checked for real in their layouts and the DAL. */
const CUSTOMER_AREA = new RegExp(`^/(${LOCALES})(/(?:account|checkout)(?:/.*)?)$`);
/** The admin, except its sign-in page. */
const ADMIN_AREA = new RegExp(`^/(${LOCALES})/admin(?!/sign-in(?:/|$))(?:/.*)?$`);

/** Whether a session token belongs to the owner's live session (one indexed read). */
export type OwnerSessionLookup = (token: string) => Promise<boolean>;

export const lookUpOwnerSession: OwnerSessionLookup = async (token) => {
  const { getDb } = await import("@/lib/db");
  const session = await getDb().session.findUnique({
    where: { token },
    select: { expiresAt: true, user: { select: { role: true, banned: true } } },
  });
  return Boolean(
    session &&
    session.expiresAt > new Date() &&
    session.user.role === "owner" &&
    !session.user.banned,
  );
};

/** The token of a correctly signed session cookie, or null. */
async function signedSessionToken(request: NextRequest, secret: string): Promise<string | null> {
  const raw = getSessionCookie(request);
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  return safeEqual(signature, await makeSignature(token, secret)) ? token : null;
}

/**
 * Whether the request belongs to the owner. Better Auth's signed session cache, when
 * present, tells the role; otherwise the signed session token is looked up. Pages start
 * streaming before the admin layout's own check finishes, which fixes their status at
 * 200, so this is what gives everyone else a genuine 404 status.
 */
async function isOwnerRequest(request: NextRequest, lookUp: OwnerSessionLookup): Promise<boolean> {
  if (!getSessionCookie(request)) return false;

  const secret = process.env.BETTER_AUTH_SECRET;
  // Without the secret nothing can be verified here; the layout still decides.
  if (!secret) return true;
  for (const isSecure of [true, false]) {
    const cached = await getCookieCache(request, { secret, isSecure });
    if (cached) return (cached.user as { role?: unknown }).role === "owner";
  }
  const token = await signedSessionToken(request, secret);
  // If the lookup itself fails, the admin layout still makes the decision.
  return token ? lookUp(token).catch(() => true) : false;
}

/**
 * Optimistic edge layer only — never a security boundary (spec §6.3).
 * - Negotiates the locale (cookie → Accept-Language → default) and redirects `/`.
 * - Sends visitors without a session cookie straight to sign-in from customer areas.
 * - Answers the admin with a genuine 404 status for every request that is not the
 *   owner's. Once a page starts streaming its status is fixed at 200, so the layouts'
 *   own checks can only render the 404 page; this gives everyone else the real status.
 * The account layout, the admin layout and the DAL make the actual decisions. Phase 9
 * adds the per-request CSP nonce for the routes of spec §17.5 §2.
 */
export function createProxy(lookUp: OwnerSessionLookup) {
  return async function proxy(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

    const customerArea = CUSTOMER_AREA.exec(pathname);
    if (customerArea && !getSessionCookie(request)) {
      const [, locale, rest] = customerArea;
      const signIn = new URL(`/${locale}/sign-in`, request.url);
      signIn.searchParams.set("next", `${rest}${search}`);
      return NextResponse.redirect(signIn);
    }

    const adminArea = ADMIN_AREA.exec(pathname);
    if (adminArea && !(await isOwnerRequest(request, lookUp))) {
      // A path no route matches renders the standard not-found page with status 404.
      return NextResponse.rewrite(new URL(`/${adminArea[1]}/admin/_not-found`, request.url));
    }

    return handleI18nRouting(request);
  };
}
