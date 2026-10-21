import "server-only";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { getAuth } from "./server";
import { safeNextPath } from "./redirects";

// Data Access Layer for authentication (spec §5.1, §6.3). Pages, layouts, Server
// Actions and route handlers call these guards; proxy.ts and hidden UI never count as
// authorization.

export type Role = "customer" | "owner";

/** The narrow user shape the rest of the app relies on. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: Role;
  preferredLocale: "ar" | "en";
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type GetSessionOptions = {
  /**
   * Skip the signed cookie cache and read the session from the database, so a session
   * revoked in the last few minutes (password reset, ban) is rejected immediately.
   * Owner access and every mutation use this.
   */
  fresh?: boolean;
};

const readSession = cache(async (fresh: boolean) => {
  return getAuth().api.getSession({
    headers: await headers(),
    query: { disableCookieCache: fresh },
  });
});

/** The signed-in user, or null. Banned accounts count as signed out. */
export async function getSessionUser(options: GetSessionOptions = {}): Promise<SessionUser | null> {
  const session = await readSession(options.fresh ?? false);
  if (!session || session.user.banned) return null;

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    role: user.role === "owner" ? "owner" : "customer",
    preferredLocale: user.preferredLocale === "en" ? "en" : "ar",
    username: user.username ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

async function redirectToSignIn(next?: string): Promise<never> {
  const locale = await getLocale();
  const target = safeNextPath(next);
  return redirect({
    href: target ? { pathname: "/sign-in", query: { next: target } } : "/sign-in",
    locale,
  });
}

/**
 * A signed-in customer. Guests go to the sign-in page (and come back to `next`
 * afterwards); the owner has no customer area and gets a 404.
 */
export async function requireCustomer(
  options: GetSessionOptions & { next?: string } = {},
): Promise<SessionUser> {
  const user = await getSessionUser(options);
  if (!user) return redirectToSignIn(options.next);
  if (user.role !== "customer") notFound();
  return user;
}

/** A signed-in customer whose email is verified; required to check out (spec §6.1). */
export async function requireVerifiedCustomer(
  options: GetSessionOptions & { next?: string } = {},
): Promise<SessionUser> {
  const user = await requireCustomer(options);
  if (!user.emailVerified) return redirectToSignIn(options.next);
  return user;
}

/**
 * The owner. Always read fresh from the database. Everyone else, signed in or not, gets
 * a 404 so the admin area is not even confirmed to exist (spec §6.2). Structured as the
 * single place where TOTP can later be required.
 */
export async function requireOwner(): Promise<SessionUser> {
  const user = await getSessionUser({ fresh: true });
  if (!user || user.role !== "owner") notFound();
  return user;
}
