import type { PrismaClient } from "@/generated/prisma/client";

/** Store settings the storefront needs. Plain strings, never Prisma Decimals. */
export type PublicStoreSettings = {
  storeNameAr: string;
  storeNameEn: string;
  /** USD → SAR rate as a decimal string with six decimals (see lib/money). */
  usdToSarRate: string;
};

export const DEFAULT_USD_TO_SAR_RATE = "3.750000";

export async function findPublicStoreSettings(db: PrismaClient): Promise<PublicStoreSettings> {
  const settings = await db.storeSetting.findUnique({
    where: { id: 1 },
    select: { storeNameAr: true, storeNameEn: true, usdToSarRate: true },
  });
  // Before `pnpm db:seed` there is no row; fall back to the schema defaults.
  if (!settings) return { storeNameAr: "", storeNameEn: "", usdToSarRate: DEFAULT_USD_TO_SAR_RATE };
  return { ...settings, usdToSarRate: settings.usdToSarRate.toFixed(6) };
}
