import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { EmptyState } from "@/components/catalog/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { buttonVariants } from "@/components/ui/button";
import { readCart } from "@/features/cart/server";
import { quoteCheckout } from "@/features/checkout/orders";
import { Link } from "@/i18n/navigation";
import { ActionError } from "@/lib/actions";
import { requireVerifiedCustomer } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { configuredProviders } from "@/lib/payments";
import { localized } from "@/lib/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.page");
  return { title: t("metadataTitle") };
}

async function initialQuote(user: { id: string; email: string }, productIds: string[]) {
  const deps = { db: getDb(), providers: configuredProviders() };
  try {
    const first = await quoteCheckout(deps, {
      user,
      productIds,
      providerId: null,
      couponCode: null,
    });
    const providerId = first.available[0]?.id ?? null;
    return providerId
      ? await quoteCheckout(deps, { user, productIds, providerId, couponCode: null })
      : first;
  } catch (error) {
    if (error instanceof ActionError && error.messageKey === "cartEmpty") return null;
    throw error;
  }
}

export default async function CheckoutPage() {
  const user = await requireVerifiedCustomer({ next: "/checkout" });
  const [locale, t] = await Promise.all([getLocale(), getTranslations("checkout.page")]);
  const quote = await initialQuote(user, await readCart());

  if (!quote) {
    const cart = await getTranslations("checkout.cart");
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <EmptyState title={cart("empty")}>
          <Link href="/products" className={buttonVariants()}>
            {cart("browse")}
          </Link>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_24rem]">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        {quote.owned.length > 0 ? (
          <p className="text-sm text-muted-foreground">{t("ownedNote")}</p>
        ) : null}
        <h2 className="text-lg font-semibold">{t("summary")}</h2>
        <ul className="flex flex-col divide-y rounded-xl border">
          {quote.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 p-4">
              <span className="font-medium">
                {localized(locale, { ar: item.titleAr, en: item.titleEn })}
              </span>
              <MoneyText locale={locale} amountMinor={item.priceUsdCents} currency="USD" />
            </li>
          ))}
        </ul>
        <Link
          href="/cart"
          className={buttonVariants({ variant: "ghost", className: "self-start" })}
        >
          {t("backToCart")}
        </Link>
      </div>
      <CheckoutForm
        providers={quote.available.map((provider) => ({
          id: provider.id,
          currency: provider.currency,
        }))}
        initialProviderId={quote.provider?.id ?? null}
        initialQuote={{
          subtotalUsdCents: quote.pricing.subtotalUsdCents,
          discountUsdCents: quote.pricing.discountUsdCents,
          taxUsdCents: quote.pricing.taxUsdCents,
          totalUsdCents: quote.pricing.totalUsdCents,
          chargedCurrency: quote.pricing.chargedCurrency,
          chargedAmountMinor: quote.pricing.chargedAmountMinor,
        }}
      />
    </section>
  );
}
