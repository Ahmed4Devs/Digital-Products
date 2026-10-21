import type { MetadataRoute } from "next";
import { categoryHref, productHref } from "@/lib/seo/paths";
import { getCategories } from "@/features/categories/queries";
import { getPublishedProductSlugs } from "@/features/products/queries";
import { routing } from "@/i18n/routing";
import { appUrl } from "@/lib/env/public";
import { languageAlternates, localizedPath } from "@/lib/seo/metadata";

/**
 * /sitemap.xml: every public storefront page in both languages, each with its hreflang
 * alternates. The admin, account, checkout and auth pages are never listed (spec §8.3).
 * Built from the same cached catalog reads as the pages, so it refreshes with them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getPublishedProductSlugs(), getCategories()]);
  const base = appUrl();
  const absolute = (path: string) => new URL(path, base).toString();

  const pages: { path: string; lastModified?: Date }[] = [
    { path: "/" },
    { path: "/products" },
    ...categories.map((category) => ({ path: categoryHref(category.slug) })),
    ...products.map((product) => ({
      path: productHref(product.slug),
      lastModified: product.updatedAt,
    })),
  ];

  return pages.flatMap(({ path, lastModified }) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(path)).map(([language, href]) => [
        language,
        absolute(href),
      ]),
    );
    return routing.locales.map((locale) => ({
      url: absolute(localizedPath(locale, path)),
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages },
    }));
  });
}
