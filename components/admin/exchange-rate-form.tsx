"use client";

import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/auth/submit-button";
import { updateExchangeRateAction } from "@/features/settings/actions";
import { ActionFeedback } from "./action-feedback";
import { TextField } from "./form-field";
import { useActionForm } from "./use-action-form";

/** The owner-editable USD → SAR rate (spec §10.3). */
export function ExchangeRateForm({ usdToSarRate }: { usdToSarRate: string }) {
  const t = useTranslations("admin.settings");
  const { state, pending, onSubmit } = useActionForm(updateExchangeRateAction);

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <TextField
        name="usdToSarRate"
        label={t("usdToSarRate")}
        hint={t("rateHint")}
        defaultValue={usdToSarRate}
        error={state.fieldErrors?.usdToSarRate}
        inputMode="decimal"
        dir="ltr"
        required
      />
      <ActionFeedback state={state} />
      <div className="sm:w-40">
        <SubmitButton pending={pending}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
