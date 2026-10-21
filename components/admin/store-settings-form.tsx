"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { updateStoreSettingsAction } from "@/features/settings/actions";
import { useRouter } from "@/i18n/navigation";
import { ActionFeedback } from "./action-feedback";
import { TextField } from "./form-field";
import { useActionForm } from "./use-action-form";

export type StoreSettingsDefaults = {
  storeNameAr: string;
  storeNameEn: string;
  supportEmail: string;
  taxEnabled: boolean;
  taxRate: string;
  vatNumber: string;
  downloadsPerMinute: string;
  pendingOrderTtlMinutes: string;
};

/** Store details, tax and limits (spec §11 settings). */
export function StoreSettingsForm({ defaults }: { defaults: StoreSettingsDefaults }) {
  const t = useTranslations("admin.storeSettings");
  const router = useRouter();
  const taxId = useId();
  const { state, pending, onSubmit } = useActionForm(updateStoreSettingsAction, () =>
    router.refresh(),
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-medium">{t("details")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="storeNameAr"
            label={t("storeNameAr")}
            defaultValue={defaults.storeNameAr}
            error={errors.storeNameAr}
            maxGraphemes={60}
            dir="rtl"
            lang="ar"
          />
          <TextField
            name="storeNameEn"
            label={t("storeNameEn")}
            defaultValue={defaults.storeNameEn}
            error={errors.storeNameEn}
            maxGraphemes={60}
            dir="ltr"
            lang="en"
          />
        </div>
        <TextField
          name="supportEmail"
          type="email"
          label={t("supportEmail")}
          hint={t("supportEmailHint")}
          defaultValue={defaults.supportEmail}
          error={errors.supportEmail}
          dir="ltr"
          autoComplete="off"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-medium">{t("tax")}</legend>
        <p className="text-sm text-muted-foreground">{t("taxHint")}</p>
        <div className="flex items-center gap-2">
          <Checkbox id={taxId} name="taxEnabled" defaultChecked={defaults.taxEnabled} />
          <Label htmlFor={taxId}>{t("taxEnabled")}</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="taxRate"
            label={t("taxRate")}
            hint={t("taxRateHint")}
            defaultValue={defaults.taxRate}
            error={errors.taxRate}
            inputMode="decimal"
            dir="ltr"
          />
          <TextField
            name="vatNumber"
            label={t("vatNumber")}
            hint={t("vatNumberHint")}
            defaultValue={defaults.vatNumber}
            error={errors.vatNumber}
            dir="ltr"
            autoComplete="off"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-medium">{t("limits")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="downloadsPerMinute"
            label={t("downloadsPerMinute")}
            hint={t("downloadsPerMinuteHint")}
            defaultValue={defaults.downloadsPerMinute}
            error={errors.downloadsPerMinute}
            inputMode="numeric"
            dir="ltr"
          />
          <TextField
            name="pendingOrderTtlMinutes"
            label={t("pendingOrderTtl")}
            hint={t("pendingOrderTtlHint")}
            defaultValue={defaults.pendingOrderTtlMinutes}
            error={errors.pendingOrderTtlMinutes}
            inputMode="numeric"
            dir="ltr"
          />
        </div>
      </fieldset>

      <ActionFeedback state={state} />
      <div className="sm:w-40">
        <SubmitButton pending={pending}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
