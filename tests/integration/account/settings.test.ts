import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCustomerAccount } from "@/features/account/service";
import { settleBackgroundTasks } from "@/lib/auth/background";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { callAuth } from "../../support/auth-client";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createProduct } from "../../support/checkout";
import { extractLink, listMessages, waitForMessage } from "../../support/mailpit";
import { createPaidOrder } from "../../support/orders";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner, TEST_PASSWORD, uniqueEmail } from "../../support/users";

// Customer account settings (spec §6.1, §17.5 §5) through the real Server Actions. Only
// the Next.js request scope is simulated: the cookie header.

// Better Auth's own cookie writes (nextCookies) bypass these mocks: dependencies are not
// transformed by Vitest. The browser side is covered by tests/e2e/account.spec.ts.
const request = vi.hoisted(() => ({ state: { cookie: "" } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(request.state.cookie ? { cookie: request.state.cookie } : {}),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const actions = await import("@/features/account/actions");

const db = getDb();
const auth = getAuth();
const IDLE = { status: "idle" } as const;
const startedAt = new Date();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function signedIn(options: Parameters<typeof createCustomer>[1] = {}) {
  const customer = await createCustomer(db, options);
  request.state.cookie = await sessionCookieFor(auth, customer.id);
  return customer;
}

beforeEach(() => {
  request.state.cookie = "";
});

afterEach(async () => {
  await settleBackgroundTasks();
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

describe("access", () => {
  it("sends guests to sign in and gives the owner a 404, changing nothing", async () => {
    const owner = await ensureOwner(db);
    const attempts = [
      () =>
        actions.changeEmailAction(
          IDLE,
          form({ locale: "en", newEmail: uniqueEmail(), password: "x" }),
        ),
      () =>
        actions.changePasswordAction(
          IDLE,
          form({
            locale: "en",
            currentPassword: "x",
            newPassword: "abcdefgh1",
            confirmPassword: "abcdefgh1",
          }),
        ),
      () => actions.deleteAccountAction(IDLE, form({ locale: "en", password: "x", confirm: "on" })),
    ];
    for (const attempt of attempts) {
      request.state.cookie = "";
      await expect(attempt()).rejects.toMatchObject({
        digest: expect.stringMatching(/^NEXT_REDIRECT/),
      });
      request.state.cookie = await sessionCookieFor(auth, owner.id);
      await expect(attempt()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
    expect(await db.user.findUnique({ where: { id: owner.id } })).not.toBeNull();
    await expect(deleteCustomerAccount(db, owner.id)).rejects.toMatchObject({
      messageKey: "notFound",
    });
  });
});

describe("changing the email", () => {
  it("needs the password, then changes only once the new address confirms", async () => {
    const customer = await signedIn({ preferredLocale: "en" });
    const newEmail = uniqueEmail("new");

    expect(
      await actions.changeEmailAction(
        IDLE,
        form({ locale: "en", newEmail, password: "wrong password" }),
      ),
    ).toEqual({ status: "error", message: "invalid", fieldErrors: { password: "wrongPassword" } });
    expect(
      await actions.changeEmailAction(
        IDLE,
        form({ locale: "en", newEmail: customer.email.toUpperCase(), password: TEST_PASSWORD }),
      ),
    ).toEqual({ status: "error", message: "invalid", fieldErrors: { newEmail: "sameEmail" } });

    expect(
      await actions.changeEmailAction(
        IDLE,
        form({ locale: "en", newEmail, password: TEST_PASSWORD }),
      ),
    ).toEqual({ status: "success", message: "emailChangeSent" });
    await settleBackgroundTasks();
    expect((await db.user.findUniqueOrThrow({ where: { id: customer.id } })).email).toBe(
      customer.email,
    );

    const message = await waitForMessage(newEmail);
    expect(message.Subject).toContain("Confirm your new email");
    const link = extractLink(message, "/api/auth/verify-email");
    const response = await callAuth(
      auth,
      link.slice(link.indexOf("/api/auth") + "/api/auth".length),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/account?notice=email-changed");
    expect(await db.user.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({
      email: newEmail,
      emailVerified: true,
    });
  });

  it("answers the same for an address that already has an account, and sends it nothing", async () => {
    await signedIn();
    const other = await createCustomer(db);
    expect(
      await actions.changeEmailAction(
        IDLE,
        form({ locale: "ar", newEmail: other.email, password: TEST_PASSWORD }),
      ),
    ).toEqual({ status: "success", message: "emailChangeSent" });
    await settleBackgroundTasks();
    expect(await listMessages(other.email)).toEqual([]);
  });
});

describe("changing the password", () => {
  it("checks the current password, signs out other devices and accepts the new one", async () => {
    const customer = await signedIn();
    await sessionCookieFor(auth, customer.id); // another device
    const newPassword = "a brand new passphrase";

    expect(
      await actions.changePasswordAction(
        IDLE,
        form({
          locale: "en",
          currentPassword: "wrong password",
          newPassword,
          confirmPassword: newPassword,
        }),
      ),
    ).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: { currentPassword: "wrongPassword" },
    });
    expect(
      await actions.changePasswordAction(
        IDLE,
        form({
          locale: "en",
          currentPassword: TEST_PASSWORD,
          newPassword,
          confirmPassword: "different",
        }),
      ),
    ).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: { confirmPassword: "passwordMismatch" },
    });

    expect(
      await actions.changePasswordAction(
        IDLE,
        form({
          locale: "en",
          currentPassword: TEST_PASSWORD,
          newPassword,
          confirmPassword: newPassword,
        }),
      ),
    ).toEqual({ status: "success", message: "passwordChanged" });
    // Only the fresh session for this browser is left.
    expect(await db.session.count({ where: { userId: customer.id } })).toBe(1);

    const signIn = await callAuth(auth, "/sign-in/email", {
      body: { email: customer.email, password: newPassword },
    });
    expect(signIn.status).toBe(200);
  });

  it("limits password checks per account", async () => {
    await signedIn();
    const attempt = () =>
      actions.changeEmailAction(
        IDLE,
        form({ locale: "en", newEmail: uniqueEmail(), password: "wrong password" }),
      );
    for (let index = 0; index < 5; index += 1) {
      expect((await attempt()).fieldErrors).toEqual({ password: "wrongPassword" });
    }
    expect(await attempt()).toEqual({ status: "error", message: "tooManyRequests" });
  });
});

describe("deleting the account", () => {
  it("deletes the account and access but keeps the order records", async () => {
    const customer = await signedIn();
    const product = await createProduct(db, { priceUsdCents: 1500 });
    const order = await createPaidOrder(db, { user: customer, products: [product] });
    const entitlement = await db.entitlement.findFirstOrThrow({ where: { userId: customer.id } });
    const file = await db.productFile.create({
      data: {
        productId: product.id,
        storageKey: `products/${product.id}/files/${crypto.randomUUID()}`,
        fileName: "guide.pdf",
        sizeBytes: 10n,
        checksum: "test",
        mimeType: "application/pdf",
      },
    });
    await db.downloadLog.create({ data: { entitlementId: entitlement.id, fileId: file.id } });

    expect(
      await actions.deleteAccountAction(IDLE, form({ locale: "en", password: TEST_PASSWORD })),
    ).toEqual({ status: "error", message: "invalid", fieldErrors: { confirm: "confirmRequired" } });
    expect(
      await actions.deleteAccountAction(
        IDLE,
        form({ locale: "en", password: "wrong password", confirm: "on" }),
      ),
    ).toEqual({ status: "error", message: "invalid", fieldErrors: { password: "wrongPassword" } });
    expect(await db.user.findUnique({ where: { id: customer.id } })).not.toBeNull();

    expect(
      await actions.deleteAccountAction(
        IDLE,
        form({ locale: "en", password: TEST_PASSWORD, confirm: "on" }),
      ),
    ).toEqual({ status: "success", message: "accountDeleted" });

    expect(await db.user.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: customer.id } })).toBe(0);
    expect(await db.account.count({ where: { userId: customer.id } })).toBe(0);
    expect(await db.entitlement.count({ where: { userId: customer.id } })).toBe(0);
    expect(await db.downloadLog.count({ where: { entitlementId: entitlement.id } })).toBe(0);
    const kept = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(kept).toMatchObject({
      userId: null,
      customerEmailSnapshot: customer.email,
      status: "paid",
    });
    expect(kept.items).toHaveLength(1);
  });
});
