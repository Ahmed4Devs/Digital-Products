import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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

// The App Shell is shared by every product, so the slug is read inside <Suspense>.
export default function ProductPage({ params }: PageProps<"/[locale]/products/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: Pick<PageProps<"/[locale]/products/[slug]">, "params">) {
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

/** Footprint of ProductDetailView: breadcrumbs, then the 4:3 cover beside the details. */
function ProductSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-8 px-4 py-10 sm:px-6"
    >
      <div className="h-5 w-56 rounded bg-muted" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-4/3 rounded-xl bg-muted" />
        <div className="flex flex-col gap-4">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-9 w-3/4 rounded-lg bg-muted" />
          <div className="h-6 rounded bg-muted" />
          <div className="h-8 w-32 rounded-lg bg-muted" />
          <div className="h-10 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
