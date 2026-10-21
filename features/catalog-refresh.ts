import "server-only";
import { updateTag } from "next/cache";
import { CATALOG_TAGS } from "./catalog-cache";

// Called by owner Server Actions after a successful write, so the storefront shows the
// change on the very next request (spec §12, read-your-own-writes).

export function refreshProductCaches(productId?: string): void {
  updateTag(CATALOG_TAGS.products);
  // Category pages and the category list show published-product counts.
  updateTag(CATALOG_TAGS.categories);
  if (productId) updateTag(CATALOG_TAGS.product(productId));
}

export function refreshCategoryCaches(): void {
  updateTag(CATALOG_TAGS.categories);
  // Product pages and cards show their category's name.
  updateTag(CATALOG_TAGS.products);
}

export function refreshSettingsCaches(): void {
  updateTag(CATALOG_TAGS.settings);
}
