import { describe, expect, it } from "vitest";
import { cartIdsForDisplay, CART_MAX_ITEMS } from "@/features/cart/constants";
import { addToCart, decodeCart, encodeCart } from "@/features/cart/cookie";

const SECRET = "cart-unit-test-secret-that-is-long-enough";
const id = (n: number) => `0199c0de-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("cart cookie", () => {
  it("round-trips signed product IDs", () => {
    const value = encodeCart(SECRET, [id(1), id(2)]);
    expect(decodeCart(SECRET, value)).toEqual([id(1), id(2)]);
    expect(cartIdsForDisplay(value)).toEqual([id(1), id(2)]);
    // Cookie-safe: no commas, semicolons, spaces or quotes.
    expect(value).toMatch(/^[0-9a-f_\-.A-Za-z]+$/);
  });

  it("returns an empty cart for anything tampered with or malformed", () => {
    const value = encodeCart(SECRET, [id(1)]);
    const [payload, mac] = [
      value.slice(0, value.lastIndexOf(".")),
      value.slice(value.lastIndexOf(".") + 1),
    ];
    for (const candidate of [
      undefined,
      "",
      "garbage",
      `${payload}_${id(2)}.${mac}`,
      `${payload}.${mac}x`,
      encodeCart("another-secret-that-is-long-enough!!", [id(1)]),
      encodeCart(SECRET, ["not-a-uuid"]),
      encodeCart(
        SECRET,
        Array.from({ length: CART_MAX_ITEMS + 1 }, (_, n) => id(n)),
      ),
    ]) {
      expect(decodeCart(SECRET, candidate)).toEqual([]);
    }
  });

  it("deduplicates and caps the cart", () => {
    expect(decodeCart(SECRET, encodeCart(SECRET, [id(1), id(1)]))).toEqual([id(1)]);
    expect(addToCart([id(1)], id(1))).toEqual([id(1)]);
    expect(addToCart([id(1)], id(2))).toEqual([id(1), id(2)]);
    const full = Array.from({ length: CART_MAX_ITEMS }, (_, n) => id(n));
    expect(addToCart(full, id(99))).toBeNull();
    expect(cartIdsForDisplay(undefined)).toEqual([]);
    expect(decodeCart(SECRET, encodeCart(SECRET, []))).toEqual([]);
  });
});
