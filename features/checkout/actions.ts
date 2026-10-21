"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { readCart, writeCart } from "@/features/cart/server";
import { queueReceipt } from "@/features/orders/receipt";
import { actionFailure, type ActionState } from "@/lib/actions";
import { getSessionUser, type SessionUser } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { configuredProviders } from "@/lib/payments";
import {
  decodeFakeReference,
  FAKE_SIGNATURE_HEADER,
  fakePaymentToken,
  signFakeWebhook,
} from "@/lib/payments/fake";
import { clientIp } from "@/lib/security/client-ip";
import { limitCouponChecks, placeOrder, quoteCheckout } from "./orders";

// Checkout Server Actions. They re-check the customer themselves (hidden UI is not
// security) and never trust prices from the browser: everything is recomputed from the
// cart's product IDs. Actions cannot read the URL's locale, so forms send it.

const localeSchema = z.enum(["ar", "en"]);
const providerSchema = z.enum(["moyasar", "paddle", "paypal", "fake"]).nullable();
const couponSchema = z.string().trim().max(60);

/** The signed-in, verified customer, or the reason to send them to sign in. */
async function checkoutCustomer(): Promise<SessionUser | ActionState> {
  const user = await getSessionUser({ fresh: true });
  if (!user || user.role !== "customer") return { status: "error", message: "signInRequired" };
  if (!user.emailVerified) return { status: "error", message: "verifyRequired" };
  return user;
}

function isUser(value: SessionUser | ActionState): value is SessionUser {
  return "id" in value;
}

function dependencies() {
  const env = serverEnv();
  return {
    db: getDb(),
    providers: configuredProviders(),
    secret: env.BETTER_AUTH_SECRET,
    appUrl: env.APP_URL,
    onFulfilled: queueReceipt,
  };
}

export type CheckoutQuoteView = {
  subtotalUsdCents: number;
  discountUsdCents: number;
  taxUsdCents: number;
  totalUsdCents: number;
  chargedCurrency: "USD" | "SAR";
  chargedAmountMinor: number;
};

export async function quoteCheckoutAction(input: {
  providerId: string | null;
  couponCode: string;
}): Promise<ActionState & { quote?: CheckoutQuoteView }> {
  const user = await checkoutCustomer();
  if (!isUser(user)) return user;
  try {
    const providerId = providerSchema.parse(input.providerId || null);
    const couponCode = couponSchema.parse(input.couponCode) || null;
    if (couponCode) await limitCouponChecks(getDb(), serverEnv().BETTER_AUTH_SECRET, user.id);
    const { pricing } = await quoteCheckout(
      { db: getDb(), providers: configuredProviders() },
      { user, productIds: await readCart(), providerId, couponCode },
    );
    return {
      status: "success",
      message: couponCode ? "couponApplied" : undefined,
      quote: {
        subtotalUsdCents: pricing.subtotalUsdCents,
        discountUsdCents: pricing.discountUsdCents,
        taxUsdCents: pricing.taxUsdCents,
        totalUsdCents: pricing.totalUsdCents,
        chargedCurrency: pricing.chargedCurrency,
        chargedAmountMinor: pricing.chargedAmountMinor,
      },
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function placeOrderAction(input: {
  providerId: string | null;
  couponCode: string;
  locale: string;
}): Promise<ActionState & { redirectUrl?: string }> {
  const user = await checkoutCustomer();
  if (!isUser(user)) return user;
  try {
    const env = serverEnv();
    const productIds = await readCart();
    const placed = await placeOrder(dependencies(), {
      user,
      locale: localeSchema.parse(input.locale),
      productIds,
      providerId: providerSchema.parse(input.providerId || null),
      couponCode: couponSchema.parse(input.couponCode) || null,
      ip: clientIp(await headers(), {
        ipHeaders: env.AUTH_IP_HEADERS,
        trustedProxies: env.AUTH_TRUSTED_PROXIES,
      }),
    });
    if (placed.zeroTotal) await writeCart([]);
    return { status: "success", id: placed.orderId, redirectUrl: placed.redirectUrl };
  } catch (error) {
    return actionFailure(error);
  }
}

/** "Get it" for a free product: a zero-total order, fulfilled at once (§17.5 §6). */
export async function claimFreeProductAction(
  productId: string,
  locale: string,
): Promise<ActionState & { redirectUrl?: string }> {
  const user = await checkoutCustomer();
  if (!isUser(user)) return user;
  try {
    const env = serverEnv();
    const id = z.uuid().parse(productId);
    const product = await getDb().product.findFirst({
      where: { id, status: "published", priceUsdCents: 0 },
      select: { id: true },
    });
    if (!product) return { status: "error", message: "unavailable" };
    const placed = await placeOrder(dependencies(), {
      user,
      locale: localeSchema.parse(locale),
      productIds: [product.id],
      providerId: null,
      couponCode: null,
      ip: clientIp(await headers(), {
        ipHeaders: env.AUTH_IP_HEADERS,
        trustedProxies: env.AUTH_TRUSTED_PROXIES,
      }),
    });
    return { status: "success", id: placed.orderId, redirectUrl: placed.redirectUrl };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Removes a paid order's products from the cart (called by the result page). */
export async function clearPurchasedFromCartAction(orderId: string): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { status: "error", message: "signInRequired" };
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { status: "error", message: "invalid" };
  const order = await getDb().order.findFirst({
    where: { id: id.data, userId: user.id, status: "paid" },
    select: { items: { select: { productId: true } } },
  });
  if (!order) return { status: "error", message: "invalid" };
  const purchased = new Set(order.items.map((item) => item.productId));
  await writeCart((await readCart()).filter((productId) => !purchased.has(productId)));
  return { status: "success" };
}

/**
 * Asks PayPal to capture an approved order when the customer returns. This changes
 * nothing in the store: the capture-completed webhook marks the order paid. The
 * CHECKOUT.ORDER.APPROVED webhook does the same if the customer never returns.
 */
export async function capturePayPalAction(orderId: string): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { status: "error", message: "signInRequired" };
  const id = z.uuid().safeParse(orderId);
  const paypal = configuredProviders().get("paypal");
  if (!id.success || !paypal?.capture) return { status: "error", message: "invalid" };
  const order = await getDb().order.findFirst({
    where: { id: id.data, userId: user.id, provider: "paypal", status: "pending" },
    select: { id: true, providerReference: true },
  });
  if (!order?.providerReference) return { status: "error", message: "invalid" };
  try {
    await paypal.capture(order.providerReference, order.id);
    return { status: "success" };
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * The fake gateway's "Pay" / "Fail" buttons (TEST_DOUBLES only): sends a signed webhook
 * to the store's own endpoint, exactly as a provider would.
 */
export async function completeFakePaymentAction(input: {
  reference: string;
  outcome: "paid" | "failed";
  locale: string;
}): Promise<ActionState & { redirectUrl?: string }> {
  const env = serverEnv();
  const user = await getSessionUser();
  if (!configuredProviders().has("fake") || !user) return { status: "error", message: "invalid" };
  const decoded = decodeFakeReference(env.BETTER_AUTH_SECRET, input.reference);
  const outcome = z.enum(["paid", "failed"]).safeParse(input.outcome);
  const locale = localeSchema.safeParse(input.locale);
  if (!decoded || !outcome.success || !locale.success)
    return { status: "error", message: "invalid" };

  const order = await getDb().order.findFirst({
    where: { id: decoded.o, userId: user.id },
    select: { id: true },
  });
  if (!order) return { status: "error", message: "invalid" };

  const rawBody = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: outcome.data === "paid" ? "payment.paid" : "payment.failed",
    payment: fakePaymentToken(env.BETTER_AUTH_SECRET, input.reference, outcome.data),
  });
  const response = await fetch(new URL("/api/webhooks/fake", env.APP_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [FAKE_SIGNATURE_HEADER]: signFakeWebhook(env.BETTER_AUTH_SECRET, rawBody),
    },
    body: rawBody,
    cache: "no-store",
  });
  if (!response.ok) return { status: "error", message: "unexpected" };

  const result = new URL(`/${locale.data}/checkout/result`, env.APP_URL);
  result.searchParams.set("order", order.id);
  return { status: "success", redirectUrl: result.toString() };
}
