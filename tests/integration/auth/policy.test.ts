import { beforeAll, describe, expect, it } from "vitest";
import { settleBackgroundTasks } from "@/lib/auth/background";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { callAuth } from "../../support/auth-client";
import { extractLink, listMessages, waitForMessage } from "../../support/mailpit";
import {
  createCustomer,
  ensureOwner,
  OWNER,
  TEST_PASSWORD,
  uniqueEmail,
  uniqueIp,
} from "../../support/users";

// One test per rule of spec §6 and §17.5 §7, through Better Auth's real HTTP handler.

const auth = getAuth();
const db = getDb();

const INVALID_EMAIL_OR_PASSWORD = {
  code: "INVALID_EMAIL_OR_PASSWORD",
  message: "Invalid email or password",
};

beforeAll(async () => {
  await ensureOwner(db);
});

async function signUp(body: Record<string, unknown>) {
  const response = await callAuth(auth, "/sign-up/email", { body });
  await settleBackgroundTasks();
  return response;
}

describe("customer sign-up", () => {
  it("creates a customer, derives the name and sends a verification email", async () => {
    const email = uniqueEmail("signup");
    const response = await signUp({ email, password: TEST_PASSWORD, name: "Ignored Name" });

    expect(response.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({
      role: "customer",
      emailVerified: false,
      username: null,
      name: email.split("@")[0],
    });
    const message = await waitForMessage(email);
    expect(extractLink(message, "/api/auth/verify-email")).toContain("token=");
  });

  it("stores the language the customer signed up in and emails in it", async () => {
    const email = uniqueEmail("signup-en");
    await signUp({ email, password: TEST_PASSWORD, name: "", preferredLocale: "en" });

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.preferredLocale).toBe("en");
    expect((await waitForMessage(email)).Subject).toMatch(/^Confirm your email/);
  });

  it.each([
    ["role", "owner"],
    ["username", "intruder"],
    ["displayUsername", "intruder"],
    ["banned", false],
    ["emailVerified", true],
    ["firstName", "Mallory"],
    ["image", "https://evil.example/x.png"],
  ])("rejects the protected field %s and creates nothing", async (field, value) => {
    const email = uniqueEmail("protected");
    const response = await signUp({ email, password: TEST_PASSWORD, name: "", [field]: value });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("answers an existing email exactly like a new one (no enumeration)", async () => {
    const existing = await createCustomer(db);
    const response = await signUp({ email: existing.email, password: TEST_PASSWORD, name: "" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ token: null, user: { email: existing.email } });
    expect(await db.user.count({ where: { email: existing.email } })).toBe(1);
  });

  it("enforces the minimum password length", async () => {
    const response = await signUp({ email: uniqueEmail(), password: "short", name: "" });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("requires a CAPTCHA token", async () => {
    const missing = await callAuth(auth, "/sign-up/email", {
      body: { email: uniqueEmail(), password: TEST_PASSWORD, name: "" },
      headers: { "x-captcha-response": "" },
    });
    expect(missing.status).toBe(400);

    const wrong = await callAuth(auth, "/sign-up/email", {
      body: { email: uniqueEmail(), password: TEST_PASSWORD, name: "" },
      headers: { "x-captcha-response": "forged" },
    });
    expect(wrong.status).toBe(403);
  });
});

describe("customer sign-in", () => {
  it("signs a verified customer in and stores only a hashed IP on the session", async () => {
    const customer = await createCustomer(db);
    const ip = uniqueIp();
    const response = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: TEST_PASSWORD },
      ip,
    });

    expect(response.status).toBe(200);
    expect(response.cookies).toMatch(/session_token=/);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toMatch(/; HttpOnly/i);
    expect(sessionCookie).toMatch(/; SameSite=Lax/i);
    const session = await db.session.findFirstOrThrow({ where: { userId: customer.id } });
    expect(session.ipAddress).toBeTruthy();
    expect(session.ipAddress).not.toContain(ip);
  });

  it("blocks unverified customers and re-sends the verification email", async () => {
    const customer = await createCustomer(db, { verified: false });
    const response = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: TEST_PASSWORD },
    });
    await settleBackgroundTasks();

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(await db.session.count({ where: { userId: customer.id } })).toBe(0);
    await waitForMessage(customer.email);
  });

  it("never creates a session for a banned customer", async () => {
    const customer = await createCustomer(db, { banned: true });
    const response = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: TEST_PASSWORD },
    });

    expect(response.status).toBe(401);
    expect(await db.session.count({ where: { userId: customer.id } })).toBe(0);
  });
});

describe("owner and customer sign-in separation (§17.5 §7)", () => {
  it("rejects the owner on email sign-in with the invalid-credentials error", async () => {
    const owner = await callAuth(auth, "/sign-in/email", {
      body: { email: OWNER.email, password: OWNER.password },
    });
    const customer = await createCustomer(db);
    const wrongPassword = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: "not the password" },
    });
    const unknown = await callAuth(auth, "/sign-in/email", {
      body: { email: uniqueEmail("nobody"), password: TEST_PASSWORD },
    });

    expect(owner.status).toBe(401);
    expect(owner.body).toEqual(INVALID_EMAIL_OR_PASSWORD);
    expect(wrongPassword.body).toEqual(owner.body);
    expect(unknown.body).toEqual(owner.body);
    expect(owner.cookies).not.toMatch(/session_token=/);
  });

  it("signs the owner in with username and password", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { role: "owner" } });
    const response = await callAuth(auth, "/sign-in/username", {
      body: { username: OWNER.username.toUpperCase(), password: OWNER.password },
    });

    expect(response.status).toBe(200);
    expect(response.cookies).toMatch(/session_token=/);
    expect(await db.session.count({ where: { userId: owner.id } })).toBeGreaterThan(0);
  });

  it("gives username sign-in the same generic error for any non-owner attempt", async () => {
    const wrongPassword = await callAuth(auth, "/sign-in/username", {
      body: { username: OWNER.username, password: "not the password" },
    });
    const unknown = await callAuth(auth, "/sign-in/username", {
      body: { username: "somebody", password: TEST_PASSWORD },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body).toMatchObject({ code: "INVALID_USERNAME_OR_PASSWORD" });
  });

  it("makes a customer username impossible at the database level", async () => {
    const customer = await createCustomer(db);
    await expect(
      db.user.update({ where: { id: customer.id }, data: { username: "customer" } }),
    ).rejects.toThrow();
    await expect(
      db.user.update({ where: { id: customer.id }, data: { role: "owner" } }),
    ).rejects.toThrow();
  });
});

describe("magic link (§17.5 §7)", () => {
  async function requestLink(email: string) {
    const response = await callAuth(auth, "/sign-in/magic-link", {
      body: { email, callbackURL: "/ar/account" },
    });
    await settleBackgroundTasks();
    return response;
  }

  it("sends a single-use link to a customer and signs them in with it", async () => {
    const customer = await createCustomer(db);
    const response = await requestLink(customer.email);
    expect(response.body).toEqual({ status: true });

    const link = extractLink(await waitForMessage(customer.email), "/api/auth/magic-link/verify");
    const path = link.slice(link.indexOf("/api/auth") + "/api/auth".length);
    const first = await callAuth(auth, path);
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("http://localhost:3000/ar/account");
    expect(first.cookies).toMatch(/session_token=/);

    const second = await callAuth(auth, path);
    expect(second.headers.get("location")).toContain("error=INVALID_TOKEN");
  });

  it("verifies an unverified customer's email through the link", async () => {
    const customer = await createCustomer(db, { verified: false });
    await requestLink(customer.email);
    const link = extractLink(await waitForMessage(customer.email), "/api/auth/magic-link/verify");
    await callAuth(auth, link.slice(link.indexOf("/api/auth") + "/api/auth".length));

    const user = await db.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(user.emailVerified).toBe(true);
  });

  it("answers for the owner, banned and unknown accounts without sending anything", async () => {
    const banned = await createCustomer(db, { banned: true });
    const unknown = uniqueEmail("nobody");
    const before = await db.verification.count();

    for (const email of [OWNER.email, banned.email, unknown]) {
      const response = await requestLink(email);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: true });
    }

    expect(await db.verification.count()).toBe(before);
    expect(await listMessages(banned.email)).toHaveLength(0);
    expect(await listMessages(unknown)).toHaveLength(0);
  });

  it("never creates accounts", async () => {
    const email = uniqueEmail("magic-new");
    await requestLink(email);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });
});

describe("password reset (§17.5 §7)", () => {
  async function requestReset(email: string) {
    const response = await callAuth(auth, "/request-password-reset", {
      body: { email, redirectTo: "/ar/reset-password" },
    });
    await settleBackgroundTasks();
    return response;
  }

  it("returns the same response whether or not the account exists", async () => {
    const customer = await createCustomer(db);
    const known = await requestReset(customer.email);
    const unknown = await requestReset(uniqueEmail("nobody"));

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it("lets the owner recover their password by email", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { role: "owner" } });
    const before = await listMessages(owner.email);
    await requestReset(owner.email);
    await waitForMessage(owner.email, { count: before.length + 1 });
  });

  it("sets the new password and revokes every other session", async () => {
    const customer = await createCustomer(db);
    for (let index = 0; index < 2; index += 1) {
      const signIn = await callAuth(auth, "/sign-in/email", {
        body: { email: customer.email, password: TEST_PASSWORD },
      });
      expect(signIn.status).toBe(200);
    }
    expect(await db.session.count({ where: { userId: customer.id } })).toBe(2);

    await requestReset(customer.email);
    const link = extractLink(await waitForMessage(customer.email), "/api/auth/reset-password/");
    const callback = await callAuth(
      auth,
      link.slice(link.indexOf("/api/auth") + "/api/auth".length),
    );
    const token = new URL(callback.headers.get("location") ?? "").searchParams.get("token");
    expect(token).toBeTruthy();

    const newPassword = "a brand new passphrase";
    const reset = await callAuth(auth, "/reset-password", { body: { token, newPassword } });
    expect(reset.status).toBe(200);
    expect(await db.session.count({ where: { userId: customer.id } })).toBe(0);

    const oldPassword = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: TEST_PASSWORD },
    });
    expect(oldPassword.status).toBe(401);
    const signIn = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: newPassword },
    });
    expect(signIn.status).toBe(200);

    const reused = await callAuth(auth, "/reset-password", { body: { token, newPassword } });
    expect(reused.status).toBe(400);
  });

  it("stores reset tokens hashed, never in the clear", async () => {
    const customer = await createCustomer(db);
    await requestReset(customer.email);
    const link = extractLink(await waitForMessage(customer.email), "/api/auth/reset-password/");
    const token = new URL(link).pathname.split("/").pop()!;

    const rows = await db.verification.findMany({ select: { identifier: true, value: true } });
    expect(rows.some((row) => row.identifier.includes(token) || row.value.includes(token))).toBe(
      false,
    );
  });
});

describe("protected fields on other endpoints (§17.5 §7)", () => {
  it("does not expose update-user, username lookup or self-deletion over HTTP", async () => {
    for (const path of [
      "/update-user",
      "/is-username-available",
      "/delete-user",
      "/change-email",
    ]) {
      const response = await callAuth(auth, path, { body: { username: "owner" } });
      expect(response.status, path).toBe(404);
    }
  });

  it("rejects role and username changes even through server-side calls", async () => {
    const customer = await createCustomer(db);
    const signIn = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: TEST_PASSWORD },
    });
    const headers = new Headers({ cookie: signIn.cookies });

    for (const field of ["role", "username", "banned"]) {
      await expect(
        auth.api.updateUser({ headers, body: { [field]: field === "banned" ? false : "owner" } }),
      ).rejects.toMatchObject({ body: { code: "FIELD_NOT_ALLOWED" } });
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(user).toMatchObject({ role: "customer", username: null, banned: false });
  });
});

describe("rate limits", () => {
  it("limits email sign-in per IP", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await callAuth(auth, "/sign-in/email", {
        body: { email: uniqueEmail("nobody"), password: TEST_PASSWORD },
        ip,
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("limits owner sign-in more strictly", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await callAuth(auth, "/sign-in/username", {
        body: { username: "somebody", password: TEST_PASSWORD },
        ip,
      });
      statuses.push(response.status);
    }
    expect(statuses[5]).toBe(429);
  });

  it("limits attempts against one account across many IPs", async () => {
    const customer = await createCustomer(db);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await callAuth(auth, "/sign-in/email", {
        body: { email: customer.email, password: "wrong password!" },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);

    // Even the right password is refused until the window passes.
    const correct = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: TEST_PASSWORD },
    });
    expect(correct.status).toBe(429);
  });

  it("limits magic-link and password-reset requests", async () => {
    for (const [path, allowed] of [
      ["/sign-in/magic-link", 3],
      ["/request-password-reset", 3],
    ] as const) {
      const ip = uniqueIp();
      const statuses: number[] = [];
      for (let attempt = 0; attempt <= allowed; attempt += 1) {
        const response = await callAuth(auth, path, { body: { email: uniqueEmail() }, ip });
        statuses.push(response.status);
      }
      expect(statuses.at(-1), path).toBe(429);
    }
    await settleBackgroundTasks();
  });

  it("stores no IP address in the limiter's table", async () => {
    const ip = uniqueIp();
    await callAuth(auth, "/sign-in/email", {
      body: { email: uniqueEmail(), password: TEST_PASSWORD },
      ip,
    });
    const keys = await db.rateLimitBucket.findMany({ select: { key: true } });
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some(({ key }) => key.includes(ip))).toBe(false);
  });
});
