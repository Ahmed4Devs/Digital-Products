// Cache tags for catalog reads (spec §12). Owner mutations call updateTag() with the
// same names (Phase 5) so changes appear immediately; the daily lifetime is only a
// safety net.
export const CATALOG_TAGS = {
  products: "products",
  product: (id: string) => `product:${id}`,
  categories: "categories",
  settings: "settings",
} as const;

/** cacheLife profile for catalog data: long enough to satisfy ensureStatic. */
export const CATALOG_CACHE_PROFILE = "days";
