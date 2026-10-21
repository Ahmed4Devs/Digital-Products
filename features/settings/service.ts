import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import type { GatewaySettings } from "./schemas";

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
