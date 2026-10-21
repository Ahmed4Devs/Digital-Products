import type { ProductFormDefaults } from "@/components/admin/product-form";
import type { ProductForEdit } from "@/features/products/admin-data";
import { toDecimalString } from "@/lib/money";

export const EMPTY_PRODUCT: ProductFormDefaults = {
  slug: "",
  titleAr: "",
  titleEn: "",
  shortDescriptionAr: "",
  shortDescriptionEn: "",
  descriptionAr: "",
  descriptionEn: "",
  seoTitleAr: "",
  seoTitleEn: "",
  seoDescriptionAr: "",
  seoDescriptionEn: "",
  priceUsd: "",
  fixedPriceSar: "",
  compareAtPriceUsd: "",
  categoryId: "",
  featured: false,
};

/** A stored product as the strings the form edits (prices in major units). */
export function productFormDefaults(product: ProductForEdit): ProductFormDefaults {
  return {
    slug: product.slug,
    titleAr: product.titleAr,
    titleEn: product.titleEn,
    shortDescriptionAr: product.shortDescriptionAr,
    shortDescriptionEn: product.shortDescriptionEn,
    descriptionAr: product.descriptionAr,
    descriptionEn: product.descriptionEn,
    seoTitleAr: product.seoTitleAr ?? "",
    seoTitleEn: product.seoTitleEn ?? "",
    seoDescriptionAr: product.seoDescriptionAr ?? "",
    seoDescriptionEn: product.seoDescriptionEn ?? "",
    priceUsd: toDecimalString(product.priceUsdCents, "USD"),
    fixedPriceSar:
      product.fixedPriceSarHalalas === null
        ? ""
        : toDecimalString(product.fixedPriceSarHalalas, "SAR"),
    compareAtPriceUsd:
      product.compareAtPriceUsdCents === null
        ? ""
        : toDecimalString(product.compareAtPriceUsdCents, "USD"),
    categoryId: product.categoryId ?? "",
    featured: product.featured,
  };
}
