import type { PrismaClient } from "@/generated/prisma/client";
import type { CategorySummary } from "@/features/products/types";

// Uncached category reads (see features/products/data.ts for the pattern).

/** Categories in the owner's order, with their number of published products. */
export async function findCategories(db: PrismaClient): Promise<CategorySummary[]> {
  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      _count: { select: { products: { where: { status: "published" } } } },
    },
  });
  return rows.map(({ _count, ...category }) => ({ ...category, productCount: _count.products }));
}

export async function findCategoryBySlug(db: PrismaClient, slug: string) {
  return db.category.findUnique({
    where: { slug },
    select: { id: true, slug: true, nameAr: true, nameEn: true, updatedAt: true },
  });
}
