import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Title template and description shared by both root layouts. */
export async function rootMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const storeName = t("storeName");

  return {
    title: { default: storeName, template: `%s | ${storeName}` },
    description: t("metadata.description"),
    // Not indexable until SEO metadata, sitemap and robots land in Phase 4.
    robots: { index: false, follow: false },
  };
}
