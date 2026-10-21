import type { Locale } from "next-intl";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { escapeLikePattern } from "./data";

// Owner reads for the dashboard: never cached, every status visible. Pages call
// requireOwner() before using them.

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_PRODUCT_STATUSES = ["all", "draft", "published", "archived"] as const;
export const ADMIN_PRODUCT_SORTS = ["updated", "created", "title", "price"] as const;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const adminProductSearchSchema = z.object({
  status: z.preprocess(firstValue, z.enum(ADMIN_PRODUCT_STATUSES).catch("all")),
  q: z.preprocess(
    firstValue,
    z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, " ").slice(0, 100))
      .catch(""),
  ),
  sort: z.preprocess(firstValue, z.enum(ADMIN_PRODUCT_SORTS).catch("updated")),
  dir: z.preprocess(firstValue, z.enum(["asc", "desc"]).catch("desc")),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).max(10_000).catch(1)),
});

export type AdminProductSearch = z.infer<typeof adminProductSearchSchema>;

export function parseAdminProductSearch(params: Record<string, unknown>): AdminProductSearch {
  return adminProductSearchSchema.parse({
    status: params.status ?? "all",
    q: params.q ?? "",
    sort: params.sort ?? "updated",
    dir: params.dir ?? "desc",
    page: params.page ?? 1,
  });
}

/** Query string without defaults, for links that keep the current table state. */
export function adminProductSearchQuery(
  search: Partial<AdminProductSearch>,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (search.status && search.status !== "all") query.status = search.status;
  if (search.q) query.q = search.q;
  if (search.sort && search.sort !== "updated") query.sort = search.sort;
  if (search.dir && search.dir !== "desc") query.dir = search.dir;
  if (search.page && search.page > 1) query.page = String(search.page);
  return query;
}

export type AdminProductRow = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  status: "draft" | "published" | "archived";
  priceUsdCents: number;
  featured: boolean;
  categoryNameAr: string | null;
  categoryNameEn: string | null;
  fileCount: number;
  updatedAt: Date;
};

export async function findAdminProducts(
  db: PrismaClient,
  search: AdminProductSearch,
  locale: Locale,
): Promise<{ rows: AdminProductRow[]; total: number; pageCount: number }> {
  const where: Prisma.ProductWhereInput = {};
  if (search.status !== "all") where.status = search.status;
  if (search.q) {
    const contains = escapeLikePattern(search.q);
    where.OR = [
      { titleAr: { contains, mode: "insensitive" } },
      { titleEn: { contains, mode: "insensitive" } },
      { slug: { contains, mode: "insensitive" } },
    ];
  }

  const titleField = locale === "ar" ? "titleAr" : "titleEn";
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = [
    search.sort === "title"
      ? { [titleField]: search.dir }
      : search.sort === "price"
        ? { priceUsdCents: search.dir }
        : search.sort === "created"
          ? { createdAt: search.dir }
          : { updatedAt: search.dir },
    { id: "desc" },
  ];

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy,
      skip: (search.page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        titleAr: true,
        titleEn: true,
        status: true,
        priceUsdCents: true,
        featured: true,
        updatedAt: true,
        category: { select: { nameAr: true, nameEn: true } },
        _count: { select: { files: { where: { supersededAt: null } } } },
      },
    }),
  ]);

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    rows: products.map(({ category, _count, ...product }) => ({
      ...product,
      categoryNameAr: category?.nameAr ?? null,
      categoryNameEn: category?.nameEn ?? null,
      fileCount: _count.files,
    })),
  };
}

/** Everything the edit page shows, including superseded file versions. */
export async function findProductForEdit(db: PrismaClient, id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, slug: true, nameAr: true, nameEn: true } },
      images: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      files: {
        orderBy: [{ supersededAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
        include: { _count: { select: { downloadLogs: true } } },
      },
      _count: { select: { orderItems: true } },
    },
  });
  if (!product) return null;
  const { images, files, _count, ...rest } = product;
  return {
    ...rest,
    salesCount: _count.orderItems,
    cover: images.find((image) => image.kind === "cover") ?? null,
    gallery: images.filter((image) => image.kind === "gallery"),
    files: files.map(({ _count: fileCount, sizeBytes, ...file }) => ({
      ...file,
      sizeBytes: Number(sizeBytes),
      downloadCount: fileCount.downloadLogs,
    })),
  };
}

export type ProductForEdit = NonNullable<Awaited<ReturnType<typeof findProductForEdit>>>;

export async function findCategoryOptions(db: PrismaClient) {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, nameAr: true, nameEn: true },
  });
}

/** Categories with all their products (any status), for the categories screen. */
export async function findAdminCategories(db: PrismaClient) {
  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      sortOrder: true,
      _count: { select: { products: true } },
    },
  });
  return rows.map(({ _count, ...category }) => ({ ...category, productCount: _count.products }));
}
