import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_CACHE_PROFILE, CATALOG_TAGS } from "@/features/catalog-cache";
import { getDb } from "@/lib/db";
import {
  findCategoryProducts,
  findFeaturedProducts,
  findNewestProducts,
  findProductBySlug,
  findPublishedProductSlugs,
  searchPublishedProducts,
} from "./data";
import type { ProductSearch } from "./search-params";

// Cached catalog reads for pages. Arguments become part of the cache key.

export async function getFeaturedProducts(limit = 8) {
  "use cache";
  cacheTag(CATALOG_TAGS.products);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findFeaturedProducts(getDb(), limit);
}

export async function getNewestProducts(limit = 8) {
  "use cache";
  cacheTag(CATALOG_TAGS.products);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findNewestProducts(getDb(), limit);
}

export async function getCategoryProducts(categoryId: string, limit = 48) {
  "use cache";
  cacheTag(CATALOG_TAGS.products, CATALOG_TAGS.categories);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findCategoryProducts(getDb(), categoryId, limit);
}

export async function getPublishedProductSlugs(limit = 1_000) {
  "use cache";
  cacheTag(CATALOG_TAGS.products);
  cacheLife(CATALOG_CACHE_PROFILE);
  return findPublishedProductSlugs(getDb(), limit);
}

export async function getProductBySlug(slug: string) {
  "use cache";
  cacheTag(CATALOG_TAGS.products);
  cacheLife(CATALOG_CACHE_PROFILE);
  const product = await findProductBySlug(getDb(), slug);
  if (product) cacheTag(CATALOG_TAGS.product(product.id));
  return product;
}

export async function searchProducts(search: ProductSearch) {
  "use cache";
  cacheTag(CATALOG_TAGS.products, CATALOG_TAGS.categories);
  cacheLife("hours");
  return searchPublishedProducts(getDb(), search);
}
