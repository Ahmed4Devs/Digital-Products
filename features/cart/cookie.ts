import { safeEqual } from "@/lib/security/compare";
import { keyedHash } from "@/lib/security/keyed-hash";
import { CART_MAX_ITEMS } from "./constants";

// The cart lives in an HMAC-signed cookie with product IDs only (quantity is always 1)
// and a capped size (spec §10.1). The server re-validates every ID and recomputes every
// price; the signature only stops the cookie from being stuffed with arbitrary data.
// The value is `id_id_….signature`: cookie-safe characters, and readable by the
// browser so the header can show the count on static pages.

export { CART_COOKIE, CART_MAX_AGE_SECONDS, CART_MAX_ITEMS } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PURPOSE = "cart-cookie";

export function encodeCart(secret: string, productIds: string[]): string {
  const payload = productIds.join("_");
  return `${payload}.${keyedHash(secret, PURPOSE, payload)}`;
}

/** Product IDs from a genuine cookie; an empty cart for anything else. */
export function decodeCart(secret: string, value: string | undefined): string[] {
  if (!value) return [];
  const separator = value.lastIndexOf(".");
  if (separator < 0) return [];
  const payload = value.slice(0, separator);
  const mac = value.slice(separator + 1);
  if (!safeEqual(mac, keyedHash(secret, PURPOSE, payload))) return [];
  const ids = payload ? payload.split("_") : [];
  if (ids.length > CART_MAX_ITEMS || !ids.every((id) => UUID.test(id))) return [];
  return [...new Set(ids)];
}

/** Adds a product once, keeping insertion order; refuses beyond the cap. */
export function addToCart(ids: string[], productId: string): string[] | null {
  if (ids.includes(productId)) return ids;
  if (ids.length >= CART_MAX_ITEMS) return null;
  return [...ids, productId];
}
