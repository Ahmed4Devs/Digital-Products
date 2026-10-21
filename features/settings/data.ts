import type { PrismaClient } from "@/generated/prisma/client";

/** Store settings the storefront needs. Plain strings, never Prisma Decimals. */
export type PublicStoreSettings = {
  storeNameAr: string;
  storeNameEn: string;
  /** Storage keys in the public bucket; null when the owner has not uploaded one. */
  logoLightKey: string | null;
  logoDarkKey: string | null;
  /** USD → SAR rate as a decimal string with six decimals (see lib/money). */
  usdToSarRate: string;
};

export const DEFAULT_USD_TO_SAR_RATE = "3.750000";

export async function findPublicStoreSettings(db: PrismaClient): Promise<PublicStoreSettings> {
  const settings = await db.storeSetting.findUnique({
    where: { id: 1 },
    select: {
      storeNameAr: true,
      storeNameEn: true,
      logoLightKey: true,
      logoDarkKey: true,
      usdToSarRate: true,
    },
  });
  // Before `pnpm db:seed` there is no row; fall back to the schema defaults.
  if (!settings) {
    return {
      storeNameAr: "",
      storeNameEn: "",
      logoLightKey: null,
      logoDarkKey: null,
      usdToSarRate: DEFAULT_USD_TO_SAR_RATE,
    };
  }
  return { ...settings, usdToSarRate: settings.usdToSarRate.toFixed(6) };
}

/** Everything the owner's settings page edits. */
export async function findAdminSettings(db: PrismaClient) {
  const settings = await db.storeSetting.findUnique({ where: { id: 1 } });
  return {
    storeNameAr: settings?.storeNameAr ?? "",
    storeNameEn: settings?.storeNameEn ?? "",
    supportEmail: settings?.supportEmail ?? "",
    taxEnabled: settings?.taxEnabled ?? false,
    taxRate: basisPointsToPercent(settings?.taxRateBasisPoints ?? 0),
    vatNumber: settings?.vatNumber ?? "",
    downloadsPerMinute: String(settings?.downloadsPerMinute ?? 5),
    pendingOrderTtlMinutes: String(settings?.pendingOrderTtlMinutes ?? 60),
    logoLightKey: settings?.logoLightKey ?? null,
    logoDarkKey: settings?.logoDarkKey ?? null,
    legal: {
      terms: { ar: settings?.termsAr ?? "", en: settings?.termsEn ?? "" },
      privacy: { ar: settings?.privacyAr ?? "", en: settings?.privacyEn ?? "" },
      refundPolicy: { ar: settings?.refundPolicyAr ?? "", en: settings?.refundPolicyEn ?? "" },
      about: { ar: settings?.aboutAr ?? "", en: settings?.aboutEn ?? "" },
      contact: { ar: settings?.contactAr ?? "", en: settings?.contactEn ?? "" },
    },
  };
}

/** 1500 → "15", 750 → "7.5": the form's percent field. */
export function basisPointsToPercent(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
