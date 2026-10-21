import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { PaymentProvider, ProviderId } from "@/lib/payments/types";

// Reads for the cart and checkout. Everything is re-read from the database: the cart
// cookie only names products.

type Db = PrismaClient | Prisma.TransactionClient;

export type CheckoutSettings = {
  storeNameAr: string;
  storeNameEn: string;
  usdToSarRate: string;
  tax: { enabled: boolean; basisPoints: number };
  pendingOrderTtlMinutes: number;
  enabled: Record<"moyasar" | "paddle" | "paypal", boolean>;
};

export async function findCheckoutSettings(db: Db): Promise<CheckoutSettings> {
  const settings = await db.storeSetting.findUnique({ where: { id: 1 } });
  return {
    storeNameAr: settings?.storeNameAr ?? "",
    storeNameEn: settings?.storeNameEn ?? "",
    usdToSarRate: settings ? settings.usdToSarRate.toFixed(6) : "3.750000",
    tax: { enabled: settings?.taxEnabled ?? false, basisPoints: settings?.taxRateBasisPoints ?? 0 },
    pendingOrderTtlMinutes: settings?.pendingOrderTtlMinutes ?? 60,
    enabled: {
      moyasar: settings?.moyasarEnabled ?? false,
      paddle: settings?.paddleEnabled ?? false,
      paypal: settings?.paypalEnabled ?? false,
    },
  };
}

const PROVIDER_ORDER: ProviderId[] = ["moyasar", "paddle", "paypal", "fake"];

/** Gateways offered at checkout: configured and enabled by the owner (fake: tests only). */
export function availableProviders(
  configured: Map<ProviderId, PaymentProvider>,
  settings: CheckoutSettings,
): PaymentProvider[] {
  return PROVIDER_ORDER.filter(
    (id) => configured.has(id) && (id === "fake" || settings.enabled[id]),
  ).map((id) => configured.get(id)!);
}

export type CheckoutItem = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  priceUsdCents: number;
  fixedPriceSarHalalas: number | null;
};

/**
 * The cart's products that can be bought: published, and not already owned by this
 * customer (an active, non-revoked entitlement, spec §17.5 §4). Cart order is kept.
 */
export async function findCheckoutItems(
  db: Db,
  productIds: string[],
  userId: string | null,
): Promise<{ items: CheckoutItem[]; owned: CheckoutItem[]; unavailableIds: string[] }> {
  if (productIds.length === 0) return { items: [], owned: [], unavailableIds: [] };
  const [products, entitlements] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, status: "published" },
      select: {
        id: true,
        slug: true,
        titleAr: true,
        titleEn: true,
        priceUsdCents: true,
        fixedPriceSarHalalas: true,
      },
    }),
    userId
      ? db.entitlement.findMany({
          where: { userId, productId: { in: productIds }, revokedAt: null },
          select: { productId: true },
        })
      : [],
  ]);
  const byId = new Map(products.map((product) => [product.id, product]));
  const ownedIds = new Set(entitlements.map((entitlement) => entitlement.productId));
  const items: CheckoutItem[] = [];
  const owned: CheckoutItem[] = [];
  const unavailableIds: string[] = [];
  for (const id of productIds) {
    const product = byId.get(id);
    if (!product) unavailableIds.push(id);
    else if (ownedIds.has(id)) owned.push(product);
    else items.push(product);
  }
  return { items, owned, unavailableIds };
}
