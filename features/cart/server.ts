import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env/server";
import { CART_COOKIE, CART_MAX_AGE_SECONDS } from "./constants";
import { decodeCart, encodeCart } from "./cookie";

export async function readCart(): Promise<string[]> {
  const store = await cookies();
  return decodeCart(serverEnv().BETTER_AUTH_SECRET, store.get(CART_COOKIE)?.value);
}

/** Only from Server Actions and route handlers, where cookies can be set. */
export async function writeCart(productIds: string[]): Promise<void> {
  const store = await cookies();
  if (productIds.length === 0) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, encodeCart(serverEnv().BETTER_AUTH_SECRET, productIds), {
    // Readable by the header's count; it holds no secret (product IDs and a MAC).
    httpOnly: false,
    sameSite: "lax",
    secure: new URL(serverEnv().APP_URL).protocol === "https:",
    path: "/",
    maxAge: CART_MAX_AGE_SECONDS,
  });
}
