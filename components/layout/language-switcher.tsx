"use client";

import { useLocale, useTranslations, type Locale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";

function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

type SwitchLinkProps = {
  query?: Record<string, string>;
};

function SwitchLink({ query }: SwitchLinkProps) {
  const t = useTranslations("common.language");
  const pathname = usePathname();
  const target = otherLocale(useLocale());

  return (
    // Following the link keeps the current page; next-intl stores the choice in the
    // locale cookie, which also drives the `/` redirect on later visits.
    <Link
      href={{ pathname, query }}
      locale={target}
      hrefLang={target}
      // The accessible name stays the visible language name (WCAG 2.5.3 Label in Name).
      title={t("switchTo")}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <span lang={target}>{t(`name.${target}`)}</span>
    </Link>
  );
}

function SwitchLinkWithQuery() {
  const searchParams = useSearchParams();
  return <SwitchLink query={Object.fromEntries(searchParams)} />;
}

/** Links to the same page in the other language, preserving the query string. */
export function LanguageSwitcher() {
  // Search params are only known at request time; the static shell renders the
  // path-only link until they are available.
  return (
    <Suspense fallback={<SwitchLink />}>
      <SwitchLinkWithQuery />
    </Suspense>
  );
}
