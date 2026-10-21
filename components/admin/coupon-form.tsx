"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createCouponAction,
  setCouponActiveAction,
  updateCouponAction,
} from "@/features/coupons/actions";
import type { CouponFormDefaults } from "@/features/coupons/admin-data";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ActionFeedback } from "./action-feedback";
import { ConfirmButton } from "./confirm-button";
import { describedBy, FieldShell, TextField } from "./form-field";
import { useActionForm } from "./use-action-form";

const EMPTY: CouponFormDefaults = {
  type: "percent",
  value: "",
  minSubtotalUsd: "",
  usageLimit: "",
  allowMultiplePerCustomer: false,
  startsAt: "",
  endsAt: "",
  active: true,
};

/** Create a coupon, or edit one (its code is fixed once created). */
export function CouponForm({
  couponId,
  defaults = EMPTY,
}: {
  couponId?: string;
  defaults?: CouponFormDefaults;
}) {
  const t = useTranslations("admin.couponForm");
  const router = useRouter();
  const typeId = useId();
  const [type, setType] = useState(defaults.type);
  const action = couponId ? updateCouponAction.bind(null, couponId) : createCouponAction;
  const { state, pending, onSubmit } = useActionForm(action, (result) => {
    if (!couponId && result.id) router.push(`/admin/coupons/${result.id}?created=1`);
    else router.refresh();
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-5">
      {couponId ? null : (
        <TextField
          name="code"
          label={t("code")}
          hint={t("codeHint")}
          error={errors.code}
          dir="ltr"
          autoComplete="off"
          maxLength={40}
          required
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell id={typeId} label={t("type")} error={errors.type}>
          <NativeSelect
            id={typeId}
            name="type"
            value={type}
            onChange={(event) => setType(event.currentTarget.value as "percent" | "fixed")}
            aria-describedby={describedBy(typeId, undefined, errors.type)}
          >
            <option value="percent">{t("percent")}</option>
            <option value="fixed">{t("fixed")}</option>
          </NativeSelect>
        </FieldShell>
        <TextField
          name="value"
          label={type === "percent" ? t("percentValue") : t("fixedValue")}
          hint={type === "percent" ? t("percentHint") : t("fixedHint")}
          defaultValue={defaults.value}
          error={errors.value}
          inputMode={type === "percent" ? "numeric" : "decimal"}
          dir="ltr"
          required
        />
        <TextField
          name="minSubtotalUsd"
          label={t("minSubtotal")}
          hint={t("optional")}
          defaultValue={defaults.minSubtotalUsd}
          error={errors.minSubtotalUsd}
          inputMode="decimal"
          dir="ltr"
        />
        <TextField
          name="usageLimit"
          label={t("usageLimit")}
          hint={t("usageLimitHint")}
          defaultValue={defaults.usageLimit}
          error={errors.usageLimit}
          inputMode="numeric"
          dir="ltr"
        />
        <TextField
          name="startsAt"
          type="datetime-local"
          label={t("startsAt")}
          hint={t("timeZoneHint")}
          defaultValue={defaults.startsAt}
          error={errors.startsAt}
        />
        <TextField
          name="endsAt"
          type="datetime-local"
          label={t("endsAt")}
          hint={t("timeZoneHint")}
          defaultValue={defaults.endsAt}
          error={errors.endsAt}
        />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${typeId}-multiple`}
            name="allowMultiplePerCustomer"
            defaultChecked={defaults.allowMultiplePerCustomer}
          />
          <Label htmlFor={`${typeId}-multiple`}>{t("allowMultiple")}</Label>
        </div>
        {couponId ? null : (
          <div className="flex items-center gap-2">
            <Checkbox id={`${typeId}-active`} name="active" defaultChecked={defaults.active} />
            <Label htmlFor={`${typeId}-active`}>{t("active")}</Label>
          </div>
        )}
      </div>
      <ActionFeedback state={state} />
      <div className="sm:w-48">
        <SubmitButton pending={pending}>{couponId ? t("save") : t("create")}</SubmitButton>
      </div>
    </form>
  );
}

/** Quick switch from the coupon page; reservations already held stay valid. */
export function CouponActiveButton({ couponId, active }: { couponId: string; active: boolean }) {
  const t = useTranslations("admin.couponForm");
  const router = useRouter();
  const [state, setState] = useState<ActionState>(IDLE);
  const [pending, startTransition] = useTransition();
  function run(next: boolean) {
    startTransition(async () => {
      const result = await setCouponActiveAction(couponId, next);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }
  return (
    <div className="flex flex-col items-start gap-3">
      {active ? (
        <ConfirmButton
          variant="outline"
          title={t("deactivateTitle")}
          description={t("deactivateDescription")}
          confirmLabel={t("confirmDeactivate")}
          cancelLabel={t("cancel")}
          disabled={pending}
          onConfirm={() => run(false)}
        >
          {t("deactivate")}
        </ConfirmButton>
      ) : (
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(true)}>
          {t("activate")}
        </Button>
      )}
      <ActionFeedback state={state} />
    </div>
  );
}
