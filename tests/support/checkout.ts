import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

/** A published product with a unique slug. */
export async function createProduct(
  db: PrismaClient,
  data: { priceUsdCents: number; fixedPriceSarHalalas?: number | null; titleEn?: string } = {
    priceUsdCents: 1500,
  },
) {
  const suffix = randomUUID().slice(0, 8);
  return db.product.create({
    data: {
      slug: `checkout-${suffix}`,
      titleAr: `منتج ${suffix}`,
      titleEn: data.titleEn ?? `Checkout product ${suffix}`,
      priceUsdCents: data.priceUsdCents,
      fixedPriceSarHalalas: data.fixedPriceSarHalalas ?? null,
      status: "published",
      publishedAt: new Date(),
    },
  });
}

/** Store settings with every gateway enabled and a known rate. */
export async function enableGateways(
  db: PrismaClient,
  overrides: { taxEnabled?: boolean; taxRateBasisPoints?: number } = {},
) {
  await db.storeSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      storeNameAr: "المتجر",
      storeNameEn: "Store",
      moyasarEnabled: true,
      paddleEnabled: true,
      paypalEnabled: true,
      ...overrides,
    },
    update: {
      usdToSarRate: "3.75",
      moyasarEnabled: true,
      paddleEnabled: true,
      paypalEnabled: true,
      taxEnabled: overrides.taxEnabled ?? false,
      taxRateBasisPoints: overrides.taxRateBasisPoints ?? 0,
    },
  });
}

export async function createCoupon(
  db: PrismaClient,
  data: Partial<{
    type: "percent" | "fixed";
    value: number;
    usageLimit: number | null;
    allowMultiplePerCustomer: boolean;
    minSubtotalUsdCents: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
    active: boolean;
  }> = {},
) {
  return db.coupon.create({
    data: {
      code: `TEST${randomUUID().slice(0, 8).toUpperCase()}`,
      type: data.type ?? "percent",
      value: data.value ?? 10,
      usageLimit: data.usageLimit ?? null,
      allowMultiplePerCustomer: data.allowMultiplePerCustomer ?? false,
      minSubtotalUsdCents: data.minSubtotalUsdCents ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      active: data.active ?? true,
    },
  });
}
