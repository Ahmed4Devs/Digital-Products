import { SearchIcon } from "lucide-react";
import type { Route } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategorySummary } from "@/features/products/types";
import { PRODUCT_SORTS, type ProductSearch } from "@/features/products/search-params";
import { getPathname } from "@/i18n/navigation";
import { localized } from "@/lib/text";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Search, category and sort. A plain GET form: it works without JavaScript, and
 * next/form turns submissions into client-side navigations. Submitting resets the page.
 */
export async function ProductFilters({
  search,
  categories,
}: {
  search: ProductSearch;
  categories: CategorySummary[];
}) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("store.products")]);

  return (
    <Form
      // A localized path ("/ar/products") of the typed route /[locale]/products.
      action={getPathname({ href: "/products", locale }) as Route}
      role="search"
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="product-search">{t("searchLabel")}</Label>
        <Input
          id="product-search"
          name="q"
          type="search"
          defaultValue={search.q}
          placeholder={t("searchPlaceholder")}
          maxLength={100}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="product-category">{t("categoryLabel")}</Label>
        <select
          id="product-category"
          name="category"
          defaultValue={search.category}
          className={selectClass}
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {localized(locale, { ar: category.nameAr, en: category.nameEn })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="product-sort">{t("sortLabel")}</Label>
        <select id="product-sort" name="sort" defaultValue={search.sort} className={selectClass}>
          {PRODUCT_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sort.${sort}`)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="lg">
        <SearchIcon aria-hidden="true" />
        {t("submit")}
      </Button>
    </Form>
  );
}
