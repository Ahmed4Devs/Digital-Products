import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";

// Owner actions on customer accounts (spec §11): ban or unban, and grant or revoke a
// product outside any order. Every action is audited; the owner account is out of reach.

async function findCustomer(tx: Prisma.TransactionClient, userId: string) {
  const customer = await tx.user.findFirst({
    where: { id: userId, role: "customer" },
    select: { id: true, banned: true },
  });
  if (!customer) throw new ActionError("notFound");
  return customer;
}

/** Banning also ends every session, so the customer is signed out everywhere at once. */
export async function setCustomerBanned(
  db: PrismaClient,
  actorId: string,
  userId: string,
  banned: boolean,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const customer = await findCustomer(tx, userId);
    if (customer.banned === banned) return;
    await tx.user.update({ where: { id: userId }, data: { banned } });
    const sessions = banned ? await tx.session.deleteMany({ where: { userId } }) : { count: 0 };
    await recordAudit(tx, {
      actorId,
      action: banned ? "user.ban" : "user.unban",
      entity: "user",
      entityId: userId,
      before: { banned: customer.banned },
      after: { banned },
      details: banned ? { sessionsRevoked: sessions.count } : undefined,
    });
  });
}

export async function grantProduct(
  db: PrismaClient,
  actorId: string,
  userId: string,
  productId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await findCustomer(tx, userId);
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (!product || product.status === "draft")
      throw new ActionError("productUnavailable", "productId");
    const existing = await tx.entitlement.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { revokedAt: true },
    });
    if (existing && !existing.revokedAt) throw new ActionError("alreadyOwned", "productId");
    const entitlement = await tx.entitlement.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: { revokedAt: null },
      select: { id: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "entitlement.grant",
      entity: "entitlement",
      entityId: entitlement.id,
      details: { userId, productId },
    });
  });
}

export async function revokeEntitlement(
  db: PrismaClient,
  actorId: string,
  userId: string,
  entitlementId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await findCustomer(tx, userId);
    const revoked = await tx.entitlement.updateMany({
      where: { id: entitlementId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new ActionError("notFound");
    await recordAudit(tx, {
      actorId,
      action: "entitlement.revoke",
      entity: "entitlement",
      entityId: entitlementId,
      details: { userId },
    });
  });
}
