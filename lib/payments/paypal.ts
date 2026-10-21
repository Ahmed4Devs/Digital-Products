import { z } from "zod";
import { decimalAmount, minorFromDecimal, requestJson } from "./http";
import {
  ProviderRequestError,
  WebhookVerificationError,
  type PaymentProvider,
  type PaymentState,
} from "./types";

// PayPal Orders v2 (USD): the customer approves on PayPal, the store captures, and the
// capture-completed webhook — verified through PayPal's verify-webhook-signature API
// with the raw body — fulfils the order. https://developer.paypal.com/api/rest/

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  environment: "sandbox" | "live";
  brandName: string;
};

const WEBHOOK_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

const eventSchema = z.looseObject({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: z.looseObject({
    id: z.string().optional(),
    supplementary_data: z
      .looseObject({ related_ids: z.looseObject({ order_id: z.string().optional() }).optional() })
      .optional(),
    links: z.array(z.looseObject({ rel: z.string(), href: z.string() })).optional(),
  }),
});

const amountSchema = z.looseObject({ currency_code: z.string(), value: z.string() });

const orderSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  purchase_units: z
    .array(
      z.looseObject({
        custom_id: z.string().optional(),
        amount: amountSchema,
        payments: z
          .looseObject({
            captures: z
              .array(z.looseObject({ id: z.string(), status: z.string(), amount: amountSchema }))
              .optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

function stateOfCapture(status: string | undefined): PaymentState {
  switch (status) {
    case "COMPLETED":
    case "PARTIALLY_REFUNDED":
      return "paid";
    case "REFUNDED":
      return "refunded";
    case "DECLINED":
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

export function createPayPalProvider(config: PayPalConfig): PaymentProvider {
  const base =
    config.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  let token: { value: string; expiresAt: number } | null = null;

  async function authorization(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return `Bearer ${token.value}`;
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const response = await requestJson<{ access_token?: string; expires_in?: number }>(
      "paypal",
      `${base}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${credentials}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
    );
    if (!response.access_token) throw new ProviderRequestError("paypal", null, "no access token");
    token = {
      value: response.access_token,
      expiresAt: Date.now() + (response.expires_in ?? 300) * 1000,
    };
    return `Bearer ${token.value}`;
  }

  async function fetchOrder(orderId: string) {
    return orderSchema.parse(
      await requestJson("paypal", `${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
        headers: { authorization: await authorization() },
      }),
    );
  }

  return {
    id: "paypal",
    currency: "USD",
    minimumAmountMinor: 1,

    async createPayment(input) {
      const itemTotal = input.lines.reduce((sum, line) => sum + line.unitAmountMinor, 0);
      const order = await requestJson<{ id?: string; links?: { rel: string; href: string }[] }>(
        "paypal",
        `${base}/v2/checkout/orders`,
        {
          method: "POST",
          headers: {
            authorization: await authorization(),
            // Retries of the same order never create a second PayPal order.
            "paypal-request-id": `order-${input.orderId}`,
          },
          json: {
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: input.orderId,
                custom_id: input.orderId,
                invoice_id: String(input.orderNumber),
                description: input.description.slice(0, 127),
                amount: {
                  currency_code: "USD",
                  value: decimalAmount(input.amountMinor),
                  breakdown: {
                    item_total: { currency_code: "USD", value: decimalAmount(itemTotal) },
                    ...(input.taxMinor > 0
                      ? {
                          tax_total: { currency_code: "USD", value: decimalAmount(input.taxMinor) },
                        }
                      : {}),
                  },
                },
                items: input.lines.map((line) => ({
                  name: line.title.slice(0, 127),
                  sku: line.productId,
                  quantity: "1",
                  category: "DIGITAL_GOODS",
                  unit_amount: { currency_code: "USD", value: decimalAmount(line.unitAmountMinor) },
                })),
              },
            ],
            payment_source: {
              paypal: {
                email_address: input.customerEmail,
                experience_context: {
                  brand_name: config.brandName.slice(0, 127),
                  locale: input.locale === "ar" ? "ar-SA" : "en-US",
                  shipping_preference: "NO_SHIPPING",
                  user_action: "PAY_NOW",
                  return_url: input.successUrl,
                  cancel_url: input.cancelUrl,
                },
              },
            },
          },
        },
      );
      const approve = order.links?.find(
        (link) => link.rel === "payer-action" || link.rel === "approve",
      );
      if (!order.id || !approve)
        throw new ProviderRequestError("paypal", null, "order without approval link");
      return { reference: order.id, redirectUrl: approve.href };
    },

    async verifyWebhook({ rawBody, headers }) {
      const values = Object.fromEntries(
        Object.entries(WEBHOOK_HEADERS).map(([field, header]) => [field, headers.get(header)]),
      );
      if (Object.values(values).some((value) => !value)) {
        throw new WebhookVerificationError("missing signature headers");
      }
      const certUrl = URL.parse(values.cert_url!);
      if (
        !certUrl ||
        certUrl.protocol !== "https:" ||
        !/(^|\.)paypal\.com$/.test(certUrl.hostname)
      ) {
        throw new WebhookVerificationError("unexpected certificate host");
      }
      let event: z.infer<typeof eventSchema>;
      try {
        event = eventSchema.parse(JSON.parse(rawBody));
      } catch {
        throw new WebhookVerificationError("malformed body");
      }

      // The event goes back byte for byte: re-serializing can change it and fail.
      const fields = Object.entries({ ...values, webhook_id: config.webhookId })
        .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
        .join(",");
      const verification = await requestJson<{ verification_status?: string }>(
        "paypal",
        `${base}/v1/notifications/verify-webhook-signature`,
        {
          method: "POST",
          headers: { authorization: await authorization(), "content-type": "application/json" },
          body: `{${fields},"webhook_event":${rawBody}}`,
        },
      );
      if (verification.verification_status !== "SUCCESS") {
        throw new WebhookVerificationError("signature not verified by PayPal");
      }

      const { resource } = event;
      const relatedOrder = resource.supplementary_data?.related_ids?.order_id ?? null;
      const captureLink = resource.links?.find((link) => link.rel === "up")?.href ?? "";
      const captureId = /\/captures\/([^/?]+)/.exec(captureLink)?.[1] ?? null;

      switch (event.event_type) {
        case "CHECKOUT.ORDER.APPROVED":
          return {
            eventId: event.id,
            type: event.event_type,
            kind: "approved",
            fetchRef: resource.id ?? null,
            payload: event,
          };
        case "PAYMENT.CAPTURE.COMPLETED":
        case "PAYMENT.CAPTURE.DENIED":
        case "PAYMENT.CAPTURE.DECLINED":
          return {
            eventId: event.id,
            type: event.event_type,
            kind: "payment",
            fetchRef: relatedOrder,
            payload: event,
          };
        case "PAYMENT.CAPTURE.REFUNDED":
        case "PAYMENT.CAPTURE.REVERSED":
          return {
            eventId: event.id,
            type: event.event_type,
            kind: "payment",
            fetchRef: captureId ? `capture:${captureId}` : relatedOrder,
            payload: event,
          };
        default:
          return {
            eventId: event.id,
            type: event.event_type,
            kind: "ignored",
            fetchRef: null,
            payload: event,
          };
      }
    },

    async fetchPayment(fetchRef) {
      let orderId = fetchRef;
      if (fetchRef.startsWith("capture:")) {
        const capture = z
          .looseObject({
            supplementary_data: z.looseObject({
              related_ids: z.looseObject({ order_id: z.string() }),
            }),
          })
          .parse(
            await requestJson(
              "paypal",
              `${base}/v2/payments/captures/${encodeURIComponent(fetchRef.slice("capture:".length))}`,
              { headers: { authorization: await authorization() } },
            ),
          );
        orderId = capture.supplementary_data.related_ids.order_id;
      }
      const order = await fetchOrder(orderId);
      const unit = order.purchase_units[0]!;
      const capture = unit.payments?.captures?.[0];
      const amount = capture?.amount ?? unit.amount;
      return {
        reference: order.id,
        paymentId: capture?.id ?? null,
        state: stateOfCapture(capture?.status),
        currency: amount.currency_code,
        amountMinor: minorFromDecimal(amount.value),
        orderId: unit.custom_id ?? null,
      };
    },

    async capture(reference, orderId) {
      try {
        await requestJson(
          "paypal",
          `${base}/v2/checkout/orders/${encodeURIComponent(reference)}/capture`,
          {
            method: "POST",
            headers: {
              authorization: await authorization(),
              "paypal-request-id": `capture-${orderId}`,
            },
            json: {},
          },
        );
      } catch (error) {
        // 422: already captured (or not capturable any more); nothing left to do.
        if (error instanceof ProviderRequestError && error.status === 422) return;
        throw error;
      }
    },

    async refund({ paymentId, orderId }) {
      if (!paymentId) throw new ProviderRequestError("paypal", null, "no capture to refund");
      const refund = await requestJson<{ status?: string }>(
        "paypal",
        `${base}/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
        {
          method: "POST",
          headers: {
            authorization: await authorization(),
            "paypal-request-id": `refund-${orderId}`,
          },
          json: {},
        },
      );
      return { state: refund.status === "COMPLETED" ? "completed" : "pending" };
    },
  };
}
