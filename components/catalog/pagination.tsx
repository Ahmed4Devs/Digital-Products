import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { productSearchQuery, type ProductSearch } from "@/features/products/search-params";
import { Link } from "@/i18n/navigation";

export async function Pagination({
  search,
  pageCount,
}: {
  search: ProductSearch;
  pageCount: number;
}) {
  const t = await getTranslations("store.products");
  if (pageCount <= 1) return null;

  const hrefFor = (page: number) => ({
    pathname: "/products",
    query: productSearchQuery({ ...search, page }),
  });

  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-center gap-3">
      {search.page > 1 ? (
        <Link
          href={hrefFor(search.page - 1)}
          rel="prev"
          className={buttonVariants({ variant: "outline" })}
        >
          {/* Chevrons point along the reading direction, so they flip in RTL. */}
          <ChevronLeftIcon aria-hidden="true" className="rtl:-scale-x-100" />
          {t("previous")}
        </Link>
      ) : null}
      <p className="text-sm text-muted-foreground" aria-current="page">
        {t("pageStatus", { page: search.page, pageCount })}
      </p>
      {search.page < pageCount ? (
        <Link
          href={hrefFor(search.page + 1)}
          rel="next"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("next")}
          <ChevronRightIcon aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
      ) : null}
    </nav>
  );
}
