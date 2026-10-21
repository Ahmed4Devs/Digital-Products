import "server-only";
import { appUrl } from "@/lib/env/public";
import type { ServerEnv } from "@/lib/env/schema";
import { serverEnv } from "@/lib/env/server";
import { createFakeProvider } from "./fake";
import { createMoyasarProvider } from "./moyasar";
import { createPaddleProvider } from "./paddle";
import { createPayPalProvider } from "./paypal";
import type { PaymentProvider, ProviderId } from "./types";

export type { PaymentProvider, ProviderId } from "./types";

/** The gateways whose credentials are configured (the owner still has to enable them). */
export function createConfiguredProviders(env: ServerEnv): Map<ProviderId, PaymentProvider> {
  const providers = new Map<ProviderId, PaymentProvider>();
  const base = env.APP_URL;

  if (env.MOYASAR_SECRET_KEY && env.MOYASAR_WEBHOOK_SECRET) {
    providers.set(
      "moyasar",
      createMoyasarProvider({
        secretKey: env.MOYASAR_SECRET_KEY,
        webhookSecret: env.MOYASAR_WEBHOOK_SECRET,
      }),
    );
  }
  if (env.PADDLE_API_KEY && env.PADDLE_CLIENT_TOKEN && env.PADDLE_WEBHOOK_SECRET) {
    providers.set(
      "paddle",
      createPaddleProvider({
        apiKey: env.PADDLE_API_KEY,
        webhookSecret: env.PADDLE_WEBHOOK_SECRET,
        environment: env.PADDLE_ENVIRONMENT,
        taxMode: env.PADDLE_TAX_MODE,
        taxCategory: env.PADDLE_TAX_CATEGORY,
        checkoutPageUrl: ({ locale, orderId, transactionId }) => {
          const url = new URL(`/${locale}/checkout/paddle`, base);
          url.searchParams.set("order", orderId);
          url.searchParams.set("_ptxn", transactionId);
          return url.toString();
        },
      }),
    );
  }
  if (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID) {
    providers.set(
      "paypal",
      createPayPalProvider({
        clientId: env.PAYPAL_CLIENT_ID,
        clientSecret: env.PAYPAL_CLIENT_SECRET,
        webhookId: env.PAYPAL_WEBHOOK_ID,
        environment: env.PAYPAL_ENVIRONMENT,
        brandName: new URL(base).hostname,
      }),
    );
  }
  // Never on a deployed server: TEST_DOUBLES is refused unless APP_URL is loopback.
  if (env.TEST_DOUBLES === "on") {
    providers.set("fake", createFakeProvider({ secret: env.BETTER_AUTH_SECRET, appUrl: base }));
  }
  return providers;
}

let providers: Map<ProviderId, PaymentProvider> | undefined;

export function configuredProviders(): Map<ProviderId, PaymentProvider> {
  providers ??= createConfiguredProviders(serverEnv());
  return providers;
}

export function webhookUrl(provider: ProviderId): string {
  return new URL(`/api/webhooks/${provider}`, appUrl()).toString();
}
