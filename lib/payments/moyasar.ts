import { z } from "zod";
import { requestJson, safeEqual } from "./http";
import {
  ProviderRequestError,
  WebhookVerificationError,
  type PaymentProvider,
  type PaymentState,
} from "./types";

// Moyasar (SAR): hosted invoice pages; webhooks registered in the dashboard carry a
// shared secret (`secret_token`) that is compared in constant time; the payment is then
// re-fetched with the secret key. https://docs.moyasar.com

export type MoyasarConfig = {
  secretKey: string;
  webhookSecret: string;
  baseUrl?: string;
};

const webhookSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1),
  secret_token: z.string(),
  data: z.looseObject({ id: z.string().min(1) }).optional(),
});

const paymentSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  refunded: z.number().int().optional(),
  invoice_id: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const PAYMENT_EVENTS = new Set([
  "payment_paid",
  "payment_captured",
  "payment_refunded",
  "payment_failed",
  "payment_voided",
]);

/**
 * A failed attempt on an invoice is not final: the customer can try another card on the
 * same page, so only paid and fully refunded payments change an order.
 */
function stateOf(payment: z.infer<typeof paymentSchema>): PaymentState {
  if (payment.status === "paid" || payment.status === "captured") return "paid";
  if (payment.status === "refunded") return "refunded";
  return "pending";
}

export function createMoyasarProvider(config: MoyasarConfig): PaymentProvider {
  const base = config.baseUrl ?? "https://api.moyasar.com/v1";
  const authorization = `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`;

  return {
    id: "moyasar",
    currency: "SAR",
    minimumAmountMinor: 100,

    async createPayment(input) {
      const invoice = await requestJson<{ id?: string; url?: string; invoice_url?: string }>(
        "moyasar",
        `${base}/invoices`,
        {
          method: "POST",
          headers: { authorization },
          json: {
            amount: input.amountMinor,
            currency: "SAR",
            description: input.description,
            callback_url: input.webhookUrl,
            success_url: input.successUrl,
            back_url: input.cancelUrl,
            metadata: { order_id: input.orderId, order_number: String(input.orderNumber) },
          },
        },
      );
      const url = invoice.url ?? invoice.invoice_url;
      if (!invoice.id || !url) {
        throw new ProviderRequestError("moyasar", null, "invoice without id or url");
      }
      return { reference: invoice.id, redirectUrl: url };
    },

    async verifyWebhook({ rawBody }) {
      let body: z.infer<typeof webhookSchema>;
      try {
        body = webhookSchema.parse(JSON.parse(rawBody));
      } catch {
        throw new WebhookVerificationError("malformed body");
      }
      if (!safeEqual(body.secret_token, config.webhookSecret)) {
        throw new WebhookVerificationError("wrong shared secret");
      }
      const relevant = PAYMENT_EVENTS.has(body.type) && body.data !== undefined;
      return {
        eventId: body.id,
        type: body.type,
        kind: relevant ? "payment" : "ignored",
        fetchRef: relevant ? body.data!.id : null,
        // The shared secret is not kept in the event log.
        payload: { ...body, secret_token: undefined },
      };
    },

    async fetchPayment(paymentId) {
      const payment = paymentSchema.parse(
        await requestJson("moyasar", `${base}/payments/${encodeURIComponent(paymentId)}`, {
          headers: { authorization },
        }),
      );
      if (!payment.invoice_id) {
        throw new ProviderRequestError("moyasar", null, "payment is not linked to an invoice");
      }
      const orderId = payment.metadata?.order_id;
      return {
        reference: payment.invoice_id,
        paymentId: payment.id,
        state: stateOf(payment),
        currency: payment.currency,
        amountMinor: payment.amount,
        orderId: typeof orderId === "string" ? orderId : null,
      };
    },

    async refund({ paymentId, amountMinor }) {
      if (!paymentId) throw new ProviderRequestError("moyasar", null, "no payment to refund");
      const payment = paymentSchema.parse(
        await requestJson("moyasar", `${base}/payments/${encodeURIComponent(paymentId)}/refund`, {
          method: "POST",
          headers: { authorization },
          json: { amount: amountMinor },
        }),
      );
      return { state: payment.status === "refunded" ? "completed" : "pending" };
    },
  };
}
