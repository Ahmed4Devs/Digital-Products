// Cart cookie details shared with the browser (no secrets, no Node.js modules).

export const CART_COOKIE = "cart";
export const CART_MAX_ITEMS = 20;
export const CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Product IDs as stored, for display only: the browser cannot verify the signature. */
export function cartIdsForDisplay(value: string | undefined): string[] {
  if (!value) return [];
  const payload = value.slice(0, Math.max(0, value.lastIndexOf(".")));
  return payload ? payload.split("_") : [];
}
