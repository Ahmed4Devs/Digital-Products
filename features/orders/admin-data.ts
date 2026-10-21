import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Owner reads for orders (spec §11): filters by status and date, details with payment
// events and the access each item granted. Pages call requireOwner() first.

export const ADMIN_ORDER_STATUSES = [
  "all",
  "pending",
  "paid",
  "failed",
  "refunded",
  "expired",
] as const;
export const ADMIN_ORDERS_PAGE_SIZE = 20;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const date = z.preprocess(
  firstValue,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .catch(""),
);

export const adminOrderSearchSchema = z.object({
  status: z.preprocess(firstValue, z.enum(ADMIN_ORDER_STATUSES).catch("all")),
  q: z.preprocess(firstValue, z.string().trim().max(120).catch("")),
  from: date,
  to: date,
  overshoot: z.preprocess(firstValue, z.literal("1").optional().catch(undefined)),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000).catch(1)),
});

export type AdminOrderSearch = z.infer<typeof adminOrderSearchSchema>;

export function parseAdminOrderSearch(params: Record<string, unknown>): AdminOrderSearch {
  return adminOrderSearchSchema.parse({
    status: params.status ?? "all",
    q: params.q ?? "",
    from: params.from ?? "",
    to: params.to ?? "",
    overshoot: params.overshoot,
    page: params.page ?? 1,
  });
}

export function adminOrderSearchQuery(search: Partial<AdminOrderSearch>): Record<string, string> {
  const query: Record<string, string> = {};
  if (search.status && search.status !== "all") query.status = search.status;
  if (search.q) query.q = search.q;
  if (search.from) query.from = search.from;
  if (search.to) query.to = search.to;
  if (search.overshoot) query.overshoot = "1";
  if (search.page && search.page > 1) query.page = String(search.page);
  return query;
}

/** Midnight in the store's time zone (Asia/Riyadh, UTC+3 all year) as an instant. */
export function riyadhDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export async function findAdminOrders(db: PrismaClient, search: AdminOrderSearch) {
  const where: Prisma.OrderWhereInput = {};
  if (search.status !== "all") where.status = search.status;
  if (search.overshoot) where.couponOvershoot = true;
  if (search.from || search.to) {
    where.createdAt = {
      ...(search.from ? { gte: riyadhDayStart(search.from) } : {}),
      ...(search.to ? { lt: new Date(riyadhDayStart(search.to).getTime() + 86_400_000) } : {}),
    };
  }
  if (search.q) {
    const number = /^\d{1,9}$/.test(search.q) ? Number(search.q) : null;
    where.OR = [
      { customerEmailSnapshot: { contains: search.q, mode: "insensitive" } },
      ...(number !== null ? [{ orderNumber: number }] : []),
    ];
  }
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (search.page - 1) * ADMIN_ORDERS_PAGE_SIZE,
      take: ADMIN_ORDERS_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        customerEmailSnapshot: true,
        totalUsdCents: true,
        chargedCurrency: true,
        chargedAmountMinor: true,
        provider: true,
        couponOvershoot: true,
        _count: { select: { items: true } },
      },
    }),
  ]);
  return { total, pageCount: Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE)), orders };
}

export async function findAdminOrder(db: PrismaClient, id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      coupon: { select: { id: true, code: true } },
      redemption: { select: { status: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { entitlements: { select: { id: true, revokedAt: true, downloadCount: true } } },
      },
      paymentEvents: {
        orderBy: { createdAt: "asc" },
        select: { id: true, providerEventId: true, type: true, outcome: true, createdAt: true },
      },
    },
  });
  if (!order) return null;
  // The access an item granted is the entitlement still pointing at it.
  return {
    ...order,
    exchangeRateUsed: order.exchangeRateUsed.toFixed(6),
    items: order.items.map(({ entitlements, ...item }) => ({
      ...item,
      entitlement: entitlements[0] ?? null,
    })),
  };
}

export type AdminOrder = NonNullable<Awaited<ReturnType<typeof findAdminOrder>>>;
