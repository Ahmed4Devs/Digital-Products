import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { callAuth } from "../../support/auth-client";
import { createCustomer, ensureOwner, OWNER, TEST_PASSWORD } from "../../support/users";

// The Data Access Layer guards against a real database and real Better Auth sessions.
// Only the Next.js request scope (headers, locale) is simulated.

let requestCookies = "";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookies ? { cookie: requestCookies } : {}),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "ar" }));

const { getSessionUser, requireCustomer, requireOwner, requireVerifiedCustomer } =
  await import("@/lib/auth/dal");

const auth = getAuth();
const db = getDb();

/** Next.js signals redirect() and notFound() by throwing errors with a digest. */
async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return `redirect ${digest.split(";")[2]}`;
    if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") return "404";
    throw error;
  }
}

async function signInCustomer(options: { verified?: boolean } = {}) {
  const customer = await createCustomer(db, options);
  if (options.verified === false) {
    // Unverified customers cannot sign in; build their session directly.
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(customer.id);
    requestCookies = `better-auth.session_token=${await signCookie(session!.token)}`;
    return customer;
  }
  const response = await callAuth(auth, "/sign-in/email", {
    body: { email: customer.email, password: TEST_PASSWORD },
  });
  requestCookies = response.cookies;
  return customer;
}

async function signCookie(token: string): Promise<string> {
  const { makeSignature } = await import("better-auth/crypto");
  const ctx = await auth.$context;
  return encodeURIComponent(`${token}.${await makeSignature(token, ctx.secret)}`);
}

beforeAll(async () => {
  await ensureOwner(db);
});

beforeEach(() => {
  requestCookies = "";
});

describe("getSessionUser", () => {
  it("returns null for guests", async () => {
    expect(await getSessionUser()).toBeNull();
  });

  it("returns the narrow user shape for a customer", async () => {
    const customer = await signInCustomer();
    expect(await getSessionUser()).toEqual({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      emailVerified: true,
      role: "customer",
      preferredLocale: "ar",
      username: null,
      firstName: null,
      lastName: null,
    });
  });

  it("treats a banned account as signed out", async () => {
    const customer = await signInCustomer();
    await db.user.update({ where: { id: customer.id }, data: { banned: true } });
    expect(await getSessionUser({ fresh: true })).toBeNull();
  });

  it("rejects a revoked session immediately when reading fresh", async () => {
    const customer = await signInCustomer();
    expect(await getSessionUser({ fresh: true })).not.toBeNull();
    await db.session.deleteMany({ where: { userId: customer.id } });
    expect(await getSessionUser({ fresh: true })).toBeNull();
  });
});

describe("requireCustomer", () => {
  it("redirects guests to sign-in and keeps a safe return path", async () => {
    expect(await outcome(requireCustomer({ next: "/cart" }))).toBe(
      "redirect /ar/sign-in?next=%2Fcart",
    );
    expect(await outcome(requireCustomer({ next: "https://evil.example" }))).toBe(
      "redirect /ar/sign-in",
    );
  });

  it("allows customers", async () => {
    await signInCustomer();
    expect(await outcome(requireCustomer())).toBe("allowed");
  });

  it("answers 404 to the owner, who has no customer area", async () => {
    const response = await callAuth(auth, "/sign-in/username", {
      body: { username: OWNER.username, password: OWNER.password },
    });
    requestCookies = response.cookies;
    expect(await outcome(requireCustomer())).toBe("404");
  });
});

describe("requireVerifiedCustomer", () => {
  it("allows verified customers", async () => {
    await signInCustomer();
    expect(await outcome(requireVerifiedCustomer())).toBe("allowed");
  });

  it("turns away a customer whose email is not verified", async () => {
    await signInCustomer({ verified: false });
    expect(await outcome(requireVerifiedCustomer({ next: "/checkout" }))).toBe(
      "redirect /ar/sign-in?next=%2Fcheckout",
    );
  });
});

describe("requireOwner", () => {
  it("answers 404 to guests and customers", async () => {
    expect(await outcome(requireOwner())).toBe("404");
    await signInCustomer();
    expect(await outcome(requireOwner())).toBe("404");
  });

  it("allows the owner", async () => {
    const response = await callAuth(auth, "/sign-in/username", {
      body: { username: OWNER.username, password: OWNER.password },
    });
    requestCookies = response.cookies;
    const owner = await requireOwner();
    expect(owner).toMatchObject({ role: "owner", username: OWNER.username, firstName: "Store" });
  });
});
