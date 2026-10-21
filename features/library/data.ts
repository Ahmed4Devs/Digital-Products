import type { PrismaClient } from "@/generated/prisma/client";

// My Purchases (spec §10.4): every product the customer currently owns.

export async function findLibrary(db: PrismaClient, userId: string) {
  const entitlements = await db.entitlement.findMany({
    where: { userId, revokedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      orderItem: { select: { order: { select: { paidAt: true } } } },
      product: {
        select: {
          id: true,
          slug: true,
          titleAr: true,
          titleEn: true,
          images: {
            where: { kind: "cover" },
            take: 1,
            select: { storageKey: true, width: true, height: true, altAr: true, altEn: true },
          },
        },
      },
    },
  });
  return entitlements.map(({ product, orderItem, ...entitlement }) => ({
    ...entitlement,
    purchasedAt: orderItem?.order.paidAt ?? entitlement.updatedAt,
    product: { ...product, cover: product.images[0] ?? null },
  }));
}

export type LibraryEntry = Awaited<ReturnType<typeof findLibrary>>[number];
