import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import type { CouponCreateValues, CouponUpdateValues } from "./schemas";

// Owner writes for coupons (spec §11): create, edit and (de)activate. Coupons are never
// deleted: orders keep a reference to the coupon they used. Codes cannot change once
// created, so receipts and the audit log always name the same code.

const SNAPSHOT = {
  code: true,
  type: true,
  value: true,
  minSubtotalUsdCents: true,
  usageLimit: true,
  allowMultiplePerCustomer: true,
  startsAt: true,
  endsAt: true,
  active: true,
} as const;

function terms(input: CouponUpdateValues) {
  return {
    type: input.type,
    value: input.value,
    minSubtotalUsdCents: input.minSubtotalUsd,
    usageLimit: input.usageLimit,
    allowMultiplePerCustomer: input.allowMultiplePerCustomer,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
}

export async function createCoupon(
  db: PrismaClient,
  actorId: string,
  input: CouponCreateValues,
): Promise<{ id: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const { id, ...after } = await tx.coupon.create({
        data: { code: input.code, active: input.active, ...terms(input) },
        select: { id: true, ...SNAPSHOT },
      });
      await recordAudit(tx, {
        actorId,
        action: "coupon.create",
        entity: "coupon",
        entityId: id,
        after,
      });
      return { id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ActionError("couponCodeTaken", "code");
    }
    throw error;
  }
}

export async function updateCoupon(
  db: PrismaClient,
  actorId: string,
  id: string,
  input: CouponUpdateValues,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.coupon.findUnique({ where: { id }, select: SNAPSHOT });
    if (!before) throw new ActionError("notFound");
    const after = await tx.coupon.update({ where: { id }, data: terms(input), select: SNAPSHOT });
    await recordAudit(tx, {
      actorId,
      action: "coupon.update",
      entity: "coupon",
      entityId: id,
      before,
      after,
    });
  });
}

/** Reservations already held stay valid; new checkouts can no longer use the coupon. */
export async function setCouponActive(
  db: PrismaClient,
  actorId: string,
  id: string,
  active: boolean,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.coupon.findUnique({ where: { id }, select: { active: true } });
    if (!before) throw new ActionError("notFound");
    if (before.active === active) return;
    await tx.coupon.update({ where: { id }, data: { active } });
    await recordAudit(tx, {
      actorId,
      action: active ? "coupon.activate" : "coupon.deactivate",
      entity: "coupon",
      entityId: id,
      before,
      after: { active },
    });
  });
}
