import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { createCustomer, uniqueEmail } from "../../support/users";

// Constraints that live in the migration SQL rather than the Prisma schema.

const db = getDb();

async function createProduct(slug: string, priceUsdCents = 1_000) {
  return db.product.create({ data: { slug, titleEn: "Product", priceUsdCents } });
}

describe("database constraints", () => {
  it("generates time-ordered uuidv7 primary keys", async () => {
    const first = await createProduct(`first-${Date.now()}`);
    const second = await createProduct(`second-${Date.now()}`);
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(second.id > first.id).toBe(true);
  });

  it("rejects negative prices and products without any title", async () => {
    await expect(createProduct(`negative-${Date.now()}`, -1)).rejects.toThrow();
    await expect(
      db.product.create({ data: { slug: `untitled-${Date.now()}`, priceUsdCents: 0 } }),
    ).rejects.toThrow();
  });

  it("numbers orders from 100001 and keeps their totals consistent", async () => {
    const customer = await createCustomer(db);
    const base = {
      userId: customer.id,
      customerEmailSnapshot: customer.email,
      subtotalUsdCents: 1_000,
      discountUsdCents: 200,
      chargedCurrency: "USD" as const,
      chargedAmountMinor: 800,
      exchangeRateUsed: "3.75",
      locale: "en" as const,
      provider: "fake" as const,
    };
    const order = await db.order.create({ data: { ...base, totalUsdCents: 800 } });
    expect(order.orderNumber).toBeGreaterThanOrEqual(100_001);

    await expect(db.order.create({ data: { ...base, totalUsdCents: 900 } })).rejects.toThrow();
    // Only zero-total orders may skip the payment gateway.
    await expect(
      db.order.create({ data: { ...base, provider: null, totalUsdCents: 800 } }),
    ).rejects.toThrow();
  });

  it("keeps orders when a customer account is deleted", async () => {
    const customer = await createCustomer(db, { email: uniqueEmail("deleted") });
    const order = await db.order.create({
      data: {
        userId: customer.id,
        customerEmailSnapshot: customer.email,
        subtotalUsdCents: 0,
        totalUsdCents: 0,
        chargedCurrency: "USD",
        chargedAmountMinor: 0,
        exchangeRateUsed: "3.75",
        locale: "ar",
      },
    });

    await db.user.delete({ where: { id: customer.id } });
    const kept = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(kept.userId).toBeNull();
    expect(kept.customerEmailSnapshot).toBe(customer.email);
  });

  it("validates coupon values and stores codes upper-case", async () => {
    await expect(
      db.coupon.create({ data: { code: "TOOMUCH", type: "percent", value: 101 } }),
    ).rejects.toThrow();
    await expect(
      db.coupon.create({ data: { code: "lower", type: "fixed", value: 500 } }),
    ).rejects.toThrow();
    await expect(
      db.coupon.create({ data: { code: `WELCOME${Date.now()}`, type: "percent", value: 10 } }),
    ).resolves.toBeTruthy();
  });

  it("allows one active single-use redemption per customer and coupon", async () => {
    const customer = await createCustomer(db);
    const coupon = await db.coupon.create({
      data: { code: `ONCE${Date.now()}`, type: "percent", value: 10 },
    });
    const newOrder = () =>
      db.order.create({
        data: {
          userId: customer.id,
          customerEmailSnapshot: customer.email,
          subtotalUsdCents: 1_000,
          discountUsdCents: 100,
          totalUsdCents: 900,
          chargedCurrency: "USD",
          chargedAmountMinor: 900,
          exchangeRateUsed: "3.75",
          locale: "en",
          provider: "fake",
          couponId: coupon.id,
        },
      });
    const redemption = (orderId: string) => ({
      couponId: coupon.id,
      userId: customer.id,
      orderId,
      singleUse: true,
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const first = await newOrder();
    await db.couponRedemption.create({ data: redemption(first.id) });
    const second = await newOrder();
    await expect(db.couponRedemption.create({ data: redemption(second.id) })).rejects.toThrow();

    // Releasing the first reservation frees the customer to use the coupon again.
    await db.couponRedemption.update({
      where: { orderId: first.id },
      data: { status: "released" },
    });
    await expect(db.couponRedemption.create({ data: redemption(second.id) })).resolves.toBeTruthy();
  });
});
