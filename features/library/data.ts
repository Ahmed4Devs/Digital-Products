import type { PrismaClient } from "@/generated/prisma/client";

// My Purchases (spec §10.4): every product the customer currently owns, with the
// current version of each of its files.

export async function findLibrary(db: PrismaClient, userId: string) {
  const entitlements = await db.entitlement.findMany({
    where: { userId, revokedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      orderItem: { select: { order: { select: { paidAt: true } } } },
      downloadLogs: { select: { fileId: true }, distinct: ["fileId"] },
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
          files: {
            where: { supersededAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, fileName: true, sizeBytes: true, version: true, createdAt: true },
          },
        },
      },
    },
  });

  return entitlements.map(({ product, orderItem, downloadLogs, ...entitlement }) => {
    const downloaded = new Set(downloadLogs.map((log) => log.fileId));
    return {
      ...entitlement,
      purchasedAt: orderItem?.order.paidAt ?? entitlement.updatedAt,
      product: {
        id: product.id,
        slug: product.slug,
        titleAr: product.titleAr,
        titleEn: product.titleEn,
        cover: product.images[0] ?? null,
      },
      files: product.files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        sizeBytes: Number(file.sizeBytes),
        version: file.version,
        // A newer version uploaded after the purchase that the customer has not
        // downloaded yet (spec §10.4 "Updated" badge).
        updated:
          file.version > 1 && file.createdAt > entitlement.createdAt && !downloaded.has(file.id),
      })),
    };
  });
}

export type LibraryEntry = Awaited<ReturnType<typeof findLibrary>>[number];

/** The customer's orders, newest first, with their item snapshots (spec §8.1). */
export async function findCustomerOrders(db: PrismaClient, userId: string, take = 50) {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      paidAt: true,
      refundedAt: true,
      subtotalUsdCents: true,
      discountUsdCents: true,
      taxUsdCents: true,
      totalUsdCents: true,
      chargedCurrency: true,
      chargedAmountMinor: true,
      provider: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: { id: true, titleAr: true, titleEn: true, unitPriceUsdCents: true },
      },
    },
  });
}
