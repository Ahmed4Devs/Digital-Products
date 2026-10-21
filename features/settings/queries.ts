import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_CACHE_PROFILE, CATALOG_TAGS } from "@/features/catalog-cache";
import { getDb } from "@/lib/db";
import { findLegalPage, findPublicStoreSettings } from "./data";
import type { LegalPage } from "./schemas";

export async function getPublicStoreSettings() {
  "use cache";
  cacheTag(CATALOG_TAGS.settings);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findPublicStoreSettings(getDb());
}

/** A legal page's content; refreshed with the settings tag when the owner saves it. */
export async function getLegalPage(page: LegalPage) {
  "use cache";
  cacheTag(CATALOG_TAGS.settings);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findLegalPage(getDb(), page);
}
