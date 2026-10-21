import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { sanitizeRichText } from "@/lib/rich-text/sanitize";
import type { Storage } from "@/lib/storage/client";
import { PRODUCT_LIMITS, type ProductFormValues, type ProductStatusTarget } from "./schemas";

// Owner writes for products (spec §11). Callers have already run requireOwner(); every
// write commits together with its AuditLog row. Cache invalidation happens in the
// Server Actions, the only place updateTag() is allowed.

const SNAPSHOT_FIELDS = {
  slug: true,
  titleAr: true,
  titleEn: true,
  shortDescriptionAr: true,
  shortDescriptionEn: true,
  descriptionAr: true,
  descriptionEn: true,
  seoTitleAr: true,
  seoTitleEn: true,
  seoDescriptionAr: true,
  seoDescriptionEn: true,
  priceUsdCents: true,
  fixedPriceSarHalalas: true,
  compareAtPriceUsdCents: true,
  categoryId: true,
  featured: true,
  status: true,
  publishedAt: true,
} as const satisfies Prisma.ProductSelect;

/** Empty editor output ("<p></p>") is stored as no description at all. */
function cleanDescription(html: string): string {
  const sanitized = sanitizeRichText(html).trim();
  const visibleText = sanitized
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (!visibleText && !/<hr\b/.test(sanitized)) return "";
  if (sanitized.length > PRODUCT_LIMITS.description) {
    throw new ActionError("tooLong", "descriptionAr");
  }
  return sanitized;
}

function productData(input: ProductFormValues) {
  const optional = (value: string) => value || null;
  return {
    slug: input.slug,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    shortDescriptionAr: input.shortDescriptionAr,
    shortDescriptionEn: input.shortDescriptionEn,
    descriptionAr: cleanDescription(input.descriptionAr),
    descriptionEn: cleanDescription(input.descriptionEn),
    seoTitleAr: optional(input.seoTitleAr),
    seoTitleEn: optional(input.seoTitleEn),
    seoDescriptionAr: optional(input.seoDescriptionAr),
    seoDescriptionEn: optional(input.seoDescriptionEn),
    priceUsdCents: input.priceUsd,
    fixedPriceSarHalalas: input.fixedPriceSar,
    compareAtPriceUsdCents: input.compareAtPriceUsd,
    categoryId: input.categoryId,
    featured: input.featured,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function assertCategoryExists(tx: Prisma.TransactionClient, categoryId: string | null) {
  if (categoryId === null) return;
  const category = await tx.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw new ActionError("categoryNotFound", "categoryId");
}

async function findProductOrFail(tx: Prisma.TransactionClient, id: string) {
  const product = await tx.product.findUnique({ where: { id }, select: SNAPSHOT_FIELDS });
  if (!product) throw new ActionError("notFound");
  return product;
}

export async function createProduct(
  db: PrismaClient,
  actorId: string,
  input: ProductFormValues,
): Promise<{ id: string }> {
  const data = productData(input);
  try {
    return await db.$transaction(async (tx) => {
      await assertCategoryExists(tx, data.categoryId);
      const product = await tx.product.create({
        data: { ...data, status: "draft" },
        select: { id: true, ...SNAPSHOT_FIELDS },
      });
      const { id, ...after } = product;
      await recordAudit(tx, {
        actorId,
        action: "product.create",
        entity: "product",
        entityId: id,
        after,
      });
      return { id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ActionError("slugTaken", "slug");
    throw error;
  }
}

export async function updateProduct(
  db: PrismaClient,
  actorId: string,
  id: string,
  input: ProductFormValues,
): Promise<void> {
  const data = productData(input);
  try {
    await db.$transaction(async (tx) => {
      const before = await findProductOrFail(tx, id);
      await assertCategoryExists(tx, data.categoryId);
      const after = await tx.product.update({ where: { id }, data, select: SNAPSHOT_FIELDS });
      await recordAudit(tx, {
        actorId,
        action: "product.update",
        entity: "product",
        entityId: id,
        before,
        after,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ActionError("slugTaken", "slug");
    throw error;
  }
}

/**
 * Publish, archive, or move back to draft. Publishing needs a downloadable file; a
 * product that has been sold can be archived but never returns to draft, so buyers'
 * records keep pointing at a product the owner deliberately retired.
 */
export async function changeProductStatus(
  db: PrismaClient,
  actorId: string,
  id: string,
  target: ProductStatusTarget,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await findProductOrFail(tx, id);
    if (before.status === target) return;

    if (target === "published") {
      const files = await tx.productFile.count({ where: { productId: id, supersededAt: null } });
      if (files === 0) throw new ActionError("publishNeedsFile");
    }
    if (target === "draft") {
      const sales = await tx.orderItem.count({ where: { productId: id } });
      if (sales > 0) throw new ActionError("hasSales");
    }

    const after = await tx.product.update({
      where: { id },
      data: {
        status: target,
        // The first publication date drives "newest first"; re-publishing keeps it.
        publishedAt: target === "published" ? (before.publishedAt ?? new Date()) : undefined,
      },
      select: SNAPSHOT_FIELDS,
    });
    await recordAudit(tx, {
      actorId,
      action: `product.${target === "published" ? "publish" : target === "archived" ? "archive" : "unpublish"}`,
      entity: "product",
      entityId: id,
      before,
      after,
    });
  });
}

/**
 * Deletes a draft that was never sold or downloaded, with its images and files.
 * Everything else is archived instead (spec §9: no hard deletes for products with sales).
 */
export async function deleteProduct(
  db: PrismaClient,
  storage: Storage,
  actorId: string,
  id: string,
): Promise<void> {
  const removed = await db.$transaction(async (tx) => {
    const before = await findProductOrFail(tx, id);
    if (before.status !== "draft") throw new ActionError("deleteOnlyDrafts");

    const [sales, downloads, entitlements] = await Promise.all([
      tx.orderItem.count({ where: { productId: id } }),
      tx.downloadLog.count({ where: { file: { productId: id } } }),
      tx.entitlement.count({ where: { productId: id } }),
    ]);
    if (sales > 0 || downloads > 0 || entitlements > 0) throw new ActionError("hasSales");

    const [images, files] = await Promise.all([
      tx.productImage.findMany({ where: { productId: id }, select: { storageKey: true } }),
      tx.productFile.findMany({ where: { productId: id }, select: { storageKey: true } }),
    ]);
    await tx.productFile.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
    await recordAudit(tx, {
      actorId,
      action: "product.delete",
      entity: "product",
      entityId: id,
      before,
    });
    return { images, files };
  });

  // Storage cleanup after commit; a failure leaves an orphan object, never a broken row.
  await Promise.allSettled([
    ...removed.images.map(({ storageKey }) => storage.delete("public", storageKey)),
    ...removed.files.map(({ storageKey }) => storage.delete("private", storageKey)),
  ]);
}
