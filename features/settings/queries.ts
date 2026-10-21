import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_CACHE_PROFILE, CATALOG_TAGS } from "@/features/catalog-cache";
import { getDb } from "@/lib/db";
import { findPublicStoreSettings } from "./data";

export async function getPublicStoreSettings() {
  "use cache";
  cacheTag(CATALOG_TAGS.settings);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findPublicStoreSettings(getDb());
}
