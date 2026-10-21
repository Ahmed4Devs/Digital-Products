import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CategoryList } from "@/components/catalog/category-list";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SectionHeading } from "@/components/catalog/section-heading";
import { EmojiText } from "@/components/shared/emoji-text";
import { buttonVariants } from "@/components/ui/button";
import { getCategories } from "@/features/categories/queries";
import { getFeaturedProducts, getNewestProducts } from "@/features/products/queries";
import { getStoreBranding } from "@/features/settings/branding";
import { getPublicStoreSettings } from "@/features/settings/queries";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo/metadata";

// Fully static: the build fails if request-time code ever leaks into the home page.
export const ensureStatic = "navigation";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t, common, branding] = await Promise.all([
    getLocale(),
    getTranslations("store.home"),
    getTranslations("common"),
    getStoreBranding(),
  ]);
  return pageMetadata({
    locale,
    path: "/",
    title: { absolute: branding.name },
    description: common("metadata.description"),
    openGraphTitle: t("title"),
  });
}

export default async function HomePage() {
  const [t, featured, newest, categories, settings] = await Promise.all([
    getTranslations("store.home"),
    getFeaturedProducts(),
    getNewestProducts(),
    getCategories(),
    getPublicStoreSettings(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pb-20 sm:px-6">
      <section className="flex flex-col items-center gap-4 pt-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          <EmojiText text={t("title")} />
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          <EmojiText text={t("tagline")} />
        </p>
        <Link href="/products" className={buttonVariants({ size: "lg", className: "mt-2 px-6" })}>
          {t("browseAll")}
        </Link>
      </section>

      {featured.length > 0 ? (
        <section aria-labelledby="featured-heading">
          <SectionHeading id="featured-heading" title={t("featuredTitle")} />
          <ProductGrid products={featured} usdToSarRate={settings.usdToSarRate} />
        </section>
      ) : null}

      {categories.length > 0 ? (
        <section aria-labelledby="categories-heading">
          <SectionHeading id="categories-heading" title={t("categoriesTitle")} />
          <CategoryList categories={categories} />
        </section>
      ) : null}

      {newest.length > 0 ? (
        <section aria-labelledby="newest-heading">
          <SectionHeading
            id="newest-heading"
            title={t("newestTitle")}
            link={{ href: "/products", label: t("viewAll") }}
          />
          <ProductGrid products={newest} usdToSarRate={settings.usdToSarRate} />
        </section>
      ) : null}
    </div>
  );
}
