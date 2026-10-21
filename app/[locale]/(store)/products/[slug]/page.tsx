import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PurchaseButton } from "@/components/cart/purchase-button";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductDetailView } from "@/components/catalog/product-detail";
import { categoryHref, productHref } from "@/lib/seo/paths";
import { ProductJsonLd } from "@/components/catalog/product-json-ld";
import { getProductBySlug, getPublishedProductSlugs } from "@/features/products/queries";
import { getStoreBranding } from "@/features/settings/branding";
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
  const [locale, product, branding] = await Promise.all([
    getLocale(),
    loadProduct(params),
    getStoreBranding(),
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
    siteName: branding.name,
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
  const categoryName = product.category
    ? localized(locale, { ar: product.category.nameAr, en: product.category.nameEn })
    : null;

  return (
    <ProductDetailView
      product={product}
      locale={locale}
      usdToSarRate={settings.usdToSarRate}
      header={
        <>
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
        </>
      }
      purchase={
        <PurchaseButton
          productId={product.id}
          slug={product.slug}
          free={product.priceUsdCents === 0}
        />
      }
    />
  );
}
