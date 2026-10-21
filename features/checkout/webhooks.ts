import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  WebhookVerificationError,
  type PaymentProvider,
  type ProviderPayment,
} from "@/lib/payments/types";
import { closeOrder, fulfilOrder, lockOrder, recordRefund } from "./fulfilment";

// Payment webhooks (spec §5.1, §10.1 step 8): verify the signature on the raw body →
// reject duplicates by (provider, event id) → re-fetch the payment from the provider's
// API → match amount and currency with the order → apply it in one transaction. The
// browser never changes an order's state; only this does.

export type WebhookResult = { status: number; outcome: string };

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

function sameMultiset(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = (values: number[]) => [...values].sort((x, y) => x - y);
  const [left, right] = [sorted(a), sorted(b)];
  return left.every((value, index) => value === right[index]);
}

/** Why a fetched payment does not belong to this order, or null when it matches. */
export function paymentMismatch(order: OrderWithItems, payment: ProviderPayment): string | null {
  if (payment.orderId !== null && payment.orderId !== order.id) return "order_mismatch";
  if (payment.currency.toUpperCase() !== order.chargedCurrency) return "currency_mismatch";
  if (order.provider === "paddle") {
    // Compare the unit prices the store sent, independent of tax (§17.5 §3).
    const sent = order.items.map((item) => item.unitChargedMinor);
    if (!sameMultiset(sent, payment.lineUnitAmounts ?? [])) return "amount_mismatch";
    return null;
  }
  return payment.amountMinor === order.chargedAmountMinor ? null : "amount_mismatch";
}

async function applyPayment(
  db: PrismaClient,
  provider: PaymentProvider,
  payment: ProviderPayment,
): Promise<{ outcome: string; orderId: string | null }> {
  const order = await db.order.findUnique({
    where: {
      provider_providerReference: { provider: provider.id, providerReference: payment.reference },
    },
    select: { id: true },
  });
  if (!order) return { outcome: "unknown_order", orderId: null };

  const outcome = await db.$transaction(async (tx) => {
    const current = await lockOrder(tx, order.id);
    if (!current) return "unknown_order";

    switch (payment.state) {
      case "paid": {
        if (current.status === "paid") return "already_paid";
        if (current.status === "refunded") return "already_refunded";
        const mismatch = paymentMismatch(current, payment);
        if (mismatch) return mismatch;
        // Paid late (after expiry) or after a failed attempt: the money arrived, so the
        // order is fulfilled; a paid order is never rejected (§17.5 §9).
        await fulfilOrder(
          tx,
          current,
          provider.id === "paddle"
            ? {
                providerPaymentId: payment.paymentId,
                chargedAmountMinor: payment.amountMinor,
                providerTaxMinor: payment.taxMinor ?? null,
                providerTaxMode: payment.taxMode ?? current.providerTaxMode,
              }
            : { providerPaymentId: payment.paymentId },
        );
        return "fulfilled";
      }
      case "refunded": {
        if (current.status !== "paid") return "ignored";
        await recordRefund(tx, current);
        return "refunded";
      }
      case "failed": {
        if (current.status !== "pending") return "ignored";
        await closeOrder(tx, current.id, "failed");
        return "failed";
      }
      default:
        return "pending";
    }
  });
  return { outcome, orderId: order.id };
}

async function capturePayment(
  db: PrismaClient,
  provider: PaymentProvider,
  reference: string,
): Promise<{ outcome: string; orderId: string | null }> {
  const order = await db.order.findUnique({
    where: { provider_providerReference: { provider: provider.id, providerReference: reference } },
    select: { id: true, status: true },
  });
  if (!order) return { outcome: "unknown_order", orderId: null };
  if (order.status !== "pending" && order.status !== "expired")
    return { outcome: "ignored", orderId: order.id };
  // Capturing does not fulfil: the capture-completed webhook does, after verification.
  await provider.capture?.(reference, order.id);
  return { outcome: "capture_requested", orderId: order.id };
}

export async function handleWebhook(
  db: PrismaClient,
  provider: PaymentProvider,
  request: { rawBody: string; headers: Headers },
): Promise<WebhookResult> {
  let event;
  try {
    event = await provider.verifyWebhook(request);
  } catch (error) {
    if (error instanceof WebhookVerificationError)
      return { status: 401, outcome: "invalid_signature" };
    throw error;
  }

  const key = {
    provider_providerEventId: { provider: provider.id, providerEventId: event.eventId },
  };
  const existing = await db.paymentEvent.findUnique({
    where: key,
    select: { id: true, processedAt: true },
  });
  if (existing?.processedAt) return { status: 200, outcome: "duplicate" };
  let eventId = existing?.id;
  if (!eventId) {
    try {
      const created = await db.paymentEvent.create({
        data: {
          provider: provider.id,
          providerEventId: event.eventId,
          type: event.type,
          payload: event.payload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      eventId = created.id;
    } catch (error) {
      // The same event arriving twice at once: the other delivery handles it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { status: 200, outcome: "duplicate" };
      }
      throw error;
    }
  }

  let result: { outcome: string; orderId: string | null } = { outcome: "ignored", orderId: null };
  if (event.kind === "payment" && event.fetchRef) {
    // Provider API errors propagate: the event stays unprocessed and the retry redoes it.
    result = await applyPayment(db, provider, await provider.fetchPayment(event.fetchRef));
  } else if (event.kind === "approved" && event.fetchRef) {
    result = await capturePayment(db, provider, event.fetchRef);
  }

  await db.paymentEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), outcome: result.outcome, orderId: result.orderId },
  });
  return { status: 200, outcome: result.outcome };
}
