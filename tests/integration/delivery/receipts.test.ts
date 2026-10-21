import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeOrder } from "@/features/checkout/orders";
import { handleWebhook } from "@/features/checkout/webhooks";
import { sendReceipt } from "@/features/orders/receipt";
import { settleBackgroundTasks } from "@/lib/auth/background";
import { getDb } from "@/lib/db";
import { fakePaymentToken, FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@/lib/payments/fake";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createCoupon, createProduct, enableGateways } from "../../support/checkout";
import { TEST_GATEWAY_CONFIG, testProviders } from "../../support/gateways";
import { listMessages, waitForMessage } from "../../support/mailpit";
import { createCustomer, uniqueIp } from "../../support/users";

// Receipt emails (spec §10.1 step 10): after commit, in the order's language, through
// Mailpit, with a link to My Purchases and no download links.

const db = getDb();
const providers = testProviders();
const startedAt = new Date();

beforeAll(async () => {
  await enableGateways(db);
  await db.storeSetting.update({
    where: { id: 1 },
    data: { storeNameAr: "المتجر", storeNameEn: "Store" },
  });
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

async function paidOrder(locale: "ar" | "en", options: { couponCode?: string } = {}) {
  const customer = await createCustomer(db);
  const product = await createProduct(db, { priceUsdCents: 1999, titleEn: "Receipt Guide" });
  const placed = await placeOrder(
    { db, providers, secret: TEST_GATEWAY_CONFIG.secret, appUrl: TEST_GATEWAY_CONFIG.appUrl },
    {
      user: { id: customer.id, email: customer.email },
      locale,
      productIds: [product.id],
      providerId: "fake",
      couponCode: options.couponCode ?? null,
      ip: uniqueIp(),
    },
  );
  const order = await db.order.findUniqueOrThrow({ where: { id: placed.orderId } });
  return { customer, order };
}

describe("receipts", () => {
  it("are sent once a webhook has fulfilled the order", async () => {
    const coupon = await createCoupon(db, { type: "fixed", value: 499 });
    const { customer, order } = await paidOrder("en", { couponCode: coupon.code });
    const sent: string[] = [];
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "payment.paid",
      payment: fakePaymentToken(TEST_GATEWAY_CONFIG.secret, order.providerReference!, "paid"),
    });
    await handleWebhook(
      db,
      providers.get("fake")!,
      {
        rawBody: body,
        headers: new Headers({
          [FAKE_SIGNATURE_HEADER]: signFakeWebhook(TEST_GATEWAY_CONFIG.secret, body),
        }),
      },
      { onFulfilled: (orderId) => sent.push(orderId) },
    );
    expect(sent).toEqual([order.id]);

    expect(await sendReceipt(db, order.id)).toBe(true);
    const message = await waitForMessage(customer.email);
    expect(message.Subject).toBe(`Your receipt for order ${order.orderNumber} at Store`);
    expect(message.Text).toContain("Receipt Guide");
    expect(message.Text).toContain("$19.99");
    expect(message.Text).toContain("−$4.99");
    expect(message.Text).toContain("$15.00");
    expect(message.HTML).toContain("http://localhost:3000/en/account/library");
    // Never a file URL in an email (spec §5.1).
    expect(message.HTML).not.toContain("/api/downloads");
    expect(message.HTML).not.toMatch(/X-Amz-Signature/i);
  });

  it("use the order's language", async () => {
    const { customer, order } = await paidOrder("ar");
    await db.order.update({
      where: { id: order.id },
      data: { status: "paid", paidAt: new Date() },
    });
    expect(await sendReceipt(db, order.id)).toBe(true);
    const message = await waitForMessage(customer.email);
    expect(message.Subject).toBe(`إيصال الطلب ${order.orderNumber} من المتجر`);
    expect(message.HTML).toContain('dir="rtl"');
    expect(message.HTML).toContain("/ar/account/library");
  });

  it("are not sent for unpaid orders", async () => {
    const { customer, order } = await paidOrder("en");
    expect(await sendReceipt(db, order.id)).toBe(false);
    expect(await sendReceipt(db, randomUUID())).toBe(false);
    expect(await listMessages(customer.email)).toHaveLength(0);
  });

  it("go out for zero-total orders as well", async () => {
    const customer = await createCustomer(db);
    const free = await createProduct(db, { priceUsdCents: 0 });
    const fulfilled: string[] = [];
    const placed = await placeOrder(
      {
        db,
        providers,
        secret: TEST_GATEWAY_CONFIG.secret,
        appUrl: TEST_GATEWAY_CONFIG.appUrl,
        onFulfilled: (id) => fulfilled.push(id),
      },
      {
        user: { id: customer.id, email: customer.email },
        locale: "en",
        productIds: [free.id],
        providerId: null,
        couponCode: null,
        ip: uniqueIp(),
      },
    );
    expect(fulfilled).toEqual([placed.orderId]);
    await sendReceipt(db, placed.orderId);
    await settleBackgroundTasks();
    expect((await waitForMessage(customer.email)).Text).toContain("$0.00");
  });
});
