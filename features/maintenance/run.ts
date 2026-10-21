import type { PrismaClient } from "@/generated/prisma/client";
import { closeOrder } from "@/features/checkout/fulfilment";
import { releaseCoupon } from "@/features/checkout/coupons";
import { deleteStaleRateLimitBuckets } from "@/lib/rate-limit";
import type { Storage } from "@/lib/storage/client";
import { PENDING_PREFIX, PENDING_UPLOAD_MAX_AGE_MS } from "@/lib/storage/policy";

// The daily maintenance task (spec §17.5 §10), run as `pnpm maintenance:run` inside the
// app container. Idempotent: running it twice in a row changes nothing the second time.

/** Rate-limit windows are at most an hour; a day-old bucket can never matter again. */
const RATE_LIMIT_BUCKET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MaintenanceReport = {
  expiredOrders: number;
  releasedReservations: number;
  deletedVerifications: number;
  deletedRateLimitBuckets: number;
  deletedPendingUploads: number;
};

export async function runMaintenance(
  db: PrismaClient,
  storage: Pick<Storage, "listOlderThan" | "delete">,
  now: Date = new Date(),
): Promise<MaintenanceReport> {
  const settings = await db.storeSetting.findUnique({
    where: { id: 1 },
    select: { pendingOrderTtlMinutes: true },
  });
  const ttlMinutes = settings?.pendingOrderTtlMinutes ?? 60;

  // 1. Stale pending orders expire and give their coupon reservations back. A payment
  //    that still arrives later is honoured by the webhook (spec §17.5 §9).
  const stale = await db.order.findMany({
    where: { status: "pending", createdAt: { lt: new Date(now.getTime() - ttlMinutes * 60_000) } },
    select: { id: true },
  });
  let expiredOrders = 0;
  for (const { id } of stale) {
    const changed = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (locked[0]?.status !== "pending") return false;
      await closeOrder(tx, id, "expired");
      return true;
    });
    if (changed) expiredOrders += 1;
  }

  // 2. Reservations past their expiry whose order is no longer pending (defensive: the
  //    step above normally releases them with their order).
  const orphaned = await db.couponRedemption.findMany({
    where: { status: "reserved", expiresAt: { lt: now }, order: { status: { not: "pending" } } },
    select: { orderId: true },
  });
  for (const { orderId } of orphaned) {
    await db.$transaction((tx) => releaseCoupon(tx, orderId));
  }

  // 3. Expired verification, reset and magic-link tokens.
  const { count: deletedVerifications } = await db.verification.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  // 4. Rate-limit buckets nobody can hit any more.
  const deletedRateLimitBuckets = await deleteStaleRateLimitBuckets(
    db,
    new Date(now.getTime() - RATE_LIMIT_BUCKET_MAX_AGE_MS),
  );

  // 5. Uploads that were never confirmed (§17.5 §8).
  const pending = await storage.listOlderThan(
    PENDING_PREFIX,
    new Date(now.getTime() - PENDING_UPLOAD_MAX_AGE_MS),
  );
  for (const key of pending) await storage.delete("private", key);

  return {
    expiredOrders,
    releasedReservations: orphaned.length,
    deletedVerifications,
    deletedRateLimitBuckets,
    deletedPendingUploads: pending.length,
  };
}
