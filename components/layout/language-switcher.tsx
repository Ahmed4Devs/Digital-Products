"use client";

import { useLocale, useTranslations, type Locale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactElement } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";
import { TOUCH_TARGET } from "./touch-target";

function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

type SwitchLinkProps = {
  query?: Record<string, string>;
  /** Hands over the link, for a menu to render as its item. */
  render?: (link: ReactElement) => ReactElement;
};

function SwitchLink({ query, render }: SwitchLinkProps) {
  const t = useTranslations("common.language");
  const pathname = usePathname();
  const target = otherLocale(useLocale());
  const link = (
    // Following the link keeps the current page; next-intl stores the choice in the
    // locale cookie, which also drives the `/` redirect on later visits.
    <Link
      href={{ pathname, query }}
      locale={target}
      hrefLang={target}
      // The accessible name stays the visible language name (WCAG 2.5.3 Label in Name).
      title={t("switchTo")}
      className={
        render
          ? undefined
          : buttonVariants({ variant: "ghost", size: "sm", className: TOUCH_TARGET })
      }
    >
      <span lang={target}>{t(`name.${target}`)}</span>
    </Link>
  );

  return render ? render(link) : link;
}

function SwitchLinkWithQuery({ render }: Pick<SwitchLinkProps, "render">) {
  const searchParams = useSearchParams();
  return <SwitchLink query={Object.fromEntries(searchParams)} render={render} />;
}

/** Links to the same page in the other language, preserving the query string. */
export function LanguageSwitcher({ render }: Pick<SwitchLinkProps, "render">) {
  // Search params are only known at request time; the static shell renders the
  // path-only link until they are available.
  return (
    <Suspense fallback={<SwitchLink render={render} />}>
      <SwitchLinkWithQuery render={render} />
    </Suspense>
  );
}
