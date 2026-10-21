"use client";

import { useTranslations } from "next-intl";

/** Translates checkout action message keys; unknown keys fall back to a generic text. */
export function useCheckoutError() {
  const t = useTranslations("checkout.errors");
  return (key: string | undefined) =>
    key && t.has(key as never) ? t(key as never) : t("unexpected");
}
