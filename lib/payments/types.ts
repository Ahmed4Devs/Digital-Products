import type { Currency } from "@/lib/money";

// The single interface every gateway implements (spec §10.2). Checkout and webhook
// processing only ever talk to this; adding or removing a gateway touches no checkout
// logic.

export type ProviderId = "moyasar" | "paddle" | "paypal" | "fake";

export type PaymentLine = {
  productId: string;
  title: string;
  /** Line price after discount, before tax, in the charged currency. */
  unitAmountMinor: number;
};

export type CreatePaymentInput = {
  orderId: string;
  orderNumber: number;
  locale: "ar" | "en";
  customerEmail: string;
  currency: Currency;
  amountMinor: number;
  /** Store tax included in `amountMinor` (never set for Paddle). */
  taxMinor: number;
  lines: PaymentLine[];
  /** Where the customer lands after paying (the result page). */
  successUrl: string;
  /** Where the customer lands after giving up (the cart). */
  cancelUrl: string;
  /** This provider's webhook endpoint. */
  webhookUrl: string;
  description: string;
};

export type CreatedPayment = {
  /** Stored on the order: Moyasar invoice, Paddle transaction, PayPal order. */
  reference: string;
  /** Where to send the customer to pay. */
  redirectUrl: string;
  /** Paddle records the tax mode it was told to use (§17.5 §3). */
  taxMode?: "internal" | "external";
};

export type VerifiedWebhook = {
  eventId: string;
  type: string;
  /**
   * `payment`: re-fetch and apply the payment's state. `approved`: the customer approved
   * a payment that the store must capture (PayPal). `ignored`: nothing to do.
   */
  kind: "payment" | "approved" | "ignored";
  /** What to pass to fetchPayment / capture. */
  fetchRef: string | null;
  payload: unknown;
};

export type PaymentState = "paid" | "pending" | "failed" | "refunded";

/** A payment as the provider's API reports it: the only source of truth for fulfilment. */
export type ProviderPayment = {
  /** Matches Order.providerReference. */
  reference: string;
  /** The captured payment, kept for refunds. */
  paymentId: string | null;
  state: PaymentState;
  currency: string;
  amountMinor: number;
  /** The order id the store attached as metadata, when the provider echoes it. */
  orderId: string | null;
  /** Paddle: the unit prices of each line, for line-item matching (§17.5 §3). */
  lineUnitAmounts?: number[];
  taxMinor?: number;
  taxMode?: "internal" | "external";
};

export type RefundInput = {
  reference: string;
  paymentId: string | null;
  orderId: string;
  amountMinor: number;
  currency: Currency;
};

export interface PaymentProvider {
  readonly id: ProviderId;
  /** The currency this gateway charges (spec §10.2). */
  readonly currency: Currency;
  /** Smallest amount the gateway accepts, in minor units. */
  readonly minimumAmountMinor: number;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  /** Verifies the raw request; throws WebhookVerificationError for anything not genuine. */
  verifyWebhook(request: { rawBody: string; headers: Headers }): Promise<VerifiedWebhook>;
  fetchPayment(fetchRef: string): Promise<ProviderPayment>;
  refund(input: RefundInput): Promise<{ state: "pending" | "completed" }>;
  /** Captures an approved payment (PayPal); idempotent. */
  capture?(reference: string, orderId: string): Promise<void>;
}

export class WebhookVerificationError extends Error {
  override readonly name = "WebhookVerificationError";
}

/** A provider API call failed. The message never contains response bodies or secrets. */
export class ProviderRequestError extends Error {
  override readonly name = "ProviderRequestError";

  constructor(
    readonly provider: ProviderId,
    readonly status: number | null,
    message: string,
  ) {
    super(`${provider}: ${message}`);
  }
}
