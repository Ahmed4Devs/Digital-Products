import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { ActionError } from "@/lib/actions";
import { sanitizeRichText } from "@/lib/rich-text/sanitize";
import {
  LEGAL_CONTENT_MAX,
  type GatewaySettings,
  type LegalPage,
  type LegalPageValues,
  type StoreSettingsValues,
} from "./schemas";

// Owner writes for the singleton StoreSetting row (id = 1).

/**
 * Sets the USD → SAR rate (a normalized six-decimal string). Past orders keep the rate
 * they were placed at (spec §9 snapshots); only new prices change.
 */
export async function updateExchangeRate(
  db: PrismaClient,
  actorId: string,
  usdToSarRate: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.storeSetting.findUnique({
      where: { id: 1 },
      select: { usdToSarRate: true },
    });
    const after = await tx.storeSetting.upsert({
      where: { id: 1 },
      update: { usdToSarRate },
      create: { id: 1, usdToSarRate },
      select: { usdToSarRate: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "settings.update",
      entity: "settings",
      entityId: "1",
      before: before ? { usdToSarRate: before.usdToSarRate.toFixed(6) } : null,
      after: { usdToSarRate: after.usdToSarRate.toFixed(6) },
    });
  });
}

/** Which configured gateways checkout offers (spec §11 settings). */
export async function updateGateways(
  db: PrismaClient,
  actorId: string,
  gateways: GatewaySettings,
): Promise<void> {
  const select = { moyasarEnabled: true, paddleEnabled: true, paypalEnabled: true } as const;
  await db.$transaction(async (tx) => {
    const before = await tx.storeSetting.findUnique({ where: { id: 1 }, select });
    const after = await tx.storeSetting.upsert({
      where: { id: 1 },
      update: gateways,
      create: { id: 1, ...gateways },
      select,
    });
    await recordAudit(tx, {
      actorId,
      action: "settings.update",
      entity: "settings",
      entityId: "1",
      before,
      after,
    });
  });
}

const STORE_FIELDS = {
  storeNameAr: true,
  storeNameEn: true,
  supportEmail: true,
  taxEnabled: true,
  taxRateBasisPoints: true,
  vatNumber: true,
  downloadsPerMinute: true,
  pendingOrderTtlMinutes: true,
} as const;

export async function updateStoreSettings(
  db: PrismaClient,
  actorId: string,
  input: StoreSettingsValues,
): Promise<void> {
  const data = {
    storeNameAr: input.storeNameAr,
    storeNameEn: input.storeNameEn,
    supportEmail: input.supportEmail,
    taxEnabled: input.taxEnabled,
    taxRateBasisPoints: input.taxRate,
    vatNumber: input.vatNumber,
    downloadsPerMinute: input.downloadsPerMinute,
    pendingOrderTtlMinutes: input.pendingOrderTtlMinutes,
  };
  await db.$transaction(async (tx) => {
    const before = await tx.storeSetting.findUnique({ where: { id: 1 }, select: STORE_FIELDS });
    const after = await tx.storeSetting.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
      select: STORE_FIELDS,
    });
    await recordAudit(tx, {
      actorId,
      action: "settings.update",
      entity: "settings",
      entityId: "1",
      before,
      after,
    });
  });
}

const LEGAL_COLUMNS = {
  terms: { ar: "termsAr", en: "termsEn" },
  privacy: { ar: "privacyAr", en: "privacyEn" },
  refundPolicy: { ar: "refundPolicyAr", en: "refundPolicyEn" },
  about: { ar: "aboutAr", en: "aboutEn" },
  contact: { ar: "contactAr", en: "contactEn" },
} as const satisfies Record<LegalPage, { ar: string; en: string }>;

/** Sanitized with the product allowlist (legal pages render on the store); "" when blank. */
function cleanLegalHtml(html: string, field: string): string {
  const clean = sanitizeRichText(html).trim();
  if (clean.length > LEGAL_CONTENT_MAX) throw new ActionError("tooLong", field);
  return clean.replace(/<[^>]*>/g, "").trim() ? clean : "";
}

export async function updateLegalPage(
  db: PrismaClient,
  actorId: string,
  input: LegalPageValues,
): Promise<void> {
  const columns = LEGAL_COLUMNS[input.page];
  const data = {
    [columns.ar]: cleanLegalHtml(input.contentAr, "contentAr"),
    [columns.en]: cleanLegalHtml(input.contentEn, "contentEn"),
  };
  const select = { [columns.ar]: true, [columns.en]: true };
  await db.$transaction(async (tx) => {
    const before = await tx.storeSetting.findUnique({ where: { id: 1 }, select });
    const after = await tx.storeSetting.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
      select,
    });
    await recordAudit(tx, {
      actorId,
      action: "settings.update",
      entity: "settings",
      entityId: "1",
      before,
      after,
    });
  });
}
