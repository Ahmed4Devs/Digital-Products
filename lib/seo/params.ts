/**
 * Route params may arrive percent-encoded (Arabic slugs). Valid slugs never contain
 * `%`, so decoding once is unambiguous; malformed input is returned unchanged and then
 * simply matches nothing.
 */
export function decodeSlugParam(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** generateStaticParams must return at least one entry with Cache Components. */
export const PLACEHOLDER_SLUG = "__placeholder__";
