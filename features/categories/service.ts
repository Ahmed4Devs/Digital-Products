import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import type { CategoryFormValues } from "./schemas";

// Owner writes for categories (spec §11): create, edit, reorder, and delete when empty.

const SNAPSHOT = { slug: true, nameAr: true, nameEn: true, sortOrder: true } as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createCategory(
  db: PrismaClient,
  actorId: string,
  input: CategoryFormValues,
): Promise<{ id: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const last = await tx.category.aggregate({ _max: { sortOrder: true } });
      const { id, ...after } = await tx.category.create({
        data: { ...input, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true, ...SNAPSHOT },
      });
      await recordAudit(tx, {
        actorId,
        action: "category.create",
        entity: "category",
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

export async function updateCategory(
  db: PrismaClient,
  actorId: string,
  id: string,
  input: CategoryFormValues,
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id }, select: SNAPSHOT });
      if (!before) throw new ActionError("notFound");
      const after = await tx.category.update({ where: { id }, data: input, select: SNAPSHOT });
      await recordAudit(tx, {
        actorId,
        action: "category.update",
        entity: "category",
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

/** Only empty categories can be deleted; products must be moved out first. */
export async function deleteCategory(db: PrismaClient, actorId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.category.findUnique({
      where: { id },
      select: { ...SNAPSHOT, _count: { select: { products: true } } },
    });
    if (!before) throw new ActionError("notFound");
    if (before._count.products > 0) throw new ActionError("categoryInUse");
    const { _count, ...snapshot } = before;
    await tx.category.delete({ where: { id } });
    await recordAudit(tx, {
      actorId,
      action: "category.delete",
      entity: "category",
      entityId: id,
      before: snapshot,
    });
  });
}

/**
 * Moves a category one place up or down. The whole list is renumbered 1…n in the same
 * transaction, so gaps or ties left by earlier edits disappear.
 */
export async function moveCategory(
  db: PrismaClient,
  actorId: string,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await db.$transaction(async (tx) => {
    const categories = await tx.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const index = categories.findIndex((category) => category.id === id);
    if (index === -1) throw new ActionError("notFound");
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= categories.length) return;

    const order = categories.map((category) => category.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    for (const [position, categoryId] of order.entries()) {
      await tx.category.update({ where: { id: categoryId }, data: { sortOrder: position + 1 } });
    }
    await recordAudit(tx, {
      actorId,
      action: "category.reorder",
      entity: "category",
      entityId: id,
      details: { direction, order },
    });
  });
}
