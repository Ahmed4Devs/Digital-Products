import { getLocale, getTranslations } from "next-intl/server";
import type { CategorySummary } from "@/features/products/types";
import { Link } from "@/i18n/navigation";
import { localized } from "@/lib/text";

export function categoryHref(slug: string): string {
  return `/categories/${encodeURIComponent(slug)}`;
}

export async function CategoryList({ categories }: { categories: CategorySummary[] }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("store.category")]);

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={categoryHref(category.slug)}
            className="flex h-full flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="font-semibold">
              {localized(locale, { ar: category.nameAr, en: category.nameEn })}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("productCount", { count: category.productCount })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
