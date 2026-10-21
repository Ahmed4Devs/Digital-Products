import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { lockOrder, recordRefund } from "@/features/checkout/fulfilment";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import type { PaymentProvider, ProviderId } from "@/lib/payments/types";
import { sendReceipt } from "./receipt";

// Owner actions on orders (spec §11): resend the receipt, refund through the provider,
// and grant or revoke the access an item gave. Every action is audited.

export async function resendReceipt(
  db: PrismaClient,
  actorId: string,
  orderId: string,
): Promise<void> {
  const sent = await sendReceipt(db, orderId);
  if (!sent) throw new ActionError("receiptUnavailable");
  await db.$transaction((tx) =>
    recordAudit(tx, {
      actorId,
      action: "order.resend_receipt",
      entity: "order",
      entityId: orderId,
    }),
  );
}

/**
 * Refunds a paid order in full. Zero-total orders have nothing to give back and are
 * revoked directly. Otherwise the provider's API is asked first; when it confirms at once
 * (Moyasar, PayPal) the order is recorded as refunded now, and when the refund needs the
 * provider's review (Paddle) the refund webhook records it later.
 */
export async function refundOrder(
  db: PrismaClient,
  providers: Map<ProviderId, PaymentProvider>,
  actorId: string,
  orderId: string,
): Promise<"refunded" | "pending"> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ActionError("notFound");
  if (order.status !== "paid") throw new ActionError("notRefundable");

  let state: "completed" | "pending" = "completed";
  if (order.provider) {
    const provider = providers.get(order.provider);
    if (!provider || !order.providerReference) throw new ActionError("gatewayUnavailable");
    try {
      ({ state } = await provider.refund({
        reference: order.providerReference,
        paymentId: order.providerPaymentId,
        orderId: order.id,
        amountMinor: order.chargedAmountMinor,
        currency: order.chargedCurrency,
      }));
    } catch (error) {
      console.error("Refund request failed", error instanceof Error ? error.message : "unknown");
      throw new ActionError("refundFailed");
    }
  }

  await db.$transaction(async (tx) => {
    if (state === "completed") {
      const locked = await lockOrder(tx, order.id);
      if (locked?.status === "paid") await recordRefund(tx, locked);
    }
    await recordAudit(tx, {
      actorId,
      action: state === "completed" ? "order.refund" : "order.refund_requested",
      entity: "order",
      entityId: order.id,
      before: { status: order.status },
      after: { status: state === "completed" ? "refunded" : order.status },
    });
  });
  return state === "completed" ? "refunded" : "pending";
}

/**
 * Grants or revokes the access an order item gave. Revoking touches only the entitlement
 * that still points at this item, so a later re-purchase of the product is unaffected.
 */
export async function setItemAccess(
  db: PrismaClient,
  actorId: string,
  orderId: string,
  orderItemId: string,
  active: boolean,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      select: { id: true, productId: true, order: { select: { userId: true, status: true } } },
    });
    if (!item?.order.userId) throw new ActionError("notFound");
    const userId = item.order.userId;

    let entitlementId: string;
    if (active) {
      if (item.order.status !== "paid") throw new ActionError("notPaid");
      ({ id: entitlementId } = await tx.entitlement.upsert({
        where: { userId_productId: { userId, productId: item.productId } },
        create: { userId, productId: item.productId, orderItemId: item.id },
        update: { revokedAt: null, orderItemId: item.id },
        select: { id: true },
      }));
    } else {
      const entitlement = await tx.entitlement.findFirst({
        where: { orderItemId: item.id, revokedAt: null },
        select: { id: true },
      });
      if (!entitlement) throw new ActionError("notFound");
      entitlementId = entitlement.id;
      await tx.entitlement.update({
        where: { id: entitlementId },
        data: { revokedAt: new Date() },
      });
    }
    await recordAudit(tx, {
      actorId,
      action: active ? "entitlement.grant" : "entitlement.revoke",
      entity: "entitlement",
      entityId: entitlementId,
      details: { orderId, orderItemId, productId: item.productId, userId },
    });
  });
}
