"use server";

import { refreshProductCaches, refreshSettingsCaches } from "@/features/catalog-refresh";
import { actionFailure, fieldErrorsFrom, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { exchangeRateSchema } from "./schemas";
import { updateExchangeRate } from "./service";

export async function updateExchangeRateAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = exchangeRateSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateExchangeRate(getDb(), owner.id, parsed.data.usdToSarRate);
    // Every SAR price on the storefront depends on the rate.
    refreshSettingsCaches();
    refreshProductCaches();
    return { status: "success", message: "settingsSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}
