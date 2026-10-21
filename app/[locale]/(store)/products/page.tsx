import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/catalog/empty-state";
import { Pagination } from "@/components/catalog/pagination";
import { ProductFilters } from "@/components/catalog/product-filters";
import { ProductGrid } from "@/components/catalog/product-grid";
import { getCategories } from "@/features/categories/queries";
import { searchProducts } from "@/features/products/queries";
import { parseProductSearch } from "@/features/products/search-params";
import { getPublicStoreSettings } from "@/features/settings/queries";
import { Link } from "@/i18n/navigation";
import { pageMetadata } from "@/lib/seo/metadata";

// Static shell (heading) with request-time results: the query string is only known per
// request (spec §8.1). Search results are cached per query in features/products.

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("store.products")]);
  return pageMetadata({
    locale,
    path: "/products",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

async function ProductResults({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const search = parseProductSearch(await searchParams);
  const [t, results, categories, settings] = await Promise.all([
    getTranslations("store.products"),
    searchProducts(search),
    getCategories(),
    getPublicStoreSettings(),
  ]);
  const filtered = Boolean(search.q || search.category);

  return (
    <div className="flex flex-col gap-6">
      <ProductFilters search={search} categories={categories} />
      <p className="text-sm text-muted-foreground" role="status">
        {t("resultCount", { count: results.total })}
      </p>
      {results.items.length > 0 ? (
        <ProductGrid products={results.items} usdToSarRate={settings.usdToSarRate} />
      ) : (
        <EmptyState title={t("noResults")}>
          <p className="text-sm text-muted-foreground">{t("noResultsHint")}</p>
          {filtered || search.page > 1 ? (
            <Link
              href="/products"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("clearFilters")}
            </Link>
          ) : null}
        </EmptyState>
      )}
      <Pagination search={search} pageCount={results.pageCount} />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="h-24 rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-72 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

export default async function ProductsPage({ searchParams }: PageProps<"/[locale]/products">) {
  const t = await getTranslations("store.products");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <ProductResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
