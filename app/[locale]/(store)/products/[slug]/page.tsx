import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { categoryHref } from "@/components/catalog/category-list";
import { productHref } from "@/components/catalog/product-card";
import { ProductImage } from "@/components/catalog/product-image";
import { ProductJsonLd } from "@/components/catalog/product-json-ld";
import { EmojiText } from "@/components/shared/emoji-text";
import { PriceDisplay } from "@/components/shared/price-display";
import { RichText } from "@/components/shared/rich-text";
import { getProductBySlug, getPublishedProductSlugs } from "@/features/products/queries";
import { getPublicStoreSettings } from "@/features/settings/queries";
import { publicImageUrl } from "@/lib/env/public";
import { pageMetadata } from "@/lib/seo/metadata";
import { decodeSlugParam, PLACEHOLDER_SLUG } from "@/lib/seo/params";
import { localized } from "@/lib/text";

// Prerendered per product and locale; the build fails if request-time code leaks in
// (spec §12). Products published later are rendered on their first visit and then
// served statically; owner edits invalidate them by tag (Phase 5).
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  const products = await getPublishedProductSlugs();
  if (products.length === 0) return [{ slug: PLACEHOLDER_SLUG }];
  return products.map(({ slug }) => ({ slug }));
}

async function loadProduct(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return getProductBySlug(decodeSlugParam(slug));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const [locale, product, common] = await Promise.all([
    getLocale(),
    loadProduct(params),
    getTranslations("common"),
  ]);
  if (!product) return {};

  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });
  const seoTitle = localized(locale, { ar: product.seoTitleAr, en: product.seoTitleEn });
  const description =
    localized(locale, { ar: product.seoDescriptionAr, en: product.seoDescriptionEn }) ||
    localized(locale, { ar: product.shortDescriptionAr, en: product.shortDescriptionEn });
  const coverUrl = product.cover ? publicImageUrl(product.cover.storageKey) : null;

  return pageMetadata({
    locale,
    path: productHref(product.slug),
    title: seoTitle || title,
    description,
    siteName: common("storeName"),
    images:
      product.cover && coverUrl
        ? [{ url: coverUrl, width: product.cover.width, height: product.cover.height, alt: title }]
        : undefined,
  });
}

export default async function ProductPage({ params }: PageProps<"/[locale]/products/[slug]">) {
  const [locale, product, settings, t] = await Promise.all([
    getLocale(),
    loadProduct(params),
    getPublicStoreSettings(),
    getTranslations("store.product"),
  ]);
  if (!product) notFound();

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
      <ProductJsonLd
        product={product}
        name={title}
        description={shortDescription}
        path={`/${locale}${productHref(product.slug)}`}
      />
      <Breadcrumbs
        label={t("breadcrumb")}
        items={[
          { label: t("home"), href: "/" },
          ...(product.category && categoryName
            ? [{ label: categoryName, href: categoryHref(product.category.slug) }]
            : []),
          { label: title },
        ]}
      />

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
            usdToSarRate={settings.usdToSarRate}
          />
          {/* Add-to-cart arrives with the cart and checkout in Phase 6. */}
          <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">{t("purchaseSoon")}</p>
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
