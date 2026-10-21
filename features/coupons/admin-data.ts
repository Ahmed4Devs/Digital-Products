import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Owner reads for coupons (spec §11): the list with usage, and one coupon with its
// redemptions. Pages call requireOwner() first.

export const ADMIN_COUPON_STATUSES = ["all", "active", "inactive"] as const;
export const ADMIN_COUPONS_PAGE_SIZE = 20;
const REDEMPTIONS_SHOWN = 100;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const adminCouponSearchSchema = z.object({
  status: z.preprocess(firstValue, z.enum(ADMIN_COUPON_STATUSES).catch("all")),
  q: z.preprocess(firstValue, z.string().trim().max(40).catch("")),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000).catch(1)),
});

export type AdminCouponSearch = z.infer<typeof adminCouponSearchSchema>;

export function parseAdminCouponSearch(params: Record<string, unknown>): AdminCouponSearch {
  return adminCouponSearchSchema.parse({
    status: params.status ?? "all",
    q: params.q ?? "",
    page: params.page ?? 1,
  });
}

export function adminCouponSearchQuery(search: Partial<AdminCouponSearch>): Record<string, string> {
  const query: Record<string, string> = {};
  if (search.status && search.status !== "all") query.status = search.status;
  if (search.q) query.q = search.q;
  if (search.page && search.page > 1) query.page = String(search.page);
  return query;
}

export type CouponState = "active" | "inactive" | "scheduled" | "ended" | "exhausted";

/** What a customer would see right now when entering the code. */
export function couponState(
  coupon: {
    active: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    usageLimit: number | null;
    usedCount: number;
    reservedCount: number;
  },
  now: Date,
): CouponState {
  if (!coupon.active) return "inactive";
  if (coupon.endsAt && coupon.endsAt <= now) return "ended";
  if (coupon.startsAt && coupon.startsAt > now) return "scheduled";
  if (coupon.usageLimit !== null && coupon.usedCount + coupon.reservedCount >= coupon.usageLimit) {
    return "exhausted";
  }
  return "active";
}

export async function findAdminCoupons(db: PrismaClient, search: AdminCouponSearch) {
  const where: Prisma.CouponWhereInput = {};
  if (search.status !== "all") where.active = search.status === "active";
  if (search.q) where.code = { contains: search.q, mode: "insensitive" };
  const [total, coupons] = await Promise.all([
    db.coupon.count({ where }),
    db.coupon.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (search.page - 1) * ADMIN_COUPONS_PAGE_SIZE,
      take: ADMIN_COUPONS_PAGE_SIZE,
    }),
  ]);
  return { total, pageCount: Math.max(1, Math.ceil(total / ADMIN_COUPONS_PAGE_SIZE)), coupons };
}

export async function findAdminCoupon(db: PrismaClient, id: string) {
  const coupon = await db.coupon.findUnique({ where: { id } });
  if (!coupon) return null;
  const [redemptions, discount] = await Promise.all([
    db.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: REDEMPTIONS_SHOWN,
      select: {
        id: true,
        status: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customerEmailSnapshot: true,
            discountUsdCents: true,
          },
        },
      },
    }),
    db.order.aggregate({
      where: { couponId: id, status: "paid" },
      _sum: { discountUsdCents: true },
      _count: true,
    }),
  ]);
  return {
    coupon,
    redemptions,
    paidOrders: discount._count,
    discountGivenUsdCents: discount._sum.discountUsdCents ?? 0,
  };
}

/** Form values for editing: amounts in major units, dates in the store's time zone. */
export function couponFormDefaults(coupon: {
  type: "percent" | "fixed";
  value: number;
  minSubtotalUsdCents: number | null;
  usageLimit: number | null;
  allowMultiplePerCustomer: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}) {
  const major = (cents: number) => (cents / 100).toFixed(2);
  const local = (date: Date | null) =>
    date ? new Date(date.getTime() + 3 * 3_600_000).toISOString().slice(0, 16) : "";
  return {
    type: coupon.type,
    value: coupon.type === "percent" ? String(coupon.value) : major(coupon.value),
    minSubtotalUsd: coupon.minSubtotalUsdCents === null ? "" : major(coupon.minSubtotalUsdCents),
    usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
    allowMultiplePerCustomer: coupon.allowMultiplePerCustomer,
    startsAt: local(coupon.startsAt),
    endsAt: local(coupon.endsAt),
    active: coupon.active,
  };
}

export type CouponFormDefaults = ReturnType<typeof couponFormDefaults>;
