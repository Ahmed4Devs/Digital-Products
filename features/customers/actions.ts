"use server";

import { z } from "zod";
import { actionFailure, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { grantProduct, revokeEntitlement, setCustomerBanned } from "./admin-service";

// Owner Server Actions for customers: owner check → validation → audited service.

const id = z.uuid();
const grantSchema = z.strictObject({ productId: z.uuid({ error: "required" }) });

export async function setCustomerBannedAction(
  userId: string,
  banned: boolean,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await setCustomerBanned(getDb(), owner.id, id.parse(userId), z.boolean().parse(banned));
    return { status: "success", message: banned ? "customerBanned" : "customerUnbanned" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function grantProductAction(
  userId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    const { productId } = grantSchema.parse(formDataObject(formData));
    await grantProduct(getDb(), owner.id, id.parse(userId), productId);
    return { status: "success", message: "accessGranted" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "error", message: "invalid", fieldErrors: { productId: "required" } };
    }
    return actionFailure(error);
  }
}

export async function revokeEntitlementAction(
  userId: string,
  entitlementId: string,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await revokeEntitlement(getDb(), owner.id, id.parse(userId), id.parse(entitlementId));
    return { status: "success", message: "accessRevoked" };
  } catch (error) {
    return actionFailure(error);
  }
}
