import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import type { CouponTerms } from "@/lib/money/order";

// Coupon checks and the reservation lifecycle (spec §17.5 §9):
// reserve at order creation → redeem at fulfilment → release on failure or expiry.
// A paid order is never rejected over coupon limits: a missing or released reservation
// is redeemed anyway and the overshoot is flagged on the order for the owner.

type Tx = Prisma.TransactionClient;

export const COUPON_CODE_MAX = 40;
const CODE_PATTERN = /^[A-Z0-9_-]+$/;

/** Codes are stored upper-case and matched case-insensitively; null when not a code. */
export function normalizeCouponCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > COUPON_CODE_MAX || !CODE_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export type UsableCoupon = {
  id: string;
  code: string;
  terms: CouponTerms;
  allowMultiplePerCustomer: boolean;
};

/** A coupon this customer may use on this subtotal right now, or the reason not. */
export async function findUsableCoupon(
  tx: Tx,
  code: string,
  options: { userId: string; subtotalUsdCents: number; now: Date },
): Promise<UsableCoupon> {
  const normalized = normalizeCouponCode(code);
  const coupon = normalized ? await tx.coupon.findUnique({ where: { code: normalized } }) : null;
  if (!coupon || !coupon.active) throw new ActionError("couponInvalid", "couponCode");
  if (coupon.startsAt && coupon.startsAt > options.now)
    throw new ActionError("couponInvalid", "couponCode");
  if (coupon.endsAt && coupon.endsAt <= options.now)
    throw new ActionError("couponExpired", "couponCode");
  if (
    coupon.minSubtotalUsdCents !== null &&
    options.subtotalUsdCents < coupon.minSubtotalUsdCents
  ) {
    throw new ActionError("couponMinimum", "couponCode");
  }
  if (coupon.usageLimit !== null && coupon.usedCount + coupon.reservedCount >= coupon.usageLimit) {
    throw new ActionError("couponExhausted", "couponCode");
  }
  if (!coupon.allowMultiplePerCustomer) {
    const active = await tx.couponRedemption.count({
      where: {
        couponId: coupon.id,
        userId: options.userId,
        status: { in: ["reserved", "redeemed"] },
      },
    });
    if (active > 0) throw new ActionError("couponAlreadyUsed", "couponCode");
  }
  return {
    id: coupon.id,
    code: coupon.code,
    terms: { type: coupon.type, value: coupon.value },
    allowMultiplePerCustomer: coupon.allowMultiplePerCustomer,
  };
}

/**
 * Reserves one use inside the order transaction. The counter update is conditional, so
 * concurrent checkouts can never exceed the limit; the partial unique index is the
 * backstop for one active use per customer.
 */
export async function reserveCoupon(
  tx: Tx,
  coupon: UsableCoupon,
  options: { orderId: string; userId: string; expiresAt: Date },
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "coupons" SET "reserved_count" = "reserved_count" + 1, "updated_at" = now()
    WHERE "id" = ${coupon.id}::uuid AND "active"
      AND ("usage_limit" IS NULL OR "used_count" + "reserved_count" < "usage_limit")`;
  if (updated !== 1) throw new ActionError("couponExhausted", "couponCode");
  await tx.couponRedemption.create({
    data: {
      couponId: coupon.id,
      userId: options.userId,
      orderId: options.orderId,
      status: "reserved",
      singleUse: !coupon.allowMultiplePerCustomer,
      expiresAt: options.expiresAt,
    },
  });
}

/** Turns the order's reservation into a use; returns true when it overshot the limits. */
export async function redeemCoupon(
  tx: Tx,
  order: { id: string; couponId: string | null; userId: string | null },
): Promise<boolean> {
  if (!order.couponId) return false;
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId: order.id } });

  if (redemption?.status === "reserved") {
    await tx.couponRedemption.update({
      where: { id: redemption.id },
      data: { status: "redeemed" },
    });
    await tx.$executeRaw`
      UPDATE "coupons" SET "used_count" = "used_count" + 1,
        "reserved_count" = GREATEST("reserved_count" - 1, 0), "updated_at" = now()
      WHERE "id" = ${order.couponId}::uuid`;
    return false;
  }
  if (redemption?.status === "redeemed") return false;

  // Released (expired) or missing: honour the payment and flag the overshoot.
  await tx.$executeRaw`
    UPDATE "coupons" SET "used_count" = "used_count" + 1, "updated_at" = now()
    WHERE "id" = ${order.couponId}::uuid`;
  if (redemption) {
    const clash =
      redemption.singleUse && order.userId
        ? await tx.couponRedemption.count({
            where: {
              couponId: order.couponId,
              userId: order.userId,
              singleUse: true,
              status: { in: ["reserved", "redeemed"] },
              id: { not: redemption.id },
            },
          })
        : 0;
    // Recording it as redeemed would violate the one-active-use index; keep it released.
    if (clash === 0) {
      await tx.couponRedemption.update({
        where: { id: redemption.id },
        data: { status: "redeemed" },
      });
    }
  }
  return true;
}

/** Gives a reserved use back (failed or expired order). Idempotent. */
export async function releaseCoupon(tx: Tx, orderId: string): Promise<void> {
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (redemption?.status !== "reserved") return;
  await tx.couponRedemption.update({ where: { id: redemption.id }, data: { status: "released" } });
  await tx.$executeRaw`
    UPDATE "coupons" SET "reserved_count" = GREATEST("reserved_count" - 1, 0), "updated_at" = now()
    WHERE "id" = ${redemption.couponId}::uuid`;
}
