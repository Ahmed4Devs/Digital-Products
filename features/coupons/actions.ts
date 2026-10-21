"use server";

import { z } from "zod";
import { actionFailure, fieldErrorsFrom, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { couponCreateSchema, couponUpdateSchema } from "./schemas";
import { createCoupon, setCouponActive, updateCoupon } from "./service";

// Owner Server Actions for coupons: owner check → validation → audited service. Coupons
// only affect checkout, which is dynamic, so no storefront cache needs refreshing.

const id = z.uuid();

export async function createCouponAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = couponCreateSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const created = await createCoupon(getDb(), owner.id, parsed.data);
    return { status: "success", message: "couponCreated", id: created.id };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateCouponAction(
  couponId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = couponUpdateSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateCoupon(getDb(), owner.id, id.parse(couponId), parsed.data);
    return { status: "success", message: "couponSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setCouponActiveAction(
  couponId: string,
  active: boolean,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await setCouponActive(getDb(), owner.id, id.parse(couponId), z.boolean().parse(active));
    return { status: "success", message: active ? "couponActivated" : "couponDeactivated" };
  } catch (error) {
    return actionFailure(error);
  }
}
