import type { PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import { priceOrder, type OrderPricing } from "@/lib/money/order";
import type { PaymentProvider, ProviderId } from "@/lib/payments/types";
import { consumeRateLimit } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/security/keyed-hash";
import { localized } from "@/lib/text";
import { findUsableCoupon, reserveCoupon, type UsableCoupon } from "./coupons";
import { availableProviders, findCheckoutItems, findCheckoutSettings } from "./data";
import { closeOrder, fulfilOrder, lockOrder } from "./fulfilment";

// Order creation (spec §10.1 steps 4–6, §17.5 §6, §17.5 §9): prices are recomputed from
// the database, the order and its coupon reservation are written in one transaction,
// and only then is the payment created with the provider. Zero-total orders skip the
// gateway and are fulfilled in the same transaction.

/** Per-account and per-IP limits on order creation (spec §5.1). */
export const ORDER_LIMITS = {
  account: { windowSeconds: 10 * 60, max: 10 },
  ip: { windowSeconds: 10 * 60, max: 30 },
} as const;

/** Coupon checks per account, so codes cannot be guessed by trying them one by one. */
export const COUPON_CHECK_LIMIT = { windowSeconds: 10 * 60, max: 30 } as const;

/** Counts one coupon check for this customer; throws once the limit is reached. */
export async function limitCouponChecks(
  db: PrismaClient,
  secret: string,
  userId: string,
): Promise<void> {
  const { allowed } = await consumeRateLimit(
    db,
    keyedHash(secret, "coupon-check", userId),
    COUPON_CHECK_LIMIT,
  );
  if (!allowed) throw new ActionError("tooManyCouponAttempts", "couponCode");
}

export type PlaceOrderDeps = {
  db: PrismaClient;
  providers: Map<ProviderId, PaymentProvider>;
  secret: string;
  appUrl: string;
  now?: Date;
  /** Runs after a zero-total order has been fulfilled (the receipt email). */
  onFulfilled?: (orderId: string) => void;
};

export type PlaceOrderInput = {
  user: { id: string; email: string };
  locale: "ar" | "en";
  productIds: string[];
  providerId: ProviderId | null;
  couponCode: string | null;
  ip: string | null;
};

export type PlacedOrder = { orderId: string; redirectUrl: string; zeroTotal: boolean };

export type CheckoutQuote = {
  pricing: OrderPricing;
  coupon: UsableCoupon | null;
  provider: PaymentProvider | null;
};

/** Prices the customer's cart for a gateway, validating the coupon. No writes. */
export async function quoteCheckout(
  deps: Omit<PlaceOrderDeps, "secret" | "appUrl">,
  input: Omit<PlaceOrderInput, "ip" | "locale">,
) {
  const now = deps.now ?? new Date();
  const settings = await findCheckoutSettings(deps.db);
  const { items, owned, unavailableIds } = await findCheckoutItems(
    deps.db,
    input.productIds,
    input.user.id,
  );
  if (items.length === 0) throw new ActionError("cartEmpty");

  const available = availableProviders(deps.providers, settings);
  const provider = input.providerId
    ? (available.find((p) => p.id === input.providerId) ?? null)
    : null;
  if (input.providerId && !provider) throw new ActionError("gatewayUnavailable", "provider");

  const subtotal = items.reduce((sum, item) => sum + item.priceUsdCents, 0);
  const coupon = input.couponCode
    ? await findUsableCoupon(deps.db, input.couponCode, {
        userId: input.user.id,
        subtotalUsdCents: subtotal,
        now,
      })
    : null;

  const pricing = priceOrder({
    lines: items.map((item) => ({ ...item, productId: item.id })),
    coupon: coupon?.terms ?? null,
    tax: settings.tax,
    // Paddle is the Merchant of Record and charges its own tax (§17.5 §3).
    applyStoreTax: provider?.id !== "paddle",
    chargeCurrency: provider?.currency ?? "USD",
    usdToSarRate: settings.usdToSarRate,
  });
  return { settings, items, owned, unavailableIds, available, provider, coupon, pricing, now };
}

export async function placeOrder(
  deps: PlaceOrderDeps,
  input: PlaceOrderInput,
): Promise<PlacedOrder> {
  const { db } = deps;

  const limits = await Promise.all([
    consumeRateLimit(
      db,
      keyedHash(deps.secret, "order-account", input.user.id),
      ORDER_LIMITS.account,
    ),
    // Without a resolvable client IP (proxy headers not configured) a shared bucket would
    // throttle every customer at once; the per-account limit still applies.
    ...(input.ip
      ? [consumeRateLimit(db, keyedHash(deps.secret, "order-ip", input.ip), ORDER_LIMITS.ip)]
      : []),
  ]);
  if (limits.some((limit) => !limit.allowed)) throw new ActionError("tooManyOrders");

  const quote = await quoteCheckout(deps, input);
  const { pricing, provider, coupon, settings, items, now } = quote;
  const zeroTotal = pricing.totalUsdCents === 0;
  if (!zeroTotal) {
    if (!provider) throw new ActionError("chooseGateway", "provider");
    if (pricing.chargedAmountMinor < provider.minimumAmountMinor) {
      throw new ActionError("belowMinimum", "provider");
    }
  }

  const resultUrl = (orderId: string) => {
    const url = new URL(`/${input.locale}/checkout/result`, deps.appUrl);
    url.searchParams.set("order", orderId);
    return url.toString();
  };

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.user.id,
        customerEmailSnapshot: input.user.email,
        status: "pending",
        subtotalUsdCents: pricing.subtotalUsdCents,
        discountUsdCents: pricing.discountUsdCents,
        taxUsdCents: pricing.taxUsdCents,
        totalUsdCents: pricing.totalUsdCents,
        chargedCurrency: pricing.chargedCurrency,
        chargedAmountMinor: pricing.chargedAmountMinor,
        exchangeRateUsed: settings.usdToSarRate,
        couponId: coupon?.id ?? null,
        locale: input.locale,
        provider: zeroTotal ? null : provider!.id,
        items: {
          create: pricing.lines.map((line) => {
            const item = items.find((candidate) => candidate.id === line.productId)!;
            return {
              productId: line.productId,
              titleAr: item.titleAr,
              titleEn: item.titleEn,
              unitPriceUsdCents: line.unitPriceUsdCents,
              unitChargedMinor: line.unitChargedMinor,
            };
          }),
        },
      },
      select: { id: true, orderNumber: true },
    });
    if (coupon) {
      await reserveCoupon(tx, coupon, {
        orderId: created.id,
        userId: input.user.id,
        expiresAt: new Date(now.getTime() + settings.pendingOrderTtlMinutes * 60_000),
      });
    }
    if (zeroTotal) {
      // Free products and 100 % coupons: fulfilled now, never through a gateway (§17.5 §6).
      const locked = await lockOrder(tx, created.id);
      await fulfilOrder(tx, locked!, {}, now);
    }
    return created;
  });

  if (zeroTotal) {
    deps.onFulfilled?.(order.id);
    return { orderId: order.id, redirectUrl: resultUrl(order.id), zeroTotal: true };
  }

  const storeName = localized(input.locale, { ar: settings.storeNameAr, en: settings.storeNameEn });
  try {
    const payment = await provider!.createPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      locale: input.locale,
      customerEmail: input.user.email,
      currency: pricing.chargedCurrency,
      amountMinor: pricing.chargedAmountMinor,
      taxMinor: pricing.chargedTaxMinor,
      lines: pricing.lines.map((line) => {
        const item = items.find((candidate) => candidate.id === line.productId)!;
        return {
          productId: line.productId,
          title: localized(input.locale, { ar: item.titleAr, en: item.titleEn }),
          unitAmountMinor: line.unitChargedMinor,
        };
      }),
      successUrl: resultUrl(order.id),
      cancelUrl: new URL(`/${input.locale}/cart`, deps.appUrl).toString(),
      webhookUrl: new URL(`/api/webhooks/${provider!.id}`, deps.appUrl).toString(),
      description: `${storeName} #${order.orderNumber}`.trim(),
    });
    await db.order.update({
      where: { id: order.id },
      data: { providerReference: payment.reference, providerTaxMode: payment.taxMode ?? null },
    });
    return { orderId: order.id, redirectUrl: payment.redirectUrl, zeroTotal: false };
  } catch (error) {
    await db.$transaction((tx) => closeOrder(tx, order.id, "failed"));
    console.error("Payment creation failed", error instanceof Error ? error.message : "unknown");
    throw new ActionError("paymentUnavailable");
  }
}
