import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { categoryHref } from "@/components/catalog/category-list";
import { EmptyState } from "@/components/catalog/empty-state";
import { ProductGrid } from "@/components/catalog/product-grid";
import { getCategories, getCategoryBySlug } from "@/features/categories/queries";
import { getCategoryProducts } from "@/features/products/queries";
import { getPublicStoreSettings } from "@/features/settings/queries";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo/metadata";
import { decodeSlugParam, PLACEHOLDER_SLUG } from "@/lib/seo/params";
import { localized } from "@/lib/text";

// Prerendered per category and locale (spec §8.1). Shows up to CATEGORY_PAGE_LIMIT
// products; the full, paginated list is /products?category=…
export const ensureStatic = "navigation";

const CATEGORY_PAGE_LIMIT = 48;

export async function generateStaticParams() {
  const categories = await getCategories();
  if (categories.length === 0) return [{ slug: PLACEHOLDER_SLUG }];
  return categories.map(({ slug }) => ({ slug }));
}

async function loadCategory(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  return getCategoryBySlug(decodeSlugParam(slug));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/categories/[slug]">): Promise<Metadata> {
  const [locale, category, t] = await Promise.all([
    getLocale(),
    loadCategory(params),
    getTranslations("store.category"),
  ]);
  if (!category) return {};

  const name = localized(locale, { ar: category.nameAr, en: category.nameEn });
  return pageMetadata({
    locale,
    path: categoryHref(category.slug),
    title: name,
    description: t("metadataDescription", { name }),
  });
}

export default async function CategoryPage({ params }: PageProps<"/[locale]/categories/[slug]">) {
  const [locale, category, settings, t, product] = await Promise.all([
    getLocale(),
    loadCategory(params),
    getPublicStoreSettings(),
    getTranslations("store.category"),
    getTranslations("store.product"),
  ]);
  if (!category) notFound();

  const products = await getCategoryProducts(category.id, CATEGORY_PAGE_LIMIT + 1);
  const name = localized(locale, { ar: category.nameAr, en: category.nameEn });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Breadcrumbs
        label={product("breadcrumb")}
        items={[{ label: product("home"), href: "/" }, { label: name }]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      {products.length > 0 ? (
        <>
          <ProductGrid
            products={products.slice(0, CATEGORY_PAGE_LIMIT)}
            usdToSarRate={settings.usdToSarRate}
          />
          {products.length > CATEGORY_PAGE_LIMIT ? (
            <Link
              href={{ pathname: "/products", query: { category: category.slug } }}
              className="self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("viewAllInCategory")}
            </Link>
          ) : null}
        </>
      ) : (
        <EmptyState title={t("empty")} />
      )}
    </div>
  );
}
