import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Owner reads for customers (spec §11): the list, and one customer's purchases, access
// and orders. Pages call requireOwner() first. The owner account is never listed.

export const ADMIN_CUSTOMER_STATUSES = ["all", "active", "banned", "unverified"] as const;
export const ADMIN_CUSTOMERS_PAGE_SIZE = 20;
const RECENT_ORDERS = 50;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const adminCustomerSearchSchema = z.object({
  status: z.preprocess(firstValue, z.enum(ADMIN_CUSTOMER_STATUSES).catch("all")),
  q: z.preprocess(firstValue, z.string().trim().max(120).catch("")),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000).catch(1)),
});

export type AdminCustomerSearch = z.infer<typeof adminCustomerSearchSchema>;

export function parseAdminCustomerSearch(params: Record<string, unknown>): AdminCustomerSearch {
  return adminCustomerSearchSchema.parse({
    status: params.status ?? "all",
    q: params.q ?? "",
    page: params.page ?? 1,
  });
}

export function adminCustomerSearchQuery(
  search: Partial<AdminCustomerSearch>,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (search.status && search.status !== "all") query.status = search.status;
  if (search.q) query.q = search.q;
  if (search.page && search.page > 1) query.page = String(search.page);
  return query;
}

export async function findAdminCustomers(db: PrismaClient, search: AdminCustomerSearch) {
  const where: Prisma.UserWhereInput = { role: "customer" };
  if (search.status === "active") Object.assign(where, { banned: false, emailVerified: true });
  if (search.status === "banned") where.banned = true;
  if (search.status === "unverified") where.emailVerified = false;
  if (search.q) where.email = { contains: search.q, mode: "insensitive" };

  const [total, customers] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (search.page - 1) * ADMIN_CUSTOMERS_PAGE_SIZE,
      take: ADMIN_CUSTOMERS_PAGE_SIZE,
      select: {
        id: true,
        email: true,
        emailVerified: true,
        banned: true,
        createdAt: true,
        _count: {
          select: {
            orders: { where: { status: "paid" } },
            entitlements: { where: { revokedAt: null } },
          },
        },
      },
    }),
  ]);
  return { total, pageCount: Math.max(1, Math.ceil(total / ADMIN_CUSTOMERS_PAGE_SIZE)), customers };
}

export async function findAdminCustomer(db: PrismaClient, id: string) {
  const customer = await db.user.findFirst({
    where: { id, role: "customer" },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      banned: true,
      preferredLocale: true,
      createdAt: true,
      entitlements: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          revokedAt: true,
          downloadCount: true,
          createdAt: true,
          product: { select: { id: true, titleAr: true, titleEn: true } },
          orderItem: { select: { order: { select: { id: true, orderNumber: true } } } },
        },
      },
      orders: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RECENT_ORDERS,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          chargedAmountMinor: true,
          chargedCurrency: true,
        },
      },
    },
  });
  if (!customer) return null;
  const spent = await db.order.aggregate({
    where: { userId: id, status: "paid" },
    _sum: { totalUsdCents: true },
  });
  return { ...customer, spentUsdCents: spent._sum.totalUsdCents ?? 0 };
}

/** Products the owner can grant this customer: not drafts, not already accessible. */
export async function findGrantableProducts(db: PrismaClient, userId: string) {
  return db.product.findMany({
    where: {
      status: { in: ["published", "archived"] },
      entitlements: { none: { userId, revokedAt: null } },
    },
    orderBy: [{ status: "desc" }, { titleEn: "asc" }],
    take: 500,
    select: { id: true, titleAr: true, titleEn: true, status: true },
  });
}
