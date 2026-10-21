"use server";

import { refreshProductCaches, refreshSettingsCaches } from "@/features/catalog-refresh";
import { actionFailure, fieldErrorsFrom, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { exchangeRateSchema, gatewaySettingsSchema } from "./schemas";
import { updateExchangeRate, updateGateways } from "./service";

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

export async function updateGatewaysAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = gatewaySettingsSchema.safeParse(formDataObject(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };
  try {
    await updateGateways(getDb(), owner.id, parsed.data);
    return { status: "success", message: "settingsSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}
