import { makeSignature } from "better-auth/crypto";
import type { Auth } from "@/lib/auth/server";

/**
 * A signed session cookie for a user, created directly through Better Auth's adapter.
 * Used where a test needs a signed-in user but is not testing sign-in itself, so the
 * per-identifier sign-in limits are not used up.
 */
export async function sessionCookieFor(auth: Auth, userId: string): Promise<string> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  if (!session) throw new Error("Could not create a session");
  const signature = await makeSignature(session.token, ctx.secret);
  return `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`;
}
