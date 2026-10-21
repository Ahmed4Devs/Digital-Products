"use client";

import { CART_COOKIE, cartIdsForDisplay } from "@/features/cart/constants";

// The header's cart count is read from the cart cookie in the browser, so storefront
// pages stay static (spec §12). Components that change the cart announce it with this
// event.

export const CART_CHANGED = "cart:changed";

export function readCartIds(): string[] {
  const pair = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${CART_COOKIE}=`));
  return cartIdsForDisplay(
    pair ? decodeURIComponent(pair.slice(CART_COOKIE.length + 1)) : undefined,
  );
}

export function readCartCount(): number {
  return readCartIds().length;
}

export function announceCartChange(): void {
  window.dispatchEvent(new Event(CART_CHANGED));
}
