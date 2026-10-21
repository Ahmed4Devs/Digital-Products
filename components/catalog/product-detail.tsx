import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EmojiText } from "@/components/shared/emoji-text";
import { PriceDisplay } from "@/components/shared/price-display";
import { RichText } from "@/components/shared/rich-text";
import type { ProductDetail } from "@/features/products/types";
import { localized } from "@/lib/text";
import { ProductImage } from "./product-image";

type ProductDetailViewProps = {
  product: ProductDetail;
  locale: Locale;
  usdToSarRate: string;
  /** Breadcrumbs or a preview banner above the product. */
  header?: ReactNode;
  /** The purchase area under the price. */
  purchase?: ReactNode;
};

/**
 * The product page body, shared by the storefront and the owner's preview so a preview
 * shows exactly what customers will see.
 */
export async function ProductDetailView({
  product,
  locale,
  usdToSarRate,
  header,
  purchase,
}: ProductDetailViewProps) {
  const t = await getTranslations("store.product");
  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });
  const shortDescription = localized(locale, {
    ar: product.shortDescriptionAr,
    en: product.shortDescriptionEn,
  });
  const description = localized(locale, { ar: product.descriptionAr, en: product.descriptionEn });
  const categoryName = product.category
    ? localized(locale, { ar: product.category.nameAr, en: product.category.nameEn })
    : null;

  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      {header}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <ProductImage
            image={product.cover}
            title={title}
            locale={locale}
            sizes="(min-width: 1024px) 50vw, 100vw"
            preload
            className="rounded-xl border"
          />
          {product.gallery.length > 0 ? (
            <ul aria-label={t("gallery")} className="grid grid-cols-3 gap-3">
              {product.gallery.map((image) => (
                <li key={image.storageKey}>
                  <ProductImage
                    image={image}
                    title={title}
                    locale={locale}
                    sizes="(min-width: 1024px) 16vw, 33vw"
                    className="rounded-lg border"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {categoryName ? (
            <p className="text-sm font-medium text-muted-foreground">{categoryName}</p>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            <EmojiText text={title} />
          </h1>
          {shortDescription ? (
            <p className="text-lg text-muted-foreground">
              <EmojiText text={shortDescription} />
            </p>
          ) : null}
          <PriceDisplay
            size="lg"
            priceUsdCents={product.priceUsdCents}
            fixedPriceSarHalalas={product.fixedPriceSarHalalas}
            compareAtPriceUsdCents={product.compareAtPriceUsdCents}
            usdToSarRate={usdToSarRate}
          />
          {purchase}
          <p className="text-sm text-muted-foreground">{t("digitalDelivery")}</p>
        </div>
      </div>

      {description ? (
        <section aria-labelledby="description-heading" className="max-w-3xl">
          <h2 id="description-heading" className="text-xl font-semibold">
            {t("description")}
          </h2>
          <RichText html={description} />
        </section>
      ) : null}
    </article>
  );
}
