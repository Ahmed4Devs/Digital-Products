import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Leaves the shared test catalog as a test file found it: products the file created are
 * archived (sold ones cannot be deleted) and moved out of the categories it created,
 * which are then deleted. Integration files share one database (see vitest.config.mts).
 */
export async function restoreCatalog(db: PrismaClient, since: Date): Promise<void> {
  const categories = await db.category.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true },
  });
  const categoryIds = categories.map((category) => category.id);
  await db.product.updateMany({
    where: { OR: [{ createdAt: { gte: since } }, { categoryId: { in: categoryIds } }] },
    data: { status: "archived", featured: false, categoryId: null },
  });
  await db.category.deleteMany({ where: { id: { in: categoryIds } } });
}
