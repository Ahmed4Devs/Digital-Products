import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { routing } from "@/i18n/routing";

// Translated metadata with canonical URLs and hreflang alternates (spec Phase 4).
// Paths are locale-less ("/products/x"); relative URLs resolve against metadataBase,
// which the root layouts set from APP_URL.

const OPEN_GRAPH_LOCALES: Record<Locale, string> = { ar: "ar_SA", en: "en_US" };

/** "/products" → "/ar/products"; "/" → "/ar". */
export function localizedPath(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * hreflang alternates for every locale plus `x-default`, which points at the unprefixed
 * path: proxy.ts sends those visitors to their preferred language.
 */
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) languages[locale] = localizedPath(locale, path);
  languages["x-default"] = path;
  return languages;
}

type PageMetadataInput = {
  locale: Locale;
  path: string;
  title: Metadata["title"];
  description: string;
  /** Social title when it should differ from the document title. */
  openGraphTitle?: string;
  siteName?: string;
  type?: "website" | "article";
  images?: { url: string; width: number; height: number; alt: string }[];
};

export function pageMetadata({
  locale,
  path,
  title,
  description,
  openGraphTitle,
  siteName,
  type = "website",
  images,
}: PageMetadataInput): Metadata {
  const socialTitle =
    openGraphTitle ?? (typeof title === "string" ? title : undefined) ?? siteName ?? "";
  return {
    title,
    description,
    alternates: {
      canonical: localizedPath(locale, path),
      languages: languageAlternates(path),
    },
    openGraph: {
      type,
      title: socialTitle,
      description,
      url: localizedPath(locale, path),
      siteName,
      locale: OPEN_GRAPH_LOCALES[locale],
      alternateLocale: routing.locales
        .filter((other) => other !== locale)
        .map((other) => OPEN_GRAPH_LOCALES[other]),
      images,
    },
    twitter: { card: images?.length ? "summary_large_image" : "summary" },
  };
}
