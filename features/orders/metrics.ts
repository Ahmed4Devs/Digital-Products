import type { PrismaClient } from "@/generated/prisma/client";
import { TIME_ZONE } from "@/i18n/formats";
import { riyadhDayStart } from "./admin-data";

// Overview metrics (spec §11): sales are paid orders by the time they were paid, in USD
// (every order keeps its USD total whatever currency was charged), and "today" is the
// store's calendar day in Riyadh. Refunded orders leave the figures.

const DAY_MS = 86_400_000;
export const SALES_WINDOW_DAYS = 30;
export const TOP_PRODUCTS = 5;
export const RECENT_ORDERS = 5;

/** The store's calendar date (YYYY-MM-DD) at an instant. */
export function storeDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function findOverviewMetrics(db: PrismaClient, now: Date = new Date()) {
  const todayStart = riyadhDayStart(storeDay(now));
  const windowStart = new Date(todayStart.getTime() - (SALES_WINDOW_DAYS - 1) * DAY_MS);
  const paidSince = (since: Date) => ({
    status: "paid" as const,
    paidAt: { gte: since, lte: now },
  });

  const [today, window, pending, overshoot, published, drafts, top, recent] = await Promise.all([
    db.order.aggregate({
      where: paidSince(todayStart),
      _sum: { totalUsdCents: true },
      _count: true,
    }),
    db.order.aggregate({
      where: paidSince(windowStart),
      _sum: { totalUsdCents: true },
      _count: true,
    }),
    db.order.count({ where: { status: "pending" } }),
    db.order.count({ where: { couponOvershoot: true } }),
    db.product.count({ where: { status: "published" } }),
    db.product.count({ where: { status: "draft" } }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: { order: paidSince(windowStart) },
      _count: { _all: true },
      orderBy: [{ _count: { productId: "desc" } }, { productId: "asc" }],
      take: TOP_PRODUCTS,
    }),
    db.order.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_ORDERS,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        customerEmailSnapshot: true,
        chargedAmountMinor: true,
        chargedCurrency: true,
      },
    }),
  ]);

  const products = await db.product.findMany({
    where: { id: { in: top.map((row) => row.productId) } },
    select: { id: true, titleAr: true, titleEn: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return {
    today: { salesUsdCents: today._sum.totalUsdCents ?? 0, orders: today._count },
    window: { salesUsdCents: window._sum.totalUsdCents ?? 0, orders: window._count },
    pendingOrders: pending,
    overshootOrders: overshoot,
    products: { published, drafts },
    topProducts: top.map((row) => ({
      productId: row.productId,
      titleAr: byId.get(row.productId)?.titleAr ?? "",
      titleEn: byId.get(row.productId)?.titleEn ?? "",
      sold: row._count._all,
    })),
    recentOrders: recent,
  };
}
