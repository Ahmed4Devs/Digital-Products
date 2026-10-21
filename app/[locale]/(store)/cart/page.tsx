import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RemoveFromCartButton } from "@/components/cart/remove-from-cart-button";
import { EmptyState } from "@/components/catalog/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PriceDisplay } from "@/components/shared/price-display";
import { buttonVariants } from "@/components/ui/button";
import { readCart } from "@/features/cart/server";
import { findCheckoutItems } from "@/features/checkout/data";
import { getPublicStoreSettings } from "@/features/settings/queries";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { productHref } from "@/lib/seo/paths";
import { localized } from "@/lib/text";

// The cart reads its cookie, so its contents stream in at request time inside a static
// shell (spec §8.1). Prices shown here are informative; checkout recomputes everything.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.cart");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

async function CartContents() {
  const [locale, t, settings, ids] = await Promise.all([
    getLocale(),
    getTranslations("checkout.cart"),
    getPublicStoreSettings(),
    readCart(),
  ]);
  const { items, unavailableIds } = await findCheckoutItems(getDb(), ids, null);

  if (items.length === 0) {
    return (
      <EmptyState title={t("empty")}>
        <Link href="/products" className={buttonVariants()}>
          {t("browse")}
        </Link>
      </EmptyState>
    );
  }

  const subtotal = items.reduce((sum, item) => sum + item.priceUsdCents, 0);
  return (
    <div className="flex flex-col gap-6">
      {unavailableIds.length > 0 ? (
        <p className="text-sm text-muted-foreground">{t("unavailableNote")}</p>
      ) : null}
      <ul aria-label={t("items")} className="flex flex-col divide-y rounded-xl border">
        {items.map((item) => {
          const title = localized(locale, { ar: item.titleAr, en: item.titleEn });
          return (
            <li key={item.id} className="flex items-center justify-between gap-4 p-4">
              <Link
                href={productHref(item.slug)}
                className="font-medium underline-offset-4 hover:underline"
              >
                {title}
              </Link>
              <div className="flex items-center gap-3">
                <PriceDisplay
                  priceUsdCents={item.priceUsdCents}
                  fixedPriceSarHalalas={item.fixedPriceSarHalalas}
                  compareAtPriceUsdCents={null}
                  usdToSarRate={settings.usdToSarRate}
                  className="items-end text-end"
                />
                <RemoveFromCartButton productId={item.id} label={t("remove", { title })} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col items-end gap-3">
        <p className="text-lg font-semibold">
          {t("subtotal")}: <MoneyText locale={locale} amountMinor={subtotal} currency="USD" />
        </p>
        <Link href="/checkout" className={buttonVariants({ size: "lg" })}>
          {t("checkout")}
        </Link>
        <p className="text-sm text-muted-foreground">{t("signInNote")}</p>
      </div>
    </div>
  );
}

export default async function CartPage() {
  const t = await getTranslations("checkout.cart");
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
        <CartContents />
      </Suspense>
    </section>
  );
}
