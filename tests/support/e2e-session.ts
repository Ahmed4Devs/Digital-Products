import { randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { e2eDb } from "./e2e-db";

/**
 * Signs a browser context in as the given user by creating the session row directly,
 * the way Better Auth stores it, and setting its signed cookie. Used by specs that test
 * what a signed-in user can do rather than signing in itself, so the per-account
 * sign-in limits stay untouched (sign-in is covered by auth.spec.ts).
 */
export async function signInContext(
  context: BrowserContext,
  baseURL: string,
  userId: string,
): Promise<void> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required for E2E sessions");

  const token = randomBytes(24).toString("base64url");
  await e2eDb().session.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: "playwright",
    },
  });
  const signature = await makeSignature(token, secret);
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(`${token}.${signature}`),
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function ownerId(): Promise<string> {
  const owner = await e2eDb().user.findFirstOrThrow({
    where: { role: "owner" },
    select: { id: true },
  });
  return owner.id;
}
