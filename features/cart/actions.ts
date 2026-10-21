"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { addToCart } from "./cookie";
import { readCart, writeCart } from "./server";

// Cart Server Actions: anyone may use them (visitors add items before signing in).
// Only published products can be added; prices are never stored in the cart.

const productId = z.uuid();

export async function addToCartAction(id: string): Promise<ActionState> {
  const parsed = productId.safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid" };
  const product = await getDb().product.findFirst({
    where: { id: parsed.data, status: "published" },
    select: { id: true },
  });
  if (!product) return { status: "error", message: "unavailable" };

  const next = addToCart(await readCart(), product.id);
  if (!next) return { status: "error", message: "cartFull" };
  await writeCart(next);
  return { status: "success", message: "added" };
}

export async function removeFromCartAction(id: string): Promise<ActionState> {
  const parsed = productId.safeParse(id);
  if (!parsed.success) return { status: "error", message: "invalid" };
  await writeCart((await readCart()).filter((item) => item !== parsed.data));
  return { status: "success", message: "removed" };
}
