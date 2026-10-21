import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { placeOrder } from "@/features/checkout/orders";
import { handleWebhook } from "@/features/checkout/webhooks";
import { getDb } from "@/lib/db";
import { fakePaymentToken, FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@/lib/payments/fake";
import type { ProviderId } from "@/lib/payments/types";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createCoupon, createProduct, enableGateways } from "../../support/checkout";
import {
  GatewayStub,
  PAYPAL_HEADERS,
  paddleSignature,
  TEST_GATEWAY_CONFIG,
  testProviders,
} from "../../support/gateways";
import { createCustomer, uniqueIp } from "../../support/users";

// Every provider × (valid, duplicate, amount mismatch, currency mismatch, bad
// signature), plus refunds (spec §5.1, §10.1, Phase 6 tests).

const db = getDb();
const stub = new GatewayStub();
const providers = testProviders();
const startedAt = new Date();
const deps = {
  db,
  providers,
  secret: TEST_GATEWAY_CONFIG.secret,
  appUrl: TEST_GATEWAY_CONFIG.appUrl,
};
const PADDLE_API = "https://sandbox-api.paddle.com";
const PAYPAL_API = "https://api-m.sandbox.paypal.com";

async function pendingOrder(
  providerId: ProviderId,
  priceUsdCents = 1500,
  couponCode: string | null = null,
) {
  const user = await createCustomer(db);
  const product = await createProduct(db, { priceUsdCents });
  const reference = `${providerId}-${randomUUID()}`;
  stub.on("POST", "https://api.moyasar.com/v1/invoices", {
    json: { id: reference, url: "https://pay.example/x" },
  });
  stub.on("POST", `${PADDLE_API}/transactions`, { json: { data: { id: reference } } });
  stub.on("POST", `${PAYPAL_API}/v2/checkout/orders`, {
    json: {
      id: reference,
      links: [{ rel: "payer-action", href: "https://paypal.example/approve" }],
    },
  });
  const placed = await placeOrder(deps, {
    user: { id: user.id, email: user.email },
    locale: "en",
    productIds: [product.id],
    providerId,
    couponCode,
    ip: uniqueIp(),
  });
  const order = await db.order.findUniqueOrThrow({
    where: { id: placed.orderId },
    include: { items: true },
  });
  return { order, user, product };
}

function send(providerId: ProviderId, rawBody: string, headers: Record<string, string> = {}) {
  return handleWebhook(db, providers.get(providerId)!, { rawBody, headers: new Headers(headers) });
}

beforeAll(async () => {
  await enableGateways(db);
  stub.install();
});

beforeEach(() => {
  stub.reset();
  stub.on("POST", `${PAYPAL_API}/v1/oauth2/token`, {
    json: { access_token: "token", expires_in: 3600 },
  });
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

async function expectPending(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.status).toBe("pending");
  expect(await db.entitlement.count({ where: { orderItem: { orderId } } })).toBe(0);
}

async function expectPaid(orderId: string, userId: string, productId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.status).toBe("paid");
  expect(order.paidAt).toBeInstanceOf(Date);
  expect(
    await db.entitlement.findFirst({ where: { userId, productId, revokedAt: null } }),
  ).not.toBeNull();
  return order;
}

describe("Moyasar", () => {
  const event = (paymentId: string, overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: `evt-${randomUUID()}`,
      type: "payment_paid",
      created_at: "2026-10-21T10:00:00Z",
      secret_token: TEST_GATEWAY_CONFIG.moyasar.webhookSecret,
      live: false,
      data: { id: paymentId, status: "paid" },
      ...overrides,
    });
  const payment = (invoiceId: string, overrides: Record<string, unknown> = {}) => ({
    json: {
      id: "pay_1",
      status: "paid",
      amount: 5625,
      currency: "SAR",
      invoice_id: invoiceId,
      metadata: null,
      ...overrides,
    },
  });

  it("fulfils a verified, re-fetched, matching payment once", async () => {
    const { order, user, product } = await pendingOrder("moyasar");
    expect(order).toMatchObject({ chargedCurrency: "SAR", chargedAmountMinor: 5625 });
    stub.on("GET", "https://api.moyasar.com/v1/payments/pay_1", payment(order.providerReference!));
    const body = event("pay_1", { data: { id: "pay_1", status: "paid", amount: 1 } });

    expect(await send("moyasar", body)).toEqual({ status: 200, outcome: "fulfilled" });
    const paid = await expectPaid(order.id, user.id, product.id);
    expect(paid.providerPaymentId).toBe("pay_1");
    // The webhook body's own amount is never trusted: the API's answer was used.
    expect(stub.last("GET", "/payments/pay_1")?.headers.get("authorization")).toContain("Basic");

    expect(await send("moyasar", body)).toEqual({ status: 200, outcome: "duplicate" });
    const events = await db.paymentEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "moyasar", outcome: "fulfilled" });
    expect(JSON.stringify(events[0]!.payload)).not.toContain(
      TEST_GATEWAY_CONFIG.moyasar.webhookSecret,
    );
  });

  it("keeps the order pending on amount or currency mismatches", async () => {
    const amount = await pendingOrder("moyasar");
    stub.on(
      "GET",
      "https://api.moyasar.com/v1/payments/pay_amount",
      payment(amount.order.providerReference!, { id: "pay_amount", amount: 100 }),
    );
    expect((await send("moyasar", event("pay_amount"))).outcome).toBe("amount_mismatch");
    await expectPending(amount.order.id);

    const currency = await pendingOrder("moyasar");
    stub.on(
      "GET",
      "https://api.moyasar.com/v1/payments/pay_currency",
      payment(currency.order.providerReference!, { id: "pay_currency", currency: "USD" }),
    );
    expect((await send("moyasar", event("pay_currency"))).outcome).toBe("currency_mismatch");
    await expectPending(currency.order.id);
  });

  it("rejects a wrong shared secret without recording anything", async () => {
    const { order } = await pendingOrder("moyasar");
    const before = await db.paymentEvent.count();
    expect(await send("moyasar", event("pay_x", { secret_token: "guess" }))).toEqual({
      status: 401,
      outcome: "invalid_signature",
    });
    expect(await send("moyasar", "not json")).toEqual({
      status: 401,
      outcome: "invalid_signature",
    });
    expect(await db.paymentEvent.count()).toBe(before);
    await expectPending(order.id);
  });

  it("revokes access on refund and allows buying again", async () => {
    const { order, user, product } = await pendingOrder("moyasar");
    stub.on("GET", "https://api.moyasar.com/v1/payments/pay_1", payment(order.providerReference!));
    await send("moyasar", event("pay_1"));
    stub.on(
      "GET",
      "https://api.moyasar.com/v1/payments/pay_1",
      payment(order.providerReference!, { status: "refunded", refunded: 5625 }),
    );
    expect((await send("moyasar", event("pay_1", { type: "payment_refunded" }))).outcome).toBe(
      "refunded",
    );

    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: "refunded",
    });
    const entitlement = await db.entitlement.findFirstOrThrow({
      where: { userId: user.id, productId: product.id },
    });
    expect(entitlement.revokedAt).toBeInstanceOf(Date);

    // Re-purchase: the same entitlement row is restored (upsert, §17.5 §4).
    const again = await placeOrder(deps, {
      user: { id: user.id, email: user.email },
      locale: "en",
      productIds: [product.id],
      providerId: "fake",
      couponCode: null,
      ip: uniqueIp(),
    });
    const repurchase = await db.order.findUniqueOrThrow({ where: { id: again.orderId } });
    const token = fakePaymentToken(
      TEST_GATEWAY_CONFIG.secret,
      repurchase.providerReference!,
      "paid",
    );
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment.paid",
      payment: token,
    });
    expect(
      (
        await send("fake", body, {
          [FAKE_SIGNATURE_HEADER]: signFakeWebhook(TEST_GATEWAY_CONFIG.secret, body),
        })
      ).outcome,
    ).toBe("fulfilled");
    const restored = await db.entitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
    expect(restored.revokedAt).toBeNull();
    expect(await db.entitlement.count({ where: { userId: user.id, productId: product.id } })).toBe(
      1,
    );
  });

  it("ignores events it does not handle and unknown invoices", async () => {
    expect((await send("moyasar", event("x", { type: "card_auth_failed" }))).outcome).toBe(
      "ignored",
    );
    stub.on(
      "GET",
      "https://api.moyasar.com/v1/payments/pay_unknown",
      payment("inv_unknown", { id: "pay_unknown" }),
    );
    expect((await send("moyasar", event("pay_unknown"))).outcome).toBe("unknown_order");
  });

  it("leaves the event unprocessed when the provider cannot be reached, so a retry works", async () => {
    const { order, user, product } = await pendingOrder("moyasar");
    stub.on("GET", "https://api.moyasar.com/v1/payments/pay_retry", { status: 502 });
    const body = event("pay_retry");
    await expect(send("moyasar", body)).rejects.toThrow("moyasar: HTTP 502");
    stub.on(
      "GET",
      "https://api.moyasar.com/v1/payments/pay_retry",
      payment(order.providerReference!, { id: "pay_retry" }),
    );
    expect((await send("moyasar", body)).outcome).toBe("fulfilled");
    await expectPaid(order.id, user.id, product.id);
  });
});

describe("Paddle", () => {
  const transaction = (
    id: string,
    overrides: {
      status?: string;
      unit?: string;
      currency?: string;
      tax?: string;
      adjustments?: unknown[];
    } = {},
  ) => ({
    json: {
      data: {
        id,
        status: overrides.status ?? "completed",
        currency_code: overrides.currency ?? "USD",
        custom_data: null,
        items: [
          {
            quantity: 1,
            price: {
              tax_mode: "internal",
              unit_price: { amount: overrides.unit ?? "1500", currency_code: "USD" },
            },
          },
        ],
        details: { totals: { tax: overrides.tax ?? "196", grand_total: "1500" } },
        adjustments: overrides.adjustments ?? [],
      },
    },
  });
  const event = (transactionId: string, type = "transaction.completed") =>
    JSON.stringify({
      event_id: `evt_${randomUUID()}`,
      event_type: type,
      occurred_at: "2026-10-21T10:00:00Z",
      data: { id: transactionId },
    });

  it("matches line-item prices independent of tax and records Paddle's tax", async () => {
    const { order, user, product } = await pendingOrder("paddle");
    stub.on(
      "GET",
      `${PADDLE_API}/transactions/${order.providerReference}`,
      transaction(order.providerReference!),
    );
    const body = event(order.providerReference!);
    expect(await send("paddle", body, { "paddle-signature": paddleSignature(body) })).toEqual({
      status: 200,
      outcome: "fulfilled",
    });
    const paid = await expectPaid(order.id, user.id, product.id);
    // Tax-inclusive: the subtotal is lower than the store price, yet the order is paid.
    expect(paid).toMatchObject({
      providerTaxMode: "internal",
      providerTaxMinor: 196,
      chargedAmountMinor: 1500,
      taxUsdCents: 0,
    });
    expect(stub.last("GET", "/transactions/")?.url).toContain("include=adjustments");

    expect(
      (await send("paddle", body, { "paddle-signature": paddleSignature(body) })).outcome,
    ).toBe("duplicate");
  });

  it("keeps the order pending on line-item or currency mismatches", async () => {
    const amount = await pendingOrder("paddle");
    stub.on(
      "GET",
      `${PADDLE_API}/transactions/${amount.order.providerReference}`,
      transaction(amount.order.providerReference!, { unit: "100" }),
    );
    const body = event(amount.order.providerReference!);
    expect(
      (await send("paddle", body, { "paddle-signature": paddleSignature(body) })).outcome,
    ).toBe("amount_mismatch");
    await expectPending(amount.order.id);

    const currency = await pendingOrder("paddle");
    stub.on(
      "GET",
      `${PADDLE_API}/transactions/${currency.order.providerReference}`,
      transaction(currency.order.providerReference!, { currency: "EUR" }),
    );
    const other = event(currency.order.providerReference!);
    expect(
      (await send("paddle", other, { "paddle-signature": paddleSignature(other) })).outcome,
    ).toBe("currency_mismatch");
    await expectPending(currency.order.id);
  });

  it("rejects bad, missing and stale signatures", async () => {
    const body = event("txn_x");
    expect(
      (await send("paddle", body, { "paddle-signature": paddleSignature(`${body} `) })).status,
    ).toBe(401);
    expect((await send("paddle", body)).status).toBe(401);
    expect((await send("paddle", body, { "paddle-signature": "ts=abc;h1=00" })).status).toBe(401);
    const stale = Math.floor(Date.now() / 1000) - 3600;
    expect(
      (await send("paddle", body, { "paddle-signature": paddleSignature(body, stale) })).status,
    ).toBe(401);
    // A rotated secret: one of several h1 values may match.
    const rotated = `${paddleSignature(body)};h1=${"0".repeat(64)}`;
    stub.on("GET", `${PADDLE_API}/transactions/txn_x`, transaction("txn_x"));
    expect((await send("paddle", body, { "paddle-signature": rotated })).status).toBe(200);
  });

  it("revokes access when a refund adjustment is approved", async () => {
    const { order, user, product } = await pendingOrder("paddle");
    stub.on(
      "GET",
      `${PADDLE_API}/transactions/${order.providerReference}`,
      transaction(order.providerReference!),
    );
    const paid = event(order.providerReference!);
    await send("paddle", paid, { "paddle-signature": paddleSignature(paid) });
    stub.on(
      "GET",
      `${PADDLE_API}/transactions/${order.providerReference}`,
      transaction(order.providerReference!, {
        adjustments: [{ action: "refund", status: "approved" }],
      }),
    );
    const refund = JSON.stringify({
      event_id: `evt_${randomUUID()}`,
      event_type: "adjustment.updated",
      data: { id: "adj_1", action: "refund", transaction_id: order.providerReference },
    });
    expect(
      (await send("paddle", refund, { "paddle-signature": paddleSignature(refund) })).outcome,
    ).toBe("refunded");
    expect(
      (await db.entitlement.findFirstOrThrow({ where: { userId: user.id, productId: product.id } }))
        .revokedAt,
    ).not.toBeNull();
  });
});

describe("PayPal", () => {
  const verified = (status = "SUCCESS") =>
    stub.on("POST", `${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
      json: { verification_status: status },
    });
  const paypalOrder = (
    id: string,
    orderId: string,
    capture: { status?: string; value?: string; currency?: string } = {},
  ) => ({
    json: {
      id,
      status: "COMPLETED",
      purchase_units: [
        {
          custom_id: orderId,
          amount: { currency_code: "USD", value: "15.00" },
          payments: {
            captures: [
              {
                id: "CAP-1",
                status: capture.status ?? "COMPLETED",
                amount: {
                  currency_code: capture.currency ?? "USD",
                  value: capture.value ?? "15.00",
                },
              },
            ],
          },
        },
      ],
    },
  });
  const captureEvent = (orderId: string, type = "PAYMENT.CAPTURE.COMPLETED") =>
    JSON.stringify({
      id: `WH-${randomUUID()}`,
      event_type: type,
      resource: {
        id: "CAP-1",
        status: "COMPLETED",
        supplementary_data: { related_ids: { order_id: orderId } },
      },
    });

  it("verifies through PayPal with the raw event and fulfils the capture", async () => {
    const { order, user, product } = await pendingOrder("paypal");
    verified();
    stub.on(
      "GET",
      `${PAYPAL_API}/v2/checkout/orders/${order.providerReference}`,
      paypalOrder(order.providerReference!, order.id),
    );
    const body = captureEvent(order.providerReference!);
    expect(await send("paypal", body, PAYPAL_HEADERS)).toEqual({
      status: 200,
      outcome: "fulfilled",
    });
    expect((await expectPaid(order.id, user.id, product.id)).providerPaymentId).toBe("CAP-1");

    const verification = stub.last("POST", "/verify-webhook-signature")!;
    expect(verification.body.endsWith(`"webhook_event":${body}}`)).toBe(true);
    expect(JSON.parse(verification.body)).toMatchObject({
      webhook_id: "WH-STORE",
      transmission_id: "transmission-1",
      auth_algo: "SHA256withRSA",
    });

    expect((await send("paypal", body, PAYPAL_HEADERS)).outcome).toBe("duplicate");
  });

  it("keeps the order pending on amount or currency mismatches", async () => {
    verified();
    const amount = await pendingOrder("paypal");
    stub.on(
      "GET",
      `${PAYPAL_API}/v2/checkout/orders/${amount.order.providerReference}`,
      paypalOrder(amount.order.providerReference!, amount.order.id, { value: "1.00" }),
    );
    expect(
      (await send("paypal", captureEvent(amount.order.providerReference!), PAYPAL_HEADERS)).outcome,
    ).toBe("amount_mismatch");
    await expectPending(amount.order.id);

    const currency = await pendingOrder("paypal");
    stub.on(
      "GET",
      `${PAYPAL_API}/v2/checkout/orders/${currency.order.providerReference}`,
      paypalOrder(currency.order.providerReference!, currency.order.id, { currency: "EUR" }),
    );
    expect(
      (await send("paypal", captureEvent(currency.order.providerReference!), PAYPAL_HEADERS))
        .outcome,
    ).toBe("currency_mismatch");
    await expectPending(currency.order.id);
  });

  it("rejects events PayPal does not verify, missing headers and foreign certificates", async () => {
    const body = captureEvent("ORDER-X");
    verified("FAILURE");
    expect((await send("paypal", body, PAYPAL_HEADERS)).status).toBe(401);
    expect((await send("paypal", body, {})).status).toBe(401);
    verified();
    expect(
      (
        await send("paypal", body, {
          ...PAYPAL_HEADERS,
          "paypal-cert-url": "https://evil.example/cert",
        })
      ).status,
    ).toBe(401);
  });

  it("captures approved orders without fulfilling them", async () => {
    const { order } = await pendingOrder("paypal");
    verified();
    stub.on("POST", `${PAYPAL_API}/v2/checkout/orders/${order.providerReference}/capture`, {
      json: { status: "COMPLETED" },
    });
    const approved = JSON.stringify({
      id: `WH-${randomUUID()}`,
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: { id: order.providerReference },
    });
    expect((await send("paypal", approved, PAYPAL_HEADERS)).outcome).toBe("capture_requested");
    expect(stub.last("POST", "/capture")?.headers.get("paypal-request-id")).toBe(
      `capture-${order.id}`,
    );
    await expectPending(order.id);
  });
});

describe("fake gateway (tests only)", () => {
  const sign = (body: string) => ({
    [FAKE_SIGNATURE_HEADER]: signFakeWebhook(TEST_GATEWAY_CONFIG.secret, body),
  });
  const event = (token: string, type = "payment.paid") =>
    JSON.stringify({ id: `evt_${randomUUID()}`, type, payment: token });

  it("goes through the same verification, idempotency and matching", async () => {
    const coupon = await createCoupon(db, { usageLimit: 3 });
    const { order, user, product } = await pendingOrder("fake", 2000, coupon.code);
    const token = fakePaymentToken(TEST_GATEWAY_CONFIG.secret, order.providerReference!, "paid");
    const body = event(token);
    expect((await send("fake", body, sign(body))).outcome).toBe("fulfilled");
    await expectPaid(order.id, user.id, product.id);
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      usedCount: 1,
      reservedCount: 0,
    });
    expect((await send("fake", body, sign(body))).outcome).toBe("duplicate");
    expect((await send("fake", body, { [FAKE_SIGNATURE_HEADER]: "forged" })).status).toBe(401);

    const mismatch = await pendingOrder("fake");
    const wrong = event(
      fakePaymentToken(TEST_GATEWAY_CONFIG.secret, mismatch.order.providerReference!, "paid", {
        amountMinor: 1,
      }),
    );
    expect((await send("fake", wrong, sign(wrong))).outcome).toBe("amount_mismatch");
    const euro = event(
      fakePaymentToken(TEST_GATEWAY_CONFIG.secret, mismatch.order.providerReference!, "paid", {
        currency: "EUR",
      }),
    );
    expect((await send("fake", euro, sign(euro))).outcome).toBe("currency_mismatch");
    await expectPending(mismatch.order.id);
  });

  it("fails pending orders and releases their coupons", async () => {
    const coupon = await createCoupon(db, { usageLimit: 1 });
    const { order } = await pendingOrder("fake", 1000, coupon.code);
    const failed = event(
      fakePaymentToken(TEST_GATEWAY_CONFIG.secret, order.providerReference!, "failed"),
      "payment.failed",
    );
    expect((await send("fake", failed, sign(failed))).outcome).toBe("failed");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("failed");
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      reservedCount: 0,
    });
  });

  it("fulfils a payment that arrives after the order expired, flagging the coupon overshoot", async () => {
    const coupon = await createCoupon(db, { usageLimit: 1 });
    const { order, user, product } = await pendingOrder("fake", 1000, coupon.code);
    // The maintenance task expired the order and released the reservation…
    await db.$transaction(async (tx) => {
      const { closeOrder } = await import("@/features/checkout/fulfilment");
      await closeOrder(tx, order.id, "expired");
    });
    // …and someone else used the last coupon use meanwhile.
    await db.coupon.update({ where: { id: coupon.id }, data: { usedCount: 1 } });

    const body = event(
      fakePaymentToken(TEST_GATEWAY_CONFIG.secret, order.providerReference!, "paid"),
    );
    expect((await send("fake", body, sign(body))).outcome).toBe("fulfilled");
    const paid = await expectPaid(order.id, user.id, product.id);
    expect(paid.couponOvershoot).toBe(true);
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      usedCount: 2,
    });
  });

  it("processes concurrent deliveries of the same event once", async () => {
    const { order } = await pendingOrder("fake");
    const body = event(
      fakePaymentToken(TEST_GATEWAY_CONFIG.secret, order.providerReference!, "paid"),
    );
    const outcomes = (
      await Promise.all([send("fake", body, sign(body)), send("fake", body, sign(body))])
    ).map((r) => r.outcome);
    expect(outcomes.sort()).toEqual(["duplicate", "fulfilled"]);
    expect(await db.entitlement.count({ where: { orderItem: { orderId: order.id } } })).toBe(1);
  });
});
