import { createHmac } from "node:crypto";
import { z } from "zod";
import { requestJson, safeEqual } from "./http";
import {
  ProviderRequestError,
  WebhookVerificationError,
  type PaymentProvider,
  type PaymentState,
} from "./types";

// Paddle Billing (USD, Merchant of Record): one transaction per order with non-catalog
// prices and an explicit tax mode on every item (spec §17.5 §3). Webhooks are signed
// with `Paddle-Signature: ts=…;h1=…` (HMAC-SHA256 of "ts:rawBody").
// https://developer.paddle.com

export type PaddleConfig = {
  apiKey: string;
  webhookSecret: string;
  environment: "sandbox" | "production";
  taxMode: "internal" | "external";
  taxCategory: string;
  /** Our page that opens Paddle's checkout for a transaction (the default payment link). */
  checkoutPageUrl: (input: {
    locale: "ar" | "en";
    orderId: string;
    transactionId: string;
  }) => string;
  /** Accepted clock difference for signed webhooks. */
  toleranceSeconds?: number;
};

const webhookSchema = z.looseObject({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  data: z.looseObject({
    id: z.string().optional(),
    transaction_id: z.string().nullable().optional(),
    action: z.string().optional(),
  }),
});

const transactionSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  currency_code: z.string(),
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
  items: z.array(
    z.looseObject({
      quantity: z.number().int(),
      price: z.looseObject({
        tax_mode: z.string().optional(),
        unit_price: z.looseObject({ amount: z.string(), currency_code: z.string() }),
      }),
    }),
  ),
  details: z.looseObject({
    totals: z.looseObject({ tax: z.string(), grand_total: z.string() }),
  }),
  adjustments: z
    .array(z.looseObject({ action: z.string(), status: z.string() }))
    .nullable()
    .optional(),
});

const TRANSACTION_EVENTS = new Set([
  "transaction.paid",
  "transaction.completed",
  "transaction.canceled",
  "transaction.payment_failed",
]);
const ADJUSTMENT_EVENTS = new Set(["adjustment.created", "adjustment.updated"]);

function stateOf(transaction: z.infer<typeof transactionSchema>): PaymentState {
  const refunded = transaction.adjustments?.some(
    (adjustment) => adjustment.action === "refund" && adjustment.status === "approved",
  );
  if (refunded) return "refunded";
  if (transaction.status === "paid" || transaction.status === "completed") return "paid";
  if (transaction.status === "canceled") return "failed";
  return "pending";
}

/** Parses `ts=…;h1=…[;h1=…]` (several h1 values appear while a secret is rotated). */
function parseSignature(header: string | null): { timestamp: number; signatures: string[] } {
  if (!header) throw new WebhookVerificationError("missing signature");
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const [key, value] = part.split("=", 2);
    if (key === "ts" && value) timestamp = Number(value);
    if (key === "h1" && value) signatures.push(value);
  }
  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    throw new WebhookVerificationError("malformed signature");
  }
  return { timestamp, signatures };
}

export function createPaddleProvider(config: PaddleConfig): PaymentProvider {
  const base =
    config.environment === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const headers = { authorization: `Bearer ${config.apiKey}` };
  const tolerance = config.toleranceSeconds ?? 300;

  return {
    id: "paddle",
    currency: "USD",
    minimumAmountMinor: 1,

    async createPayment(input) {
      const response = await requestJson<{ data?: { id?: string } }>(
        "paddle",
        `${base}/transactions`,
        {
          method: "POST",
          headers,
          json: {
            currency_code: "USD",
            collection_mode: "automatic",
            custom_data: { order_id: input.orderId, order_number: String(input.orderNumber) },
            items: input.lines.map((line) => ({
              quantity: 1,
              price: {
                description: line.title.slice(0, 200),
                name: line.title.slice(0, 150),
                // Explicit on every item; Paddle's default for Saudi Arabia is inclusive.
                tax_mode: config.taxMode,
                unit_price: { amount: String(line.unitAmountMinor), currency_code: "USD" },
                product: {
                  name: line.title.slice(0, 200),
                  tax_category: config.taxCategory,
                  custom_data: { product_id: line.productId },
                },
              },
            })),
          },
        },
      );
      const id = response.data?.id;
      if (!id) throw new ProviderRequestError("paddle", null, "transaction without id");
      return {
        reference: id,
        redirectUrl: config.checkoutPageUrl({
          locale: input.locale,
          orderId: input.orderId,
          transactionId: id,
        }),
        taxMode: config.taxMode,
      };
    },

    async verifyWebhook({ rawBody, headers: requestHeaders }) {
      const { timestamp, signatures } = parseSignature(requestHeaders.get("paddle-signature"));
      if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) {
        throw new WebhookVerificationError("stale signature");
      }
      const expected = createHmac("sha256", config.webhookSecret)
        .update(`${timestamp}:${rawBody}`, "utf8")
        .digest("hex");
      if (!signatures.some((signature) => safeEqual(signature, expected))) {
        throw new WebhookVerificationError("wrong signature");
      }

      let body: z.infer<typeof webhookSchema>;
      try {
        body = webhookSchema.parse(JSON.parse(rawBody));
      } catch {
        throw new WebhookVerificationError("malformed body");
      }
      let fetchRef: string | null = null;
      if (TRANSACTION_EVENTS.has(body.event_type)) fetchRef = body.data.id ?? null;
      if (ADJUSTMENT_EVENTS.has(body.event_type) && body.data.action === "refund") {
        fetchRef = body.data.transaction_id ?? null;
      }
      return {
        eventId: body.event_id,
        type: body.event_type,
        kind: fetchRef ? "payment" : "ignored",
        fetchRef,
        payload: body,
      };
    },

    async fetchPayment(transactionId) {
      const response = await requestJson<{ data: unknown }>(
        "paddle",
        `${base}/transactions/${encodeURIComponent(transactionId)}?include=adjustments`,
        { headers },
      );
      const transaction = transactionSchema.parse(response.data);
      const orderId = transaction.custom_data?.order_id;
      const taxMode = transaction.items[0]?.price.tax_mode;
      return {
        reference: transaction.id,
        paymentId: transaction.id,
        state: stateOf(transaction),
        currency: transaction.currency_code,
        amountMinor: Number(transaction.details.totals.grand_total),
        orderId: typeof orderId === "string" ? orderId : null,
        lineUnitAmounts: transaction.items.flatMap((item) =>
          Array.from({ length: item.quantity }, () => Number(item.price.unit_price.amount)),
        ),
        taxMinor: Number(transaction.details.totals.tax),
        taxMode: taxMode === "internal" || taxMode === "external" ? taxMode : undefined,
      };
    },

    async refund({ reference }) {
      // A full refund through an adjustment; Paddle reviews it and reports the
      // approval with an adjustment.updated webhook.
      await requestJson("paddle", `${base}/adjustments`, {
        method: "POST",
        headers,
        json: {
          action: "refund",
          type: "full",
          transaction_id: reference,
          reason: "Refund issued by the store",
        },
      });
      return { state: "pending" };
    },
  };
}
