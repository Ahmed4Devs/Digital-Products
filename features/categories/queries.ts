import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_CACHE_PROFILE, CATALOG_TAGS } from "@/features/catalog-cache";
import { getDb } from "@/lib/db";
import { findCategories, findCategoryBySlug } from "./data";

export async function getCategories() {
  "use cache";
  // Product counts change with products too.
  cacheTag(CATALOG_TAGS.categories, CATALOG_TAGS.products);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findCategories(getDb());
}

export async function getCategoryBySlug(slug: string) {
  "use cache";
  cacheTag(CATALOG_TAGS.categories);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findCategoryBySlug(getDb(), slug);
}
