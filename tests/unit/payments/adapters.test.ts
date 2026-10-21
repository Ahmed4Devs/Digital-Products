import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakeProvider,
  decodeFakeReference,
  fakePaymentToken,
  FAKE_SIGNATURE_HEADER,
  signFakeWebhook,
} from "@/lib/payments/fake";
import { decimalAmount, minorFromDecimal, requestJson } from "@/lib/payments/http";
import { createMoyasarProvider } from "@/lib/payments/moyasar";
import { createPaddleProvider } from "@/lib/payments/paddle";
import { ProviderRequestError, WebhookVerificationError } from "@/lib/payments/types";

const paddle = createPaddleProvider({
  apiKey: "key",
  webhookSecret: "paddle-secret",
  environment: "sandbox",
  taxMode: "external",
  taxCategory: "standard",
  checkoutPageUrl: ({ transactionId }) => `https://store.test/pay?_ptxn=${transactionId}`,
});
const moyasar = createMoyasarProvider({
  secretKey: "sk_test",
  webhookSecret: "moyasar-secret-123456",
});
const SECRET = "fake-unit-test-secret-that-is-long-enough";
const fake = createFakeProvider({ secret: SECRET, appUrl: "http://localhost:3000" });

afterEach(() => vi.unstubAllGlobals());

describe("money strings", () => {
  it("formats and parses decimal amounts", () => {
    expect(decimalAmount(1500)).toBe("15.00");
    expect(decimalAmount(5)).toBe("0.05");
    expect(minorFromDecimal("15.00")).toBe(1500);
    expect(minorFromDecimal("15.5")).toBe(1550);
    expect(minorFromDecimal("15")).toBe(1500);
    expect(minorFromDecimal("1e3")).toBeNaN();
    expect(minorFromDecimal("-1.00")).toBeNaN();
  });
});

describe("requestJson", () => {
  it("reports failures without response bodies", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"card":"4111..."}', { status: 402 }));
    const error = await requestJson("moyasar", "https://api.test/x").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect((error as Error).message).toBe("moyasar: HTTP 402");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    await expect(requestJson("paddle", "https://api.test/x")).rejects.toThrow(
      "paddle: request failed",
    );
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200 }));
    await expect(requestJson("paypal", "https://api.test/x")).rejects.toThrow("invalid JSON");
  });
});

describe("Moyasar webhooks", () => {
  const body = (secret: string, type = "payment_paid") =>
    JSON.stringify({ id: "evt-1", type, secret_token: secret, data: { id: "pay_1" } });

  it("accepts the shared secret and drops it from the stored payload", async () => {
    const event = await moyasar.verifyWebhook({
      rawBody: body("moyasar-secret-123456"),
      headers: new Headers(),
    });
    expect(event).toMatchObject({ eventId: "evt-1", kind: "payment", fetchRef: "pay_1" });
    expect(JSON.stringify(event.payload)).not.toContain("moyasar-secret");
    const ignored = await moyasar.verifyWebhook({
      rawBody: body("moyasar-secret-123456", "payment_verified"),
      headers: new Headers(),
    });
    expect(ignored.kind).toBe("ignored");
  });

  it("refuses anything else", async () => {
    for (const rawBody of [body("wrong"), body(""), "{", JSON.stringify({ id: "x" })]) {
      await expect(
        moyasar.verifyWebhook({ rawBody, headers: new Headers() }),
      ).rejects.toBeInstanceOf(WebhookVerificationError);
    }
  });
});

describe("Paddle webhooks", () => {
  const rawBody = JSON.stringify({
    event_id: "evt_1",
    event_type: "transaction.completed",
    data: { id: "txn_1" },
  });
  const sign = (body: string, ts = Math.floor(Date.now() / 1000), secret = "paddle-secret") =>
    `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;

  it("verifies HMAC signatures over ts:rawBody", async () => {
    const event = await paddle.verifyWebhook({
      rawBody,
      headers: new Headers({ "paddle-signature": sign(rawBody) }),
    });
    expect(event).toMatchObject({ eventId: "evt_1", kind: "payment", fetchRef: "txn_1" });
  });

  it("refuses wrong secrets, altered bodies, stale or malformed headers", async () => {
    const cases = [
      sign(rawBody, undefined, "other-secret"),
      sign(`${rawBody}\n`),
      sign(rawBody, Math.floor(Date.now() / 1000) - 600),
      "ts=;h1=",
      "h1=abc",
      "",
    ];
    for (const header of cases) {
      await expect(
        paddle.verifyWebhook({ rawBody, headers: new Headers({ "paddle-signature": header }) }),
      ).rejects.toBeInstanceOf(WebhookVerificationError);
    }
  });

  it("maps refund adjustments to their transaction and ignores the rest", async () => {
    const adjustment = JSON.stringify({
      event_id: "evt_2",
      event_type: "adjustment.updated",
      data: { id: "adj", action: "refund", transaction_id: "txn_9" },
    });
    expect(
      await paddle.verifyWebhook({
        rawBody: adjustment,
        headers: new Headers({ "paddle-signature": sign(adjustment) }),
      }),
    ).toMatchObject({
      kind: "payment",
      fetchRef: "txn_9",
    });
    const credit = JSON.stringify({
      event_id: "evt_3",
      event_type: "adjustment.created",
      data: { id: "adj", action: "credit" },
    });
    expect(
      (
        await paddle.verifyWebhook({
          rawBody: credit,
          headers: new Headers({ "paddle-signature": sign(credit) }),
        })
      ).kind,
    ).toBe("ignored");
  });

  it("creates transactions with the configured tax mode on every item", async () => {
    let sent: unknown;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: { id: "txn_new" } }));
    });
    const created = await paddle.createPayment({
      orderId: "order-1",
      orderNumber: 100001,
      locale: "ar",
      customerEmail: "a@b.test",
      currency: "USD",
      amountMinor: 2500,
      taxMinor: 0,
      lines: [
        { productId: "p1", title: "One", unitAmountMinor: 1000 },
        { productId: "p2", title: "Two", unitAmountMinor: 1500 },
      ],
      successUrl: "https://store.test/ok",
      cancelUrl: "https://store.test/cart",
      webhookUrl: "https://store.test/api/webhooks/paddle",
      description: "Store #100001",
    });
    expect(created).toEqual({
      reference: "txn_new",
      redirectUrl: "https://store.test/pay?_ptxn=txn_new",
      taxMode: "external",
    });
    const items = (sent as { items: { price: { tax_mode: string } }[] }).items;
    expect(items.map((item) => item.price.tax_mode)).toEqual(["external", "external"]);
  });
});

describe("fake gateway", () => {
  it("issues signed references and payment tokens", async () => {
    const created = await fake.createPayment({
      orderId: "order-1",
      orderNumber: 1,
      locale: "en",
      customerEmail: "a@b.test",
      currency: "USD",
      amountMinor: 1200,
      taxMinor: 0,
      lines: [],
      successUrl: "",
      cancelUrl: "",
      webhookUrl: "",
      description: "",
    });
    expect(created.redirectUrl).toMatch(
      /^http:\/\/localhost:3000\/en\/checkout\/fake\?reference=fake_/,
    );
    expect(decodeFakeReference(SECRET, created.reference)).toEqual({
      o: "order-1",
      a: 1200,
      c: "USD",
    });
    expect(
      decodeFakeReference("another-secret-that-is-long-enough!!", created.reference),
    ).toBeNull();
    expect(decodeFakeReference(SECRET, "fake_tampered.mac")).toBeNull();

    const token = fakePaymentToken(SECRET, created.reference, "paid", { amountMinor: 5 });
    expect(await fake.fetchPayment(token)).toMatchObject({
      reference: created.reference,
      state: "paid",
      amountMinor: 5,
      currency: "USD",
      orderId: "order-1",
    });
    await expect(fake.fetchPayment("fakepay_forged.mac")).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
  });

  it("verifies its webhook signature", async () => {
    const rawBody = JSON.stringify({ id: "evt", type: "payment.paid", payment: "fakepay_x" });
    const ok = await fake.verifyWebhook({
      rawBody,
      headers: new Headers({ [FAKE_SIGNATURE_HEADER]: signFakeWebhook(SECRET, rawBody) }),
    });
    expect(ok).toMatchObject({ eventId: "evt", kind: "payment", fetchRef: "fakepay_x" });
    await expect(fake.verifyWebhook({ rawBody, headers: new Headers() })).rejects.toBeInstanceOf(
      WebhookVerificationError,
    );
    const unknownType = JSON.stringify({ id: "evt", type: "payment.stolen", payment: "x" });
    await expect(
      fake.verifyWebhook({
        rawBody: unknownType,
        headers: new Headers({ [FAKE_SIGNATURE_HEADER]: signFakeWebhook(SECRET, unknownType) }),
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});
