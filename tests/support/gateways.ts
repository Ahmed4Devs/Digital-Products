import { createHmac } from "node:crypto";
import { vi } from "vitest";
import { createFakeProvider } from "@/lib/payments/fake";
import { createMoyasarProvider } from "@/lib/payments/moyasar";
import { createPaddleProvider } from "@/lib/payments/paddle";
import { createPayPalProvider } from "@/lib/payments/paypal";
import type { PaymentProvider, ProviderId } from "@/lib/payments/types";

// Stand-ins for the gateways' HTTP APIs: tests register JSON answers per method + URL
// and inspect what the adapters sent. No request ever leaves the machine.

type Handler = (request: { url: URL; method: string; body: string; headers: Headers }) => {
  status?: number;
  json?: unknown;
};

export type RecordedRequest = { method: string; url: string; body: string; headers: Headers };

export class GatewayStub {
  private routes = new Map<string, Handler>();
  readonly requests: RecordedRequest[] = [];

  on(method: string, url: string, handler: Handler | { status?: number; json?: unknown }): this {
    this.routes.set(`${method} ${url}`, typeof handler === "function" ? handler : () => handler);
    return this;
  }

  reset(): void {
    this.routes.clear();
    this.requests.length = 0;
  }

  install(): void {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? init.body : "";
      const headers = new Headers(init.headers);
      this.requests.push({ method, url: url.toString(), body, headers });
      const handler = this.routes.get(`${method} ${url.origin}${url.pathname}`);
      if (!handler) return new Response(JSON.stringify({ error: "not stubbed" }), { status: 599 });
      const answer = handler({ url, method, body, headers });
      return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200 });
    });
  }

  last(method: string, path: string): RecordedRequest | undefined {
    return this.requests.findLast(
      (request) => request.method === method && request.url.includes(path),
    );
  }
}

export const TEST_GATEWAY_CONFIG = {
  moyasar: { secretKey: "sk_test_store", webhookSecret: "moyasar-shared-secret-123" },
  paddle: { apiKey: "pdl_sdbx_apikey", webhookSecret: "pdl_ntfset_secret" },
  paypal: { clientId: "paypal-client", clientSecret: "paypal-secret", webhookId: "WH-STORE" },
  secret: "integration-test-secret-that-is-long-enough",
  appUrl: "http://localhost:3000",
} as const;

export function testProviders(): Map<ProviderId, PaymentProvider> {
  const config = TEST_GATEWAY_CONFIG;
  return new Map<ProviderId, PaymentProvider>([
    ["moyasar", createMoyasarProvider(config.moyasar)],
    [
      "paddle",
      createPaddleProvider({
        ...config.paddle,
        environment: "sandbox",
        taxMode: "internal",
        taxCategory: "standard",
        checkoutPageUrl: ({ locale, transactionId }) =>
          `${config.appUrl}/${locale}/checkout/paddle?_ptxn=${transactionId}`,
      }),
    ],
    [
      "paypal",
      createPayPalProvider({ ...config.paypal, environment: "sandbox", brandName: "Store" }),
    ],
    ["fake", createFakeProvider({ secret: config.secret, appUrl: config.appUrl })],
  ]);
}

export function paddleSignature(
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const h1 = createHmac("sha256", TEST_GATEWAY_CONFIG.paddle.webhookSecret)
    .update(`${timestamp}:${rawBody}`)
    .digest("hex");
  return `ts=${timestamp};h1=${h1}`;
}

export const PAYPAL_HEADERS = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-transmission-id": "transmission-1",
  "paypal-transmission-sig": "c2lnbmF0dXJl",
  "paypal-transmission-time": "2026-10-21T10:00:00Z",
};
