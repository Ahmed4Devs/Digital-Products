import type { Prisma } from "@/generated/prisma/client";
import { redeemCoupon, releaseCoupon } from "./coupons";

// What happens to an order's records when its payment settles (spec §10.1 step 9,
// §17.5 §4, §17.5 §6). Each function runs inside the caller's transaction, after the
// order row has been locked.

type Tx = Prisma.TransactionClient;

/** Locks the order row for the rest of the transaction (concurrent webhooks queue up). */
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  return tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
}

export type FulfilmentDetails = {
  providerPaymentId?: string | null;
  /** Paddle: what was really charged and the tax it collected (§17.5 §3). */
  chargedAmountMinor?: number;
  providerTaxMinor?: number | null;
  providerTaxMode?: "internal" | "external" | null;
};

/**
 * Marks the order paid, grants every product with an upsert on (user, product) — a
 * refunded product can be bought again — and redeems the coupon.
 */
export async function fulfilOrder(
  tx: Tx,
  order: Prisma.OrderGetPayload<{ include: { items: true } }>,
  details: FulfilmentDetails = {},
  now: Date = new Date(),
): Promise<void> {
  const overshoot = await redeemCoupon(tx, order);
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: "paid",
      paidAt: now,
      couponOvershoot: overshoot || order.couponOvershoot,
      providerPaymentId: details.providerPaymentId ?? order.providerPaymentId,
      ...(details.chargedAmountMinor !== undefined
        ? { chargedAmountMinor: details.chargedAmountMinor }
        : {}),
      ...(details.providerTaxMinor !== undefined
        ? { providerTaxMinor: details.providerTaxMinor }
        : {}),
      ...(details.providerTaxMode !== undefined
        ? { providerTaxMode: details.providerTaxMode }
        : {}),
    },
  });
  // An order whose customer deleted their account keeps its records but grants nothing.
  if (!order.userId) return;
  for (const item of order.items) {
    await tx.entitlement.upsert({
      where: { userId_productId: { userId: order.userId, productId: item.productId } },
      create: { userId: order.userId, productId: item.productId, orderItemId: item.id },
      update: { revokedAt: null, orderItemId: item.id },
    });
  }
}

/**
 * Records a refund: the order becomes refunded and the access it granted is revoked.
 * Entitlements are kept (revokedAt), and only those still granted by this order: a
 * product bought again later stays available.
 */
export async function recordRefund(
  tx: Tx,
  order: Prisma.OrderGetPayload<{ include: { items: true } }>,
  now: Date = new Date(),
): Promise<void> {
  await tx.order.update({ where: { id: order.id }, data: { status: "refunded", refundedAt: now } });
  await tx.entitlement.updateMany({
    where: { orderItemId: { in: order.items.map((item) => item.id) }, revokedAt: null },
    data: { revokedAt: now },
  });
}

/** Ends a pending order without payment and gives its coupon reservation back. */
export async function closeOrder(
  tx: Tx,
  orderId: string,
  status: "failed" | "expired",
): Promise<void> {
  await tx.order.update({ where: { id: orderId }, data: { status } });
  await releaseCoupon(tx, orderId);
}
