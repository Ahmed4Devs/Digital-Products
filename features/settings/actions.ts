"use server";

import { refreshProductCaches, refreshSettingsCaches } from "@/features/catalog-refresh";
import { actionFailure, fieldErrorsFrom, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { z } from "zod";
import { serverEnv } from "@/lib/env/server";
import { getStorage } from "@/lib/storage";
import { confirmLogoUpload, logoRequestSchema, removeLogo, requestLogoUpload } from "./logos";
import {
  exchangeRateSchema,
  gatewaySettingsSchema,
  legalPageSchema,
  storeSettingsSchema,
} from "./schemas";
import {
  updateExchangeRate,
  updateGateways,
  updateLegalPage,
  updateStoreSettings,
} from "./service";

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
    refreshSettingsCaches();
    return { status: "success", message: "settingsSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateStoreSettingsAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = storeSettingsSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateStoreSettings(getDb(), owner.id, parsed.data);
    refreshSettingsCaches();
    return { status: "success", message: "settingsSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateLegalPageAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = legalPageSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateLegalPage(getDb(), owner.id, parsed.data);
    refreshSettingsCaches();
    return { status: "success", message: "settingsSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function requestLogoUploadAction(
  request: z.input<typeof logoRequestSchema>,
): Promise<ActionState & { upload?: { url: string; token: string; contentType: string } }> {
  await requireOwner();
  try {
    return {
      status: "success",
      upload: await requestLogoUpload(getStorage(), serverEnv().BETTER_AUTH_SECRET, request),
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmLogoUploadAction(confirmation: {
  token: string;
}): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await confirmLogoUpload(
      getDb(),
      getStorage(),
      serverEnv().BETTER_AUTH_SECRET,
      owner.id,
      z.string().min(1).max(4_096).parse(confirmation.token),
    );
    refreshSettingsCaches();
    return { status: "success", message: "logoAdded" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeLogoAction(variant: "light" | "dark"): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await removeLogo(getDb(), getStorage(), owner.id, z.enum(["light", "dark"]).parse(variant));
    refreshSettingsCaches();
    return { status: "success", message: "logoRemoved" };
  } catch (error) {
    return actionFailure(error);
  }
}
