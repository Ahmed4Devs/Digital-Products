import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

type PaidOrderOptions = {
  user: { id: string; email: string };
  products: { id: string; titleAr: string; titleEn: string; priceUsdCents: number }[];
  provider?: "fake" | "moyasar" | "paddle" | "paypal" | null;
  status?: "paid" | "pending" | "refunded";
  paidAt?: Date;
  createdAt?: Date;
  couponOvershoot?: boolean;
};

/** An order as fulfilment leaves it: paid, with one active entitlement per item. */
export async function createPaidOrder(db: PrismaClient, options: PaidOrderOptions) {
  const status = options.status ?? "paid";
  const total = options.products.reduce((sum, product) => sum + product.priceUsdCents, 0);
  const provider = total === 0 ? null : (options.provider ?? "fake");
  const paidAt = status === "pending" ? null : (options.paidAt ?? new Date());
  const order = await db.order.create({
    data: {
      userId: options.user.id,
      customerEmailSnapshot: options.user.email,
      status,
      subtotalUsdCents: total,
      totalUsdCents: total,
      chargedCurrency: "USD",
      chargedAmountMinor: total,
      exchangeRateUsed: "3.75",
      locale: "en",
      provider,
      providerReference: provider ? `ref_${randomUUID()}` : null,
      providerPaymentId: provider ? `pay_${randomUUID()}` : null,
      paidAt,
      couponOvershoot: options.couponOvershoot ?? false,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      items: {
        create: options.products.map((product) => ({
          productId: product.id,
          titleAr: product.titleAr,
          titleEn: product.titleEn,
          unitPriceUsdCents: product.priceUsdCents,
          unitChargedMinor: product.priceUsdCents,
        })),
      },
    },
    include: { items: true },
  });
  if (status === "paid") {
    for (const item of order.items) {
      await db.entitlement.upsert({
        where: { userId_productId: { userId: options.user.id, productId: item.productId } },
        create: { userId: options.user.id, productId: item.productId, orderItemId: item.id },
        update: { orderItemId: item.id, revokedAt: null },
      });
    }
  }
  return order;
}
