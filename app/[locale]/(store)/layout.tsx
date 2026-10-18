import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default async function StoreLayout({ children }: LayoutProps<"/[locale]">) {
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
