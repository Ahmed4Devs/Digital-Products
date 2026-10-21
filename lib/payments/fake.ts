import { z } from "zod";
import { keyedHash } from "@/lib/security/keyed-hash";
import { safeEqual } from "./http";
import { WebhookVerificationError, type PaymentProvider, type PaymentState } from "./types";

// Test-only gateway (TEST_DOUBLES=on, loopback only): a page in the app plays the
// provider's hosted checkout and sends HMAC-signed webhooks to the real webhook route,
// so automated tests exercise exactly the production path — verification, idempotency,
// re-fetch and amount matching — without calling anyone. Its "API" is stateless: the
// references and payment tokens it issues are signed and carry the payment's details.

const SIGNATURE_PURPOSE = "fake-payments";
const WEBHOOK_PURPOSE = "fake-payments-webhook";
export const FAKE_SIGNATURE_HEADER = "x-fake-signature";

const referenceSchema = z.strictObject({
  o: z.string(),
  a: z.number().int().nonnegative(),
  c: z.enum(["USD", "SAR"]),
});

const tokenSchema = z.strictObject({
  r: z.string(),
  s: z.enum(["paid", "pending", "failed", "refunded"]),
  /** Overrides for tests: what the "provider" claims was charged. */
  a: z.number().int().nonnegative().optional(),
  c: z.string().optional(),
});

function sign(secret: string, value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${keyedHash(secret, SIGNATURE_PURPOSE, payload)}`;
}

function unsign<T>(secret: string, signed: string, schema: z.ZodType<T>): T | null {
  const [payload, mac, ...rest] = signed.split(".");
  if (!payload || !mac || rest.length > 0) return null;
  if (!safeEqual(mac, keyedHash(secret, SIGNATURE_PURPOSE, payload))) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function decodeFakeReference(secret: string, reference: string) {
  return reference.startsWith("fake_") ? unsign(secret, reference.slice(5), referenceSchema) : null;
}

/** A payment as the fake provider would report it. */
export function fakePaymentToken(
  secret: string,
  reference: string,
  state: PaymentState,
  overrides: { amountMinor?: number; currency?: string } = {},
): string {
  return `fakepay_${sign(secret, { r: reference, s: state, a: overrides.amountMinor, c: overrides.currency })}`;
}

export function signFakeWebhook(secret: string, rawBody: string): string {
  return keyedHash(secret, WEBHOOK_PURPOSE, rawBody);
}

const webhookSchema = z.strictObject({
  id: z.string().min(1),
  type: z.enum(["payment.paid", "payment.failed", "payment.refunded"]),
  payment: z.string().min(1),
});

export function createFakeProvider(config: { secret: string; appUrl: string }): PaymentProvider {
  return {
    id: "fake",
    currency: "USD",
    minimumAmountMinor: 1,

    async createPayment(input) {
      const reference = `fake_${sign(config.secret, { o: input.orderId, a: input.amountMinor, c: input.currency })}`;
      const url = new URL(`/${input.locale}/checkout/fake`, config.appUrl);
      url.searchParams.set("reference", reference);
      return { reference, redirectUrl: url.toString() };
    },

    async verifyWebhook({ rawBody, headers }) {
      const signature = headers.get(FAKE_SIGNATURE_HEADER) ?? "";
      if (!safeEqual(signature, signFakeWebhook(config.secret, rawBody))) {
        throw new WebhookVerificationError("wrong signature");
      }
      let body: z.infer<typeof webhookSchema>;
      try {
        body = webhookSchema.parse(JSON.parse(rawBody));
      } catch {
        throw new WebhookVerificationError("malformed body");
      }
      return {
        eventId: body.id,
        type: body.type,
        kind: "payment",
        fetchRef: body.payment,
        payload: body,
      };
    },

    async fetchPayment(token) {
      const payment = token.startsWith("fakepay_")
        ? unsign(config.secret, token.slice(8), tokenSchema)
        : null;
      const reference = payment ? decodeFakeReference(config.secret, payment.r) : null;
      if (!payment || !reference) throw new WebhookVerificationError("unknown fake payment");
      return {
        reference: payment.r,
        paymentId: `fakecap_${reference.o}`,
        state: payment.s,
        currency: payment.c ?? reference.c,
        amountMinor: payment.a ?? reference.a,
        orderId: reference.o,
      };
    },

    async refund() {
      return { state: "completed" };
    },
  };
}
