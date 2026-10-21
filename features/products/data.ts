import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PRODUCTS_PAGE_SIZE, type ProductSearch } from "./search-params";
import type { CatalogImage, ProductDetail, ProductPage, ProductSummary } from "./types";

// Uncached catalog reads. Pages use the cached wrappers in ./queries; these take the
// client as a parameter so integration tests can run them against the test database.
// Only published products are ever returned to the storefront.

const PUBLISHED: Prisma.ProductWhereInput = { status: "published" };

const imageSelect = {
  storageKey: true,
  width: true,
  height: true,
  altAr: true,
  altEn: true,
} satisfies Prisma.ProductImageSelect;

const summarySelect = {
  id: true,
  slug: true,
  titleAr: true,
  titleEn: true,
  shortDescriptionAr: true,
  shortDescriptionEn: true,
  priceUsdCents: true,
  fixedPriceSarHalalas: true,
  compareAtPriceUsdCents: true,
  category: { select: { slug: true, nameAr: true, nameEn: true } },
  images: {
    where: { kind: "cover" },
    select: imageSelect,
    take: 1,
  },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof summarySelect }>;

function toSummary({ images, ...row }: SummaryRow): ProductSummary {
  return { ...row, cover: images[0] ?? null };
}

const NEWEST_FIRST: Prisma.ProductOrderByWithRelationInput[] = [
  { publishedAt: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
];

export async function findFeaturedProducts(db: PrismaClient, limit: number) {
  const rows = await db.product.findMany({
    where: { ...PUBLISHED, featured: true },
    orderBy: NEWEST_FIRST,
    take: limit,
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export async function findNewestProducts(db: PrismaClient, limit: number) {
  const rows = await db.product.findMany({
    where: PUBLISHED,
    orderBy: NEWEST_FIRST,
    take: limit,
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export async function findCategoryProducts(db: PrismaClient, categoryId: string, limit: number) {
  const rows = await db.product.findMany({
    where: { ...PUBLISHED, categoryId },
    orderBy: NEWEST_FIRST,
    take: limit,
    select: summarySelect,
  });
  return rows.map(toSummary);
}

/** Every published slug, newest first; drives prerendering and the sitemap. */
export async function findPublishedProductSlugs(db: PrismaClient, limit: number) {
  return db.product.findMany({
    where: PUBLISHED,
    orderBy: NEWEST_FIRST,
    take: limit,
    select: { slug: true, updatedAt: true },
  });
}

export async function findProductBySlug(
  db: PrismaClient,
  slug: string,
): Promise<ProductDetail | null> {
  const row = await db.product.findFirst({
    where: { ...PUBLISHED, slug },
    select: {
      ...summarySelect,
      descriptionAr: true,
      descriptionEn: true,
      seoTitleAr: true,
      seoTitleEn: true,
      seoDescriptionAr: true,
      seoDescriptionEn: true,
      publishedAt: true,
      updatedAt: true,
      images: {
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { ...imageSelect, kind: true },
      },
    },
  });
  if (!row) return null;

  const { images, ...rest } = row;
  const strip = ({ kind: _kind, ...image }: (typeof images)[number]): CatalogImage => image;
  const cover = images.find((image) => image.kind === "cover");
  return {
    ...rest,
    cover: cover ? strip(cover) : null,
    gallery: images.filter((image) => image.kind === "gallery").map(strip),
  };
}

function orderFor(sort: ProductSearch["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ priceUsdCents: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ priceUsdCents: "desc" }, { id: "desc" }];
    default:
      return NEWEST_FIRST;
  }
}

/**
 * Escapes LIKE wildcards so customer input is matched literally. Prisma passes
 * `contains` values into the pattern unescaped; PostgreSQL's default escape is `\`.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Search and filtering for /products. Matches titles and short descriptions in both
 * languages, case-insensitively.
 */
export async function searchPublishedProducts(
  db: PrismaClient,
  search: ProductSearch,
): Promise<ProductPage> {
  const where: Prisma.ProductWhereInput = { ...PUBLISHED };
  if (search.category) where.category = { slug: search.category };
  if (search.q) {
    const contains = { contains: escapeLikePattern(search.q), mode: "insensitive" } as const;
    where.OR = [
      { titleAr: contains },
      { titleEn: contains },
      { shortDescriptionAr: contains },
      { shortDescriptionEn: contains },
    ];
  }

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: orderFor(search.sort),
      skip: (search.page - 1) * PRODUCTS_PAGE_SIZE,
      take: PRODUCTS_PAGE_SIZE,
      select: summarySelect,
    }),
  ]);

  return {
    items: rows.map(toSummary),
    total,
    page: search.page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
  };
}
