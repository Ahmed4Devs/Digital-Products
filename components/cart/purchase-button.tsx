"use client";

import { CheckIcon, ShoppingCartIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { addToCartAction } from "@/features/cart/actions";
import { claimFreeProductAction } from "@/features/checkout/actions";
import { Link, useRouter } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions";
import { productHref } from "@/lib/seo/paths";
import { announceCartChange, CART_CHANGED, readCartIds } from "./cart-events";

function subscribe(onChange: () => void) {
  window.addEventListener(CART_CHANGED, onChange);
  return () => window.removeEventListener(CART_CHANGED, onChange);
}

type PurchaseButtonProps = { productId: string; slug: string; free: boolean };

/** "Add to cart" for paid products, "Get it free" for free ones (spec §10.5). */
export function PurchaseButton({ productId, slug, free }: PurchaseButtonProps) {
  const t = useTranslations("common.cart");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  const inCart = useSyncExternalStore(
    subscribe,
    () => readCartIds().includes(productId),
    () => false,
  );

  const errorText = (key: string | undefined) =>
    key && t.has(`errors.${key}` as never) ? t(`errors.${key}` as never) : t("errors.unexpected");

  function claim() {
    startTransition(async () => {
      const result = await claimFreeProductAction(productId, locale);
      if (result.status === "success" && result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.message === "signInRequired") {
        router.push({ pathname: "/sign-in", query: { next: productHref(slug) } });
        return;
      }
      setState(result);
    });
  }

  function add() {
    startTransition(async () => {
      const result = await addToCartAction(productId);
      setState(result);
      if (result.status === "success") announceCartChange();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {free ? (
          <Button size="lg" disabled={pending} onClick={claim}>
            {t("getIt")}
          </Button>
        ) : inCart ? (
          <>
            <span className="inline-flex h-9 items-center gap-1.5 text-sm font-medium">
              <CheckIcon aria-hidden="true" className="size-4 text-primary" />
              {t("inCart")}
            </span>
            <Link href="/cart" className={buttonVariants({ size: "lg" })}>
              {t("viewCart")}
            </Link>
          </>
        ) : (
          <Button size="lg" disabled={pending} onClick={add}>
            <ShoppingCartIcon aria-hidden="true" />
            {t("addToCart")}
          </Button>
        )}
      </div>
      {state?.status === "success" && !free ? (
        <FormAlert tone="success">{t("added")}</FormAlert>
      ) : null}
      {state?.status === "error" ? (
        <FormAlert tone="error">{errorText(state.message)}</FormAlert>
      ) : null}
    </div>
  );
}
