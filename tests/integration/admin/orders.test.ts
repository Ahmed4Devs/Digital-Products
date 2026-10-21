import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findAdminOrder,
  findAdminOrders,
  parseAdminOrderSearch,
} from "@/features/orders/admin-data";
import { refundOrder } from "@/features/orders/admin-service";
import { findOverviewMetrics } from "@/features/orders/metrics";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import type { PaymentProvider, ProviderId } from "@/lib/payments/types";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createProduct } from "../../support/checkout";
import { waitForMessage } from "../../support/mailpit";
import { createPaidOrder } from "../../support/orders";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner } from "../../support/users";

// Owner order management (spec §11): resend receipt, refund through the gateway, grant
// and revoke access, plus the reads behind the orders list and the overview.

let requestCookies = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookies ? { cookie: requestCookies } : {}),
}));
vi.mock("next/cache", () => ({ updateTag: () => undefined }));

const actions = await import("@/features/orders/actions");

const db = getDb();
const auth = getAuth();
const startedAt = new Date();
let ownerId = "";
let ownerCookie = "";
let customerCookie = "";

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

async function scenario(options: Partial<Parameters<typeof createPaidOrder>[1]> = {}) {
  const customer = await createCustomer(db);
  const product = await createProduct(db, { priceUsdCents: 1500 });
  const order = await createPaidOrder(db, { user: customer, products: [product], ...options });
  return { customer, product, order, item: order.items[0]! };
}

beforeAll(async () => {
  const owner = await ensureOwner(db);
  ownerId = owner.id;
  ownerCookie = await sessionCookieFor(auth, owner.id);
  customerCookie = await sessionCookieFor(auth, (await createCustomer(db)).id);
});

beforeEach(() => {
  requestCookies = ownerCookie;
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

describe("owner-only enforcement", () => {
  it("rejects guests and customers on every order action", async () => {
    const { order, item } = await scenario();
    const audits = await db.auditLog.count();
    const attempts = [
      () => actions.resendReceiptAction(order.id),
      () => actions.refundOrderAction(order.id),
      () => actions.setItemAccessAction(order.id, item.id, false),
    ];
    for (const cookie of ["", customerCookie]) {
      requestCookies = cookie;
      for (const attempt of attempts) await expectNotFound(attempt());
    }
    expect(await db.auditLog.count()).toBe(audits);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
  });
});

describe("refunds", () => {
  it("refunds through the gateway, revokes access and audits", async () => {
    const { order, customer } = await scenario();
    expect(await actions.refundOrderAction(order.id)).toEqual({
      status: "success",
      message: "orderRefunded",
    });
    const refunded = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refunded.status).toBe("refunded");
    expect(refunded.refundedAt).not.toBeNull();
    const entitlements = await db.entitlement.findMany({ where: { userId: customer.id } });
    expect(entitlements.every((entitlement) => entitlement.revokedAt)).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: order.id } });
    expect(audit).toMatchObject({ actorId: ownerId, action: "order.refund" });
  });

  it("refuses orders that are not paid, and refunds zero-total orders without a gateway", async () => {
    const pending = await scenario({ status: "pending" });
    expect(await actions.refundOrderAction(pending.order.id)).toEqual({
      status: "error",
      message: "notRefundable",
    });
    const customer = await createCustomer(db);
    const free = await createProduct(db, { priceUsdCents: 0 });
    const order = await createPaidOrder(db, { user: customer, products: [free] });
    expect(order.provider).toBeNull();
    expect(await actions.refundOrderAction(order.id)).toMatchObject({ status: "success" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("refunded");
  });

  it("keeps the order paid while the gateway reviews the refund, or when it refuses", async () => {
    const reviewing = { refund: async () => ({ state: "pending" as const }) };
    const refusing = {
      refund: async () => {
        throw new Error("declined");
      },
    };
    const providersWith = (provider: object) =>
      new Map<ProviderId, PaymentProvider>([["fake", provider as PaymentProvider]]);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await scenario();
    expect(await refundOrder(db, providersWith(reviewing), ownerId, first.order.id)).toBe(
      "pending",
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: first.order.id } })).status).toBe(
      "paid",
    );
    expect(
      await db.auditLog.findFirst({
        where: { entityId: first.order.id, action: "order.refund_requested" },
      }),
    ).not.toBeNull();

    const second = await scenario();
    await expect(
      refundOrder(db, providersWith(refusing), ownerId, second.order.id),
    ).rejects.toMatchObject({
      messageKey: "refundFailed",
    });
    await expect(refundOrder(db, new Map(), ownerId, second.order.id)).rejects.toMatchObject({
      messageKey: "gatewayUnavailable",
    });
    expect((await db.order.findUniqueOrThrow({ where: { id: second.order.id } })).status).toBe(
      "paid",
    );
    expect(await db.auditLog.count({ where: { entityId: second.order.id } })).toBe(0);
    error.mockRestore();
  });
});

describe("access per item", () => {
  it("revokes and grants again, each audited", async () => {
    const { order, item, customer, product } = await scenario();
    expect(await actions.setItemAccessAction(order.id, item.id, false)).toEqual({
      status: "success",
      message: "accessRevoked",
    });
    const key = { userId_productId: { userId: customer.id, productId: product.id } };
    expect((await db.entitlement.findUniqueOrThrow({ where: key })).revokedAt).not.toBeNull();
    expect(await actions.setItemAccessAction(order.id, item.id, true)).toEqual({
      status: "success",
      message: "accessGranted",
    });
    expect((await db.entitlement.findUniqueOrThrow({ where: key })).revokedAt).toBeNull();
    const entitlement = await db.entitlement.findUniqueOrThrow({ where: key });
    const audits = await db.auditLog.findMany({
      where: { entityId: entitlement.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => [row.action, row.actorId])).toEqual([
      ["entitlement.revoke", ownerId],
      ["entitlement.grant", ownerId],
    ]);
  });

  it("never revokes access a later purchase granted, and grants only for paid orders", async () => {
    const customer = await createCustomer(db);
    const product = await createProduct(db, { priceUsdCents: 1500 });
    const old = await createPaidOrder(db, {
      user: customer,
      products: [product],
      status: "refunded",
    });
    const repurchase = await createPaidOrder(db, { user: customer, products: [product] });

    expect(await actions.setItemAccessAction(old.id, old.items[0]!.id, false)).toEqual({
      status: "error",
      message: "notFound",
    });
    expect(await actions.setItemAccessAction(old.id, old.items[0]!.id, true)).toEqual({
      status: "error",
      message: "notPaid",
    });
    const entitlement = await db.entitlement.findUniqueOrThrow({
      where: { userId_productId: { userId: customer.id, productId: product.id } },
    });
    expect(entitlement).toMatchObject({ revokedAt: null, orderItemId: repurchase.items[0]!.id });
    // An item id from another order is refused.
    expect(await actions.setItemAccessAction(old.id, repurchase.items[0]!.id, false)).toEqual({
      status: "error",
      message: "notFound",
    });
  });
});

describe("receipts", () => {
  it("resends the receipt of a paid order and refuses unpaid ones", async () => {
    const { order, customer } = await scenario();
    expect(await actions.resendReceiptAction(order.id)).toEqual({
      status: "success",
      message: "receiptSent",
    });
    await waitForMessage(customer.email);
    const pending = await scenario({ status: "pending" });
    expect(await actions.resendReceiptAction(pending.order.id)).toEqual({
      status: "error",
      message: "receiptUnavailable",
    });
    expect(await actions.resendReceiptAction("not-a-uuid")).toEqual({
      status: "error",
      message: "invalid",
    });
  });
});

describe("reads", () => {
  it("filters orders by status, number, email, date and coupon overshoot", async () => {
    const { order, customer } = await scenario({ couponOvershoot: true });
    const search = (params: Record<string, string>) =>
      findAdminOrders(db, parseAdminOrderSearch(params));

    expect((await search({ q: customer.email.toUpperCase() })).orders.map((row) => row.id)).toEqual(
      [order.id],
    );
    expect((await search({ q: String(order.orderNumber) })).orders.map((row) => row.id)).toEqual([
      order.id,
    ]);
    expect(
      (await search({ status: "paid", overshoot: "1" })).orders.map((row) => row.id),
    ).toContain(order.id);
    expect((await search({ status: "refunded", q: customer.email })).total).toBe(0);
    expect((await search({ to: "2000-01-01", q: customer.email })).total).toBe(0);
    // Unknown filter values fall back to the defaults instead of failing.
    expect(parseAdminOrderSearch({ status: "nope", page: "-3", from: "yesterday" })).toMatchObject({
      status: "all",
      page: 1,
      from: "",
    });
  });

  it("shows an order with its items, access and events", async () => {
    const { order, item } = await scenario();
    const detail = await findAdminOrder(db, order.id);
    expect(detail?.items).toEqual([
      expect.objectContaining({
        id: item.id,
        entitlement: expect.objectContaining({ revokedAt: null }),
      }),
    ]);
    expect(detail?.exchangeRateUsed).toBe("3.750000");
  });

  it("counts sales by the store's calendar day in Riyadh", async () => {
    const customer = await createCustomer(db);
    const product = await createProduct(db, { priceUsdCents: 1000 });
    const other = await createProduct(db, { priceUsdCents: 500 });
    // 2001-03-10 00:30 in Riyadh is still 2001-03-09 in UTC.
    const now = new Date("2001-03-10T09:00:00+03:00");
    await createPaidOrder(db, {
      user: customer,
      products: [product],
      paidAt: new Date("2001-03-10T00:30:00+03:00"),
    });
    await createPaidOrder(db, {
      user: await createCustomer(db),
      products: [product, other],
      paidAt: new Date("2001-03-09T23:30:00+03:00"),
    });
    await createPaidOrder(db, {
      user: await createCustomer(db),
      products: [other],
      paidAt: new Date("2001-01-01T12:00:00+03:00"),
    });

    const metrics = await findOverviewMetrics(db, now);
    expect(metrics.today).toEqual({ salesUsdCents: 1000, orders: 1 });
    expect(metrics.window).toEqual({ salesUsdCents: 2500, orders: 2 });
    expect(metrics.topProducts.slice(0, 2)).toEqual([
      expect.objectContaining({ productId: product.id, sold: 2 }),
      expect.objectContaining({ productId: other.id, sold: 1 }),
    ]);
  });
});
