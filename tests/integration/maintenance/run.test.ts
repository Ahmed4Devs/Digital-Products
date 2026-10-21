import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeOrder } from "@/features/checkout/orders";
import { runMaintenance } from "@/features/maintenance/run";
import { getDb } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { newPendingKey } from "@/lib/storage/policy";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createCoupon, createProduct, enableGateways } from "../../support/checkout";
import { TEST_GATEWAY_CONFIG, testProviders } from "../../support/gateways";
import { createCustomer, uniqueIp } from "../../support/users";
import { putUpload } from "../../support/files";

// The daily maintenance task (spec §17.5 §10) against the database and real MinIO.

const db = getDb();
const storage = getStorage();
const startedAt = new Date();
const deps = {
  db,
  providers: testProviders(),
  secret: TEST_GATEWAY_CONFIG.secret,
  appUrl: TEST_GATEWAY_CONFIG.appUrl,
};

beforeAll(async () => {
  // Orders here use the fake gateway, which makes no HTTP calls.
  await enableGateways(db);
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

describe("runMaintenance", () => {
  it("expires stale pending orders and releases their reservations, idempotently", async () => {
    const user = await createCustomer(db);
    const product = await createProduct(db, { priceUsdCents: 1000 });
    const coupon = await createCoupon(db, { usageLimit: 1 });
    const placed = await placeOrder(deps, {
      user: { id: user.id, email: user.email },
      locale: "ar",
      productIds: [product.id],
      providerId: "fake",
      couponCode: coupon.code,
      ip: uniqueIp(),
    });
    const fresh = await placeOrder(deps, {
      user: { id: user.id, email: user.email },
      locale: "ar",
      productIds: [product.id],
      providerId: "fake",
      couponCode: null,
      ip: uniqueIp(),
    });
    // Age the first order beyond the 60-minute default.
    await db.order.update({
      where: { id: placed.orderId },
      data: { createdAt: new Date(Date.now() - 2 * 3600_000) },
    });

    const report = await runMaintenance(db, storage);
    expect(report.expiredOrders).toBeGreaterThanOrEqual(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: placed.orderId } })).status).toBe(
      "expired",
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: fresh.orderId } })).status).toBe(
      "pending",
    );
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      reservedCount: 0,
    });
    expect(
      (await db.couponRedemption.findUniqueOrThrow({ where: { orderId: placed.orderId } })).status,
    ).toBe("released");

    const again = await runMaintenance(db, storage);
    expect(again.expiredOrders).toBe(0);
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      reservedCount: 0,
    });
  });

  it("deletes expired tokens and stale rate-limit buckets only", async () => {
    const expired = await db.verification.create({
      data: {
        identifier: `maint-${Date.now()}`,
        value: "x",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const valid = await db.verification.create({
      data: {
        identifier: `maint-ok-${Date.now()}`,
        value: "x",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await db.rateLimitBucket.createMany({
      data: [
        {
          key: `maint-old-${Date.now()}`,
          count: 1,
          windowStartedAt: new Date(Date.now() - 2 * 86_400_000),
        },
        { key: `maint-new-${Date.now()}`, count: 1, windowStartedAt: new Date() },
      ],
    });
    const report = await runMaintenance(db, storage);
    expect(report.deletedVerifications).toBeGreaterThanOrEqual(1);
    expect(report.deletedRateLimitBuckets).toBeGreaterThanOrEqual(1);
    expect(await db.verification.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.verification.findUnique({ where: { id: valid.id } })).not.toBeNull();
    expect(await db.rateLimitBucket.count({ where: { key: { startsWith: "maint-new-" } } })).toBe(
      1,
    );
  });

  it("deletes unconfirmed uploads older than a day and keeps recent ones", async () => {
    const recent = newPendingKey();
    const url = await storage.presignUpload({
      key: recent,
      contentType: "application/pdf",
      contentLength: 5,
      expiresInSeconds: 60,
    });
    expect(await putUpload(url, Buffer.from("%PDF-"), "application/pdf")).toBe(200);
    const old = newPendingKey();
    const deleted: string[] = [];
    const report = await runMaintenance(db, {
      // Storage cannot backdate objects, so "old" ones come from a wrapped listing.
      listOlderThan: async (prefix, before) => [
        ...(await storage.listOlderThan(prefix, before)),
        old,
      ],
      delete: async (bucket, key) => {
        deleted.push(key);
        await storage.delete(bucket, key);
      },
    });
    expect(deleted).toContain(old);
    expect(deleted).not.toContain(recent);
    expect(report.deletedPendingUploads).toBe(deleted.length);
    expect(await storage.head("private", recent)).not.toBeNull();
    await storage.delete("private", recent);
  });
});
