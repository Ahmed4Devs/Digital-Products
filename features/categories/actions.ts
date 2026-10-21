"use server";

import { z } from "zod";
import { refreshCategoryCaches } from "@/features/catalog-refresh";
import { actionFailure, fieldErrorsFrom, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { categoryFormSchema, categoryMoveSchema } from "./schemas";
import { createCategory, deleteCategory, moveCategory, updateCategory } from "./service";

// Owner Server Actions for categories (same pattern as features/products/actions.ts).

const id = z.uuid();

export async function createCategoryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = categoryFormSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const category = await createCategory(getDb(), owner.id, parsed.data);
    refreshCategoryCaches();
    return { status: "success", message: "categoryCreated", id: category.id };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateCategoryAction(
  categoryId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = categoryFormSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateCategory(getDb(), owner.id, id.parse(categoryId), parsed.data);
    refreshCategoryCaches();
    return { status: "success", message: "categorySaved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await deleteCategory(getDb(), owner.id, id.parse(categoryId));
    refreshCategoryCaches();
    return { status: "success", message: "categoryDeleted" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function moveCategoryAction(
  categoryId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    const input = categoryMoveSchema.parse({ id: categoryId, direction });
    await moveCategory(getDb(), owner.id, input.id, input.direction);
    refreshCategoryCaches();
    return { status: "success", message: "categoryMoved" };
  } catch (error) {
    return actionFailure(error);
  }
}
