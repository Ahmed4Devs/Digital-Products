import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getStoreBranding } from "@/features/settings/branding";
import { appUrl } from "@/lib/env/public";

/**
 * Title template, description and metadataBase shared by both root layouts. Storefront
 * pages are indexable; authentication, account and admin pages are not.
 */
export async function rootMetadata({ indexable }: { indexable: boolean }): Promise<Metadata> {
  const [t, { name: storeName }] = await Promise.all([
    getTranslations("common"),
    getStoreBranding(),
  ]);

  return {
    metadataBase: appUrl(),
    title: { default: storeName, template: `%s | ${storeName}` },
    description: t("metadata.description"),
    applicationName: storeName,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}
