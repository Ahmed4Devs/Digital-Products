"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  grantProductAction,
  revokeEntitlementAction,
  setCustomerBannedAction,
} from "@/features/customers/actions";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ActionFeedback } from "./action-feedback";
import { ConfirmButton } from "./confirm-button";
import { describedBy, FieldShell } from "./form-field";
import { useActionForm } from "./use-action-form";

function useCustomerAction() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(IDLE);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action();
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }
  return { state, pending, run };
}

export function BanButton({ userId, banned }: { userId: string; banned: boolean }) {
  const t = useTranslations("admin.customerDetail");
  const { state, pending, run } = useCustomerAction();
  return (
    <div className="flex flex-col items-start gap-3">
      {banned ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setCustomerBannedAction(userId, false))}
        >
          {t("unban")}
        </Button>
      ) : (
        <ConfirmButton
          title={t("banTitle")}
          description={t("banDescription")}
          confirmLabel={t("confirmBan")}
          cancelLabel={t("cancel")}
          disabled={pending}
          onConfirm={() => run(() => setCustomerBannedAction(userId, true))}
        >
          {t("ban")}
        </ConfirmButton>
      )}
      <ActionFeedback state={state} />
    </div>
  );
}

export function RevokeEntitlementButton({
  userId,
  entitlementId,
  productTitle,
}: {
  userId: string;
  entitlementId: string;
  productTitle: string;
}) {
  const t = useTranslations("admin.customerDetail");
  const { state, pending, run } = useCustomerAction();
  return (
    <div className="flex flex-col items-start gap-2">
      <ConfirmButton
        size="sm"
        variant="outline"
        label={t("revokeFor", { title: productTitle })}
        title={t("revokeTitle")}
        description={t("revokeDescription")}
        confirmLabel={t("confirmRevoke")}
        cancelLabel={t("cancel")}
        disabled={pending}
        onConfirm={() => run(() => revokeEntitlementAction(userId, entitlementId))}
      >
        {t("revoke")}
      </ConfirmButton>
      <ActionFeedback state={state} />
    </div>
  );
}

export function GrantProductForm({
  userId,
  products,
}: {
  userId: string;
  products: { id: string; title: string; archived: boolean }[];
}) {
  const t = useTranslations("admin.customerDetail");
  const router = useRouter();
  const fieldId = useId();
  const { state, pending, onSubmit } = useActionForm(grantProductAction.bind(null, userId), () =>
    router.refresh(),
  );
  const error = state.fieldErrors?.productId;

  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("nothingToGrant")}</p>;
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FieldShell id={fieldId} label={t("grantProduct")} error={error} className="flex-1">
          <NativeSelect
            id={fieldId}
            name="productId"
            defaultValue=""
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(fieldId, undefined, error)}
          >
            <option value="" disabled>
              {t("chooseProduct")}
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.archived ? t("archivedProduct", { title: product.title }) : product.title}
              </option>
            ))}
          </NativeSelect>
        </FieldShell>
        <div className="sm:w-40">
          <SubmitButton pending={pending}>{t("grant")}</SubmitButton>
        </div>
      </div>
      {error ? null : <ActionFeedback state={state} />}
    </form>
  );
}
