import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Skip link, header, main landmark and footer shared by the storefront and auth pages. */
export async function SiteShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("common.a11y");

  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 font-medium shadow-md focus:not-sr-only focus:fixed focus:inset-s-4 focus:top-4 focus:ring-3 focus:ring-ring/50"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
