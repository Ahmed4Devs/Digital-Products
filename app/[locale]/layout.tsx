import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { RootDocument } from "@/components/layout/root-document";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Root layout. `[locale]` sits above it, which makes it a root param that next-intl reads
// on the server, so every page can still be prerendered once per locale.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const storeName = t("storeName");

  return {
    title: { default: storeName, template: `%s | ${storeName}` },
    description: t("metadata.description"),
    // Not indexable until SEO metadata, sitemap and robots land in Phase 4.
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return <RootDocument locale={locale}>{children}</RootDocument>;
}
