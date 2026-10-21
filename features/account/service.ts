import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";

/** Password checks from account settings, per account (shared by every action). */
export const ACCOUNT_PASSWORD_LIMIT = { windowSeconds: 15 * 60, max: 5 } as const;

/**
 * Deletes a customer account in one transaction (spec §17.5 §5): the user, their
 * sessions, credential accounts and access (download logs cascade from entitlements).
 * Orders and their items stay for the accounts; `Order.userId` becomes null and the
 * order keeps its email snapshot. The owner account can never be deleted here.
 */
export async function deleteCustomerAccount(db: PrismaClient, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role !== "customer") throw new ActionError("notFound");
    await tx.entitlement.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
