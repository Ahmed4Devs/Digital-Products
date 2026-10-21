import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  COUPON_CHECK_LIMIT,
  limitCouponChecks,
  placeOrder,
  quoteCheckout,
  type PlaceOrderInput,
} from "@/features/checkout/orders";
import { ActionError } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createCoupon, createProduct, enableGateways } from "../../support/checkout";
import { GatewayStub, TEST_GATEWAY_CONFIG, testProviders } from "../../support/gateways";
import { createCustomer, uniqueIp } from "../../support/users";

// Order creation against the real database (spec §10.1, §17.5 §6, §17.5 §9), with the
// gateways' HTTP APIs stubbed.

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

async function customer() {
  const user = await createCustomer(db);
  return { id: user.id, email: user.email };
}

function input(
  user: { id: string; email: string },
  productIds: string[],
  overrides: Partial<PlaceOrderInput> = {},
): PlaceOrderInput {
  return {
    user,
    locale: "en",
    productIds,
    providerId: "fake",
    couponCode: null,
    ip: uniqueIp(),
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ActionError) return error.messageKey;
    throw error;
  }
  throw new Error("expected a rejection");
}

beforeAll(async () => {
  await enableGateways(db);
  stub.install();
});

beforeEach(() => stub.reset());

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

describe("placing an order", () => {
  it("creates a pending order with snapshots, then the payment", async () => {
    const user = await customer();
    const product = await createProduct(db, { priceUsdCents: 1500, titleEn: "Snapshot Title" });
    const placed = await placeOrder(deps, input(user, [product.id]));

    expect(placed.zeroTotal).toBe(false);
    expect(placed.redirectUrl).toMatch(
      /^http:\/\/localhost:3000\/en\/checkout\/fake\?reference=fake_/,
    );
    const order = await db.order.findUniqueOrThrow({
      where: { id: placed.orderId },
      include: { items: true },
    });
    expect(order).toMatchObject({
      status: "pending",
      userId: user.id,
      customerEmailSnapshot: user.email,
      subtotalUsdCents: 1500,
      totalUsdCents: 1500,
      chargedCurrency: "USD",
      chargedAmountMinor: 1500,
      provider: "fake",
      locale: "en",
    });
    expect(order.orderNumber).toBeGreaterThanOrEqual(100_001);
    expect(order.providerReference).toMatch(/^fake_/);
    expect(order.exchangeRateUsed.toFixed(6)).toBe("3.750000");
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: product.id,
        titleEn: "Snapshot Title",
        unitPriceUsdCents: 1500,
        unitChargedMinor: 1500,
      }),
    ]);

    // Later price changes never touch the order.
    await db.product.update({
      where: { id: product.id },
      data: { priceUsdCents: 9900, titleEn: "Renamed" },
    });
    const again = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(again).toMatchObject({ titleEn: "Snapshot Title", unitPriceUsdCents: 1500 });
  });

  it("charges Moyasar in SAR with fixed prices, through an invoice", async () => {
    const user = await customer();
    const fixed = await createProduct(db, { priceUsdCents: 1999, fixedPriceSarHalalas: 7400 });
    const converted = await createProduct(db, { priceUsdCents: 1200 });
    stub.on("POST", "https://api.moyasar.com/v1/invoices", {
      json: { id: "inv_moyasar_1", invoice_url: "https://pay.moyasar.com/inv_moyasar_1" },
    });

    const placed = await placeOrder(
      deps,
      input(user, [fixed.id, converted.id], { providerId: "moyasar", locale: "ar" }),
    );
    expect(placed.redirectUrl).toBe("https://pay.moyasar.com/inv_moyasar_1");

    const sent = stub.last("POST", "/v1/invoices")!;
    expect(sent.headers.get("authorization")).toBe(
      `Basic ${Buffer.from("sk_test_store:").toString("base64")}`,
    );
    expect(JSON.parse(sent.body)).toMatchObject({
      amount: 11_900,
      currency: "SAR",
      success_url: `http://localhost:3000/ar/checkout/result?order=${placed.orderId}`,
      back_url: "http://localhost:3000/ar/cart",
      callback_url: "http://localhost:3000/api/webhooks/moyasar",
      metadata: { order_id: placed.orderId },
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(order).toMatchObject({
      chargedCurrency: "SAR",
      chargedAmountMinor: 11_900,
      totalUsdCents: 3199,
      providerReference: "inv_moyasar_1",
    });
  });

  it("sends Paddle explicit tax modes and never adds the store's tax", async () => {
    await enableGateways(db, { taxEnabled: true, taxRateBasisPoints: 1500 });
    try {
      const user = await customer();
      const product = await createProduct(db, { priceUsdCents: 1000 });
      stub.on("POST", "https://sandbox-api.paddle.com/transactions", {
        json: { data: { id: "txn_1" } },
      });
      const placed = await placeOrder(deps, input(user, [product.id], { providerId: "paddle" }));
      expect(placed.redirectUrl).toBe("http://localhost:3000/en/checkout/paddle?_ptxn=txn_1");
      const body = JSON.parse(stub.last("POST", "/transactions")!.body);
      expect(body.items[0].price).toMatchObject({
        tax_mode: "internal",
        unit_price: { amount: "1000", currency_code: "USD" },
      });
      expect(body.custom_data).toEqual({
        order_id: placed.orderId,
        order_number: expect.any(String),
      });
      const order = await db.order.findUniqueOrThrow({ where: { id: placed.orderId } });
      expect(order).toMatchObject({
        taxUsdCents: 0,
        totalUsdCents: 1000,
        providerTaxMode: "internal",
      });

      // PayPal gets the store's tax on top.
      stub.on("POST", "https://api-m.sandbox.paypal.com/v1/oauth2/token", {
        json: { access_token: "token", expires_in: 3600 },
      });
      stub.on("POST", "https://api-m.sandbox.paypal.com/v2/checkout/orders", {
        json: {
          id: "PAYPAL-1",
          links: [
            {
              rel: "payer-action",
              href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-1",
            },
          ],
        },
      });
      const second = await createProduct(db, { priceUsdCents: 1000 });
      const paypal = await placeOrder(deps, input(user, [second.id], { providerId: "paypal" }));
      expect(paypal.redirectUrl).toContain("checkoutnow");
      const request = stub.last("POST", "/v2/checkout/orders")!;
      expect(request.headers.get("paypal-request-id")).toBe(`order-${paypal.orderId}`);
      expect(JSON.parse(request.body).purchase_units[0].amount).toEqual({
        currency_code: "USD",
        value: "11.50",
        breakdown: {
          item_total: { currency_code: "USD", value: "10.00" },
          tax_total: { currency_code: "USD", value: "1.50" },
        },
      });
    } finally {
      await enableGateways(db);
    }
  });

  it("fulfils free products and 100 % coupons without a gateway", async () => {
    const user = await customer();
    const free = await createProduct(db, { priceUsdCents: 0 });
    const placed = await placeOrder(deps, input(user, [free.id], { providerId: null }));
    expect(placed).toMatchObject({
      zeroTotal: true,
      redirectUrl: expect.stringContaining("/en/checkout/result?order="),
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(order).toMatchObject({ status: "paid", provider: null, totalUsdCents: 0 });
    expect(
      await db.entitlement.findFirst({
        where: { userId: user.id, productId: free.id, revokedAt: null },
      }),
    ).not.toBeNull();

    const paid = await createProduct(db, { priceUsdCents: 4900 });
    const coupon = await createCoupon(db, { type: "percent", value: 100, usageLimit: 5 });
    const covered = await placeOrder(
      deps,
      input(user, [paid.id], { couponCode: coupon.code.toLowerCase() }),
    );
    expect(covered.zeroTotal).toBe(true);
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      usedCount: 1,
      reservedCount: 0,
    });
    expect(
      await db.couponRedemption.findUniqueOrThrow({ where: { orderId: covered.orderId } }),
    ).toMatchObject({ status: "redeemed" });
    expect(stub.requests).toHaveLength(0);
  });

  it("never sells a product the customer already owns", async () => {
    const user = await customer();
    const product = await createProduct(db, { priceUsdCents: 0 });
    await placeOrder(deps, input(user, [product.id], { providerId: null }));
    expect(await rejection(placeOrder(deps, input(user, [product.id], { providerId: null })))).toBe(
      "cartEmpty",
    );

    const other = await createProduct(db, { priceUsdCents: 500 });
    const quote = await quoteCheckout(deps, {
      user,
      productIds: [product.id, other.id],
      providerId: "fake",
      couponCode: null,
    });
    expect(quote.items.map((item) => item.id)).toEqual([other.id]);
    expect(quote.owned.map((item) => item.id)).toEqual([product.id]);
  });

  it("refuses unavailable gateways and amounts below a gateway's minimum", async () => {
    const user = await customer();
    const cheap = await createProduct(db, { priceUsdCents: 20 });
    expect(
      await rejection(placeOrder(deps, input(user, [cheap.id], { providerId: "moyasar" }))),
    ).toBe("belowMinimum");
    expect(await rejection(placeOrder(deps, input(user, [cheap.id], { providerId: null })))).toBe(
      "chooseGateway",
    );

    await db.storeSetting.update({ where: { id: 1 }, data: { paypalEnabled: false } });
    try {
      expect(
        await rejection(placeOrder(deps, input(user, [cheap.id], { providerId: "paypal" }))),
      ).toBe("gatewayUnavailable");
    } finally {
      await enableGateways(db);
    }
  });

  it("marks the order failed and releases the coupon when the gateway is down", async () => {
    const user = await customer();
    const product = await createProduct(db, { priceUsdCents: 2000 });
    const coupon = await createCoupon(db, { usageLimit: 1 });
    stub.on("POST", "https://api.moyasar.com/v1/invoices", { status: 503 });
    expect(
      await rejection(
        placeOrder(
          deps,
          input(user, [product.id], { providerId: "moyasar", couponCode: coupon.code }),
        ),
      ),
    ).toBe("paymentUnavailable");
    const order = await db.order.findFirstOrThrow({ where: { userId: user.id } });
    expect(order.status).toBe("failed");
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      reservedCount: 0,
      usedCount: 0,
    });
    expect(
      (await db.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).status,
    ).toBe("released");
  });
});

describe("coupons", () => {
  it("validates codes, dates, minimums and per-customer use", async () => {
    const user = await customer();
    const product = await createProduct(db, { priceUsdCents: 1000 });
    const place = (code: string) =>
      rejection(placeOrder(deps, input(user, [product.id], { couponCode: code })));

    expect(await place("NOPE")).toBe("couponInvalid");
    expect(await place("bad code!")).toBe("couponInvalid");
    expect(await place((await createCoupon(db, { active: false })).code)).toBe("couponInvalid");
    expect(
      await place((await createCoupon(db, { startsAt: new Date(Date.now() + 86_400_000) })).code),
    ).toBe("couponInvalid");
    expect(
      await place((await createCoupon(db, { endsAt: new Date(Date.now() - 1000) })).code),
    ).toBe("couponExpired");
    expect(await place((await createCoupon(db, { minSubtotalUsdCents: 5000 })).code)).toBe(
      "couponMinimum",
    );

    const once = await createCoupon(db, { type: "fixed", value: 300 });
    const first = await placeOrder(deps, input(user, [product.id], { couponCode: once.code }));
    const order = await db.order.findUniqueOrThrow({ where: { id: first.orderId } });
    expect(order).toMatchObject({ discountUsdCents: 300, totalUsdCents: 700, couponId: once.id });
    expect(await place(once.code)).toBe("couponAlreadyUsed");

    // Another customer may still use it; a multi-use coupon allows repeats.
    const other = await customer();
    await expect(
      placeOrder(deps, input(other, [product.id], { couponCode: once.code })),
    ).resolves.toBeDefined();
    const multi = await createCoupon(db, { allowMultiplePerCustomer: true });
    await placeOrder(deps, input(user, [product.id], { couponCode: multi.code }));
    await expect(
      placeOrder(deps, input(user, [product.id], { couponCode: multi.code })),
    ).resolves.toBeDefined();
  });

  it("never exceeds the usage limit under concurrent checkouts", async () => {
    const product = await createProduct(db, { priceUsdCents: 1000 });
    const coupon = await createCoupon(db, { usageLimit: 2 });
    const buyers = await Promise.all(Array.from({ length: 6 }, () => customer()));
    const results = await Promise.allSettled(
      buyers.map((buyer) =>
        placeOrder(deps, input(buyer, [product.id], { couponCode: coupon.code })),
      ),
    );
    const succeeded = results.filter((result) => result.status === "fulfilled");
    expect(succeeded).toHaveLength(2);
    for (const result of results) {
      if (result.status === "rejected") {
        expect((result.reason as ActionError).messageKey).toBe("couponExhausted");
      }
    }
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      reservedCount: 2,
      usedCount: 0,
    });
  });
});

describe("rate limits", () => {
  it("limits order creation per account", async () => {
    const user = await customer();
    const product = await createProduct(db, { priceUsdCents: 1000 });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await placeOrder(deps, input(user, [product.id]));
    }
    expect(await rejection(placeOrder(deps, input(user, [product.id])))).toBe("tooManyOrders");
  });

  it("limits order creation per IP across accounts", async () => {
    const ip = uniqueIp();
    const product = await createProduct(db, { priceUsdCents: 0 });
    let refused = 0;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const user = await customer();
      try {
        await placeOrder(deps, input(user, [product.id], { providerId: null, ip }));
      } catch (error) {
        if (error instanceof ActionError && error.messageKey === "tooManyOrders") refused += 1;
        else throw error;
      }
    }
    expect(refused).toBe(1);
  });

  it("limits coupon checks per account, so codes cannot be guessed", async () => {
    const user = await customer();
    const other = await customer();
    for (let attempt = 0; attempt < COUPON_CHECK_LIMIT.max; attempt += 1) {
      await limitCouponChecks(db, deps.secret, user.id);
    }
    expect(await rejection(limitCouponChecks(db, deps.secret, user.id))).toBe(
      "tooManyCouponAttempts",
    );
    await expect(limitCouponChecks(db, deps.secret, other.id)).resolves.toBeUndefined();
  });
});
