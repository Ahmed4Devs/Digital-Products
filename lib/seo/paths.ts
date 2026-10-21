// Storefront paths, shared by pages, the sitemap and the owner dashboard. Slugs may be
// Arabic, so each one is encoded as a single path segment.

export function productHref(slug: string): string {
  return `/products/${encodeURIComponent(slug)}`;
}

export function categoryHref(slug: string): string {
  return `/categories/${encodeURIComponent(slug)}`;
}
