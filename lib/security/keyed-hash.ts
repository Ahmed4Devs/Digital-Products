import { createHmac } from "node:crypto";

/**
 * Keyed, one-way hash for values the store must recognise again but never keep in the
 * clear: client IP addresses, rate-limit keys and similar identifiers.
 *
 * A separate key is derived per purpose, so a hash produced for one purpose can never be
 * matched against another. Plain SHA-256 would not do: the IPv4 space is small enough to
 * reverse an unkeyed hash by brute force.
 */
export function keyedHash(secret: string, purpose: string, value: string): string {
  const purposeKey = createHmac("sha256", secret).update(`digital-products:${purpose}`).digest();
  return createHmac("sha256", purposeKey).update(value).digest("base64url");
}
