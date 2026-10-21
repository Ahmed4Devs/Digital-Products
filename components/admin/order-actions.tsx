"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  refundOrderAction,
  resendReceiptAction,
  setItemAccessAction,
} from "@/features/orders/actions";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { ActionFeedback } from "./action-feedback";
import { ConfirmButton } from "./confirm-button";

function useOrderAction() {
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

/** Resend the receipt and refund, for the order's header. */
export function OrderActions({
  orderId,
  canResend,
  canRefund,
}: {
  orderId: string;
  canResend: boolean;
  canRefund: boolean;
}) {
  const t = useTranslations("admin.orderDetail");
  const { state, pending, run } = useOrderAction();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canResend || pending}
          onClick={() => run(() => resendReceiptAction(orderId))}
        >
          {t("resendReceipt")}
        </Button>
        <ConfirmButton
          title={t("refundTitle")}
          description={t("refundDescription")}
          confirmLabel={t("confirmRefund")}
          cancelLabel={t("cancel")}
          disabled={!canRefund || pending}
          onConfirm={() => run(() => refundOrderAction(orderId))}
        >
          {t("refund")}
        </ConfirmButton>
      </div>
      <ActionFeedback state={state} />
    </div>
  );
}

/** Grant or revoke the access one order item gave. */
export function ItemAccessButton({
  orderId,
  orderItemId,
  active,
  canGrant,
  productTitle,
}: {
  orderId: string;
  orderItemId: string;
  active: boolean;
  canGrant: boolean;
  productTitle: string;
}) {
  const t = useTranslations("admin.orderDetail");
  const { state, pending, run } = useOrderAction();

  return (
    <div className="flex flex-col items-start gap-2">
      {active ? (
        <ConfirmButton
          size="sm"
          variant="outline"
          label={t("revokeFor", { title: productTitle })}
          title={t("revokeTitle")}
          description={t("revokeDescription")}
          confirmLabel={t("confirmRevoke")}
          cancelLabel={t("cancel")}
          disabled={pending}
          onConfirm={() => run(() => setItemAccessAction(orderId, orderItemId, false))}
        >
          {t("revoke")}
        </ConfirmButton>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("grantFor", { title: productTitle })}
          disabled={!canGrant || pending}
          onClick={() => run(() => setItemAccessAction(orderId, orderItemId, true))}
        >
          {t("grant")}
        </Button>
      )}
      <ActionFeedback state={state} />
    </div>
  );
}
