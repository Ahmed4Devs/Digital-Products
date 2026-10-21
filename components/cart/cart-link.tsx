"use client";

import { ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { CART_CHANGED, readCartCount } from "./cart-events";

function subscribe(onChange: () => void) {
  window.addEventListener(CART_CHANGED, onChange);
  // Another tab may have changed the cookie.
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(CART_CHANGED, onChange);
    window.removeEventListener("focus", onChange);
  };
}

/** Cart link with the item count, resolved in the browser (static pages, spec §12). */
export function CartLink() {
  const t = useTranslations("common.cart");
  const count = useSyncExternalStore(subscribe, readCartCount, () => 0);

  return (
    // The visible word stays part of the accessible name (WCAG 2.5.3 Label in Name).
    <Link
      href="/cart"
      className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
    >
      <ShoppingCartIcon aria-hidden="true" />
      <span className="max-sm:sr-only">{t("link")}</span>
      {count > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="ms-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums"
          >
            {count}
          </span>
          <span className="sr-only">{t("itemCount", { count })}</span>
        </>
      ) : null}
    </Link>
  );
}
