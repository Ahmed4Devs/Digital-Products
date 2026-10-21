// Shapes the catalog reads return. Plain data only (no Prisma Decimal or class
// instances), so they can cross 'use cache' boundaries and reach client components.

export type CatalogImage = {
  storageKey: string;
  width: number;
  height: number;
  altAr: string;
  altEn: string;
};

export type CategoryRef = {
  slug: string;
  nameAr: string;
  nameEn: string;
};

export type ProductSummary = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  shortDescriptionAr: string;
  shortDescriptionEn: string;
  priceUsdCents: number;
  fixedPriceSarHalalas: number | null;
  compareAtPriceUsdCents: number | null;
  cover: CatalogImage | null;
  category: CategoryRef | null;
};

export type ProductDetail = ProductSummary & {
  descriptionAr: string;
  descriptionEn: string;
  gallery: CatalogImage[];
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescriptionAr: string | null;
  seoDescriptionEn: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type ProductPage = {
  items: ProductSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export type CategorySummary = CategoryRef & {
  id: string;
  productCount: number;
};
