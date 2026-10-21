import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { publicImageUrl } from "@/lib/env/public";
import { localized } from "@/lib/text";
import { getPublicStoreSettings } from "./queries";

export type StoreBranding = {
  name: string;
  /** Logo URLs per theme; a single uploaded logo serves both. Null without a logo. */
  logoLight: string | null;
  logoDark: string | null;
};

/** The store's name in this locale (the owner's, else the default) and its logos. */
export async function getStoreBranding(): Promise<StoreBranding> {
  const [locale, settings, t] = await Promise.all([
    getLocale(),
    getPublicStoreSettings(),
    getTranslations("common"),
  ]);
  const light = settings.logoLightKey ? publicImageUrl(settings.logoLightKey) : null;
  const dark = settings.logoDarkKey ? publicImageUrl(settings.logoDarkKey) : null;
  return {
    name:
      localized(locale, { ar: settings.storeNameAr, en: settings.storeNameEn }) || t("storeName"),
    logoLight: light ?? dark,
    logoDark: dark ?? light,
  };
}
