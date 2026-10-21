import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { fakePaymentToken, FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@/lib/payments/fake";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createProduct, enableGateways } from "../../support/checkout";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner } from "../../support/users";

// The checkout's Server Actions and route handlers with a simulated request scope: the
// session cookie (headers) and the cart cookie jar (cookies). TEST_DOUBLES is on in
// integration tests, so the fake gateway is the configured provider.

let sessionCookie = "";
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => new Headers(sessionCookie ? { cookie: sessionCookie } : {}),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ updateTag: () => undefined }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const cart = await import("@/features/cart/actions");
const checkout = await import("@/features/checkout/actions");
const settings = await import("@/features/settings/actions");
const webhookRoute = await import("@/app/api/webhooks/[provider]/route");
const statusRoute = await import("@/app/api/orders/[id]/status/route");

const db = getDb();
const auth = getAuth();
const secret = serverEnv().BETTER_AUTH_SECRET;
const startedAt = new Date();

function postWebhook(provider: string, body: string, headers: Record<string, string> = {}) {
  return webhookRoute.POST(
    new Request(`http://localhost:3000/api/webhooks/${provider}`, {
      method: "POST",
      body,
      headers,
    }),
    { params: Promise.resolve({ provider }) },
  );
}

function getStatus(id: string) {
  return statusRoute.GET(new Request(`http://localhost:3000/api/orders/${id}/status`), {
    params: Promise.resolve({ id }),
  });
}

async function signIn(options: { verified?: boolean } = {}) {
  const customer = await createCustomer(db, options);
  sessionCookie = await sessionCookieFor(auth, customer.id);
  return customer;
}

beforeAll(async () => {
  await enableGateways(db);
  // The fake gateway's "Pay" button posts to the store's own webhook URL.
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.pathname === "/api/webhooks/fake")
      return postWebhook(
        "fake",
        String(init?.body),
        Object.fromEntries(new Headers(init?.headers)),
      );
    return realFetch(input, init);
  });
});

beforeEach(() => {
  sessionCookie = "";
  jar.clear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await restoreCatalog(db, startedAt);
});

describe("cart actions", () => {
  it("adds published products once and removes them", async () => {
    const product = await createProduct(db, { priceUsdCents: 900 });
    expect(await cart.addToCartAction(product.id)).toEqual({ status: "success", message: "added" });
    expect(await cart.addToCartAction(product.id)).toEqual({ status: "success", message: "added" });
    expect(jar.get("cart")).toMatch(new RegExp(`^${product.id}\\.`));

    const draft = await db.product.create({
      data: { slug: `draft-${randomUUID()}`, titleEn: "Draft", priceUsdCents: 100 },
    });
    expect(await cart.addToCartAction(draft.id)).toEqual({
      status: "error",
      message: "unavailable",
    });
    expect(await cart.addToCartAction("nope")).toEqual({ status: "error", message: "invalid" });

    expect(await cart.removeFromCartAction(product.id)).toEqual({
      status: "success",
      message: "removed",
    });
    expect(jar.has("cart")).toBe(false);
    expect(await cart.removeFromCartAction("nope")).toEqual({
      status: "error",
      message: "invalid",
    });
  });

  it("refuses more than 20 products", async () => {
    for (let index = 0; index < 20; index += 1) {
      const product = await createProduct(db, { priceUsdCents: 100 });
      expect((await cart.addToCartAction(product.id)).status).toBe("success");
    }
    const extra = await createProduct(db, { priceUsdCents: 100 });
    expect(await cart.addToCartAction(extra.id)).toEqual({ status: "error", message: "cartFull" });
  });
});

describe("checkout actions", () => {
  it("require a signed-in, verified customer", async () => {
    expect(await checkout.quoteCheckoutAction({ providerId: null, couponCode: "" })).toEqual({
      status: "error",
      message: "signInRequired",
    });
    await signIn({ verified: false });
    expect(
      await checkout.placeOrderAction({ providerId: "fake", couponCode: "", locale: "en" }),
    ).toEqual({
      status: "error",
      message: "verifyRequired",
    });
    const owner = await ensureOwner(db);
    sessionCookie = await sessionCookieFor(auth, owner.id);
    expect((await checkout.claimFreeProductAction(randomUUID(), "en")).message).toBe(
      "signInRequired",
    );
  });

  it("quotes, places an order, pays through the fake gateway and clears the cart", async () => {
    const customer = await signIn();
    const product = await createProduct(db, { priceUsdCents: 2500 });
    await cart.addToCartAction(product.id);

    const quote = await checkout.quoteCheckoutAction({ providerId: "fake", couponCode: "" });
    expect(quote).toMatchObject({
      status: "success",
      quote: { totalUsdCents: 2500, chargedCurrency: "USD" },
    });
    expect(
      await checkout.quoteCheckoutAction({ providerId: "fake", couponCode: "NOPE" }),
    ).toMatchObject({
      fieldErrors: { couponCode: "couponInvalid" },
    });
    expect(await checkout.quoteCheckoutAction({ providerId: "bitcoin", couponCode: "" })).toEqual({
      status: "error",
      message: "invalid",
    });

    const placed = await checkout.placeOrderAction({
      providerId: "fake",
      couponCode: "",
      locale: "en",
    });
    expect(placed).toMatchObject({
      status: "success",
      redirectUrl: expect.stringContaining("/en/checkout/fake?reference="),
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: placed.id } });

    // Status: the owner of the order only.
    expect(await (await getStatus(order.id)).json()).toEqual({ status: "pending" });
    expect((await getStatus("not-a-uuid")).status).toBe(404);

    const paid = await checkout.completeFakePaymentAction({
      reference: order.providerReference!,
      outcome: "paid",
      locale: "en",
    });
    expect(paid).toMatchObject({
      status: "success",
      redirectUrl: `http://localhost:3000/en/checkout/result?order=${order.id}`,
    });
    expect(await (await getStatus(order.id)).json()).toEqual({ status: "paid" });
    expect(
      await db.entitlement.count({
        where: { userId: customer.id, productId: product.id, revokedAt: null },
      }),
    ).toBe(1);

    expect(await checkout.clearPurchasedFromCartAction(order.id)).toEqual({ status: "success" });
    expect(jar.has("cart")).toBe(false);

    const stranger = await signIn();
    expect(stranger.id).not.toBe(customer.id);
    expect((await getStatus(order.id)).status).toBe(404);
    expect(await checkout.clearPurchasedFromCartAction(order.id)).toEqual({
      status: "error",
      message: "invalid",
    });
    expect(
      await checkout.completeFakePaymentAction({
        reference: order.providerReference!,
        outcome: "paid",
        locale: "en",
      }),
    ).toEqual({
      status: "error",
      message: "invalid",
    });
  });

  it("claims free products and refuses paid ones", async () => {
    const customer = await signIn();
    const free = await createProduct(db, { priceUsdCents: 0 });
    const paid = await createProduct(db, { priceUsdCents: 100 });
    const claimed = await checkout.claimFreeProductAction(free.id, "ar");
    expect(claimed).toMatchObject({
      status: "success",
      redirectUrl: expect.stringContaining("/ar/checkout/result?order="),
    });
    expect(await db.entitlement.count({ where: { userId: customer.id, productId: free.id } })).toBe(
      1,
    );
    expect(await checkout.claimFreeProductAction(free.id, "ar")).toMatchObject({
      status: "error",
      message: "cartEmpty",
    });
    expect(await checkout.claimFreeProductAction(paid.id, "ar")).toEqual({
      status: "error",
      message: "unavailable",
    });
    expect(await checkout.claimFreeProductAction(free.id, "fr")).toEqual({
      status: "error",
      message: "invalid",
    });
  });

  it("has no PayPal to capture when PayPal is not configured", async () => {
    await signIn();
    expect(await checkout.capturePayPalAction(randomUUID())).toEqual({
      status: "error",
      message: "invalid",
    });
  });
});

describe("webhook route", () => {
  it("verifies, processes and answers duplicates", async () => {
    const customer = await signIn();
    const product = await createProduct(db, { priceUsdCents: 700 });
    await cart.addToCartAction(product.id);
    const placed = await checkout.placeOrderAction({
      providerId: "fake",
      couponCode: "",
      locale: "en",
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: placed.id } });

    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment.paid",
      payment: fakePaymentToken(secret, order.providerReference!, "paid"),
    });
    const signed = { [FAKE_SIGNATURE_HEADER]: signFakeWebhook(secret, body) };
    const first = await postWebhook("fake", body, signed);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: "fulfilled" });
    expect(await (await postWebhook("fake", body, signed)).json()).toEqual({
      received: true,
      outcome: "duplicate",
    });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    expect(customer.id).toBe(order.userId);

    expect((await postWebhook("fake", body)).status).toBe(401);
    // Gateways without configuration have no endpoint.
    expect((await postWebhook("moyasar", body)).status).toBe(404);
    expect((await postWebhook("stripe", body)).status).toBe(404);
    expect((await postWebhook("fake", "x".repeat(300 * 1024), signed)).status).toBe(413);
  });

  it("answers 500 so the provider retries when processing fails", async () => {
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment.paid",
      payment: "fakepay_forged.mac",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await postWebhook("fake", body, {
      [FAKE_SIGNATURE_HEADER]: signFakeWebhook(secret, body),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "retry" });
    expect(log).toHaveBeenCalled();
  });
});

describe("gateway settings", () => {
  it("are the owner's only", async () => {
    const form = new FormData();
    form.append("moyasarEnabled", "on");
    await signIn();
    await expect(settings.updateGatewaysAction({ status: "idle" }, form)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });

    const owner = await ensureOwner(db);
    sessionCookie = await sessionCookieFor(auth, owner.id);
    expect(await settings.updateGatewaysAction({ status: "idle" }, form)).toEqual({
      status: "success",
      message: "settingsSaved",
    });
    expect(await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({
      moyasarEnabled: true,
      paddleEnabled: false,
      paypalEnabled: false,
    });
    const bad = new FormData();
    bad.append("stripeEnabled", "on");
    expect(await settings.updateGatewaysAction({ status: "idle" }, bad)).toEqual({
      status: "error",
      message: "invalid",
    });
    await enableGateways(db);
  });
});
