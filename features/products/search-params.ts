import { z } from "zod";

// Query string of /[locale]/products (spec §8.1), validated with Zod (spec §5.1).
// Unknown parameters (utm_*, fbclid…) are ignored rather than rejected, so shared links
// keep working; every known parameter falls back to its default when invalid.

export const PRODUCT_SORTS = ["newest", "price-asc", "price-desc"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCTS_PAGE_SIZE = 12;
export const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE = 1_000;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const productSearchSchema = z.object({
  q: z.preprocess(
    firstValue,
    z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH))
      .catch(""),
  ),
  category: z.preprocess(
    firstValue,
    z
      .string()
      .trim()
      .toLowerCase()
      .max(80)
      .regex(/^[\p{Ll}\p{Lo}0-9-]*$/u)
      .catch(""),
  ),
  sort: z.preprocess(firstValue, z.enum(PRODUCT_SORTS).catch("newest")),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(MAX_PAGE).catch(1)),
});

export type ProductSearch = z.infer<typeof productSearchSchema>;

export function parseProductSearch(params: Record<string, unknown>): ProductSearch {
  return productSearchSchema.parse({
    q: params.q ?? "",
    category: params.category ?? "",
    sort: params.sort ?? "newest",
    page: params.page ?? 1,
  });
}

/** Query string for a search, leaving out defaults so URLs stay short and canonical. */
export function productSearchQuery(search: Partial<ProductSearch>): Record<string, string> {
  const query: Record<string, string> = {};
  if (search.q) query.q = search.q;
  if (search.category) query.category = search.category;
  if (search.sort && search.sort !== "newest") query.sort = search.sort;
  if (search.page && search.page > 1) query.page = String(search.page);
  return query;
}
