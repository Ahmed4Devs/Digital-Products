"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { completeFakePaymentAction } from "@/features/checkout/actions";
import { useCheckoutError } from "./use-checkout-messages";

/** Buttons of the test-only fake gateway (TEST_DOUBLES). */
export function FakeCheckout({ reference }: { reference: string }) {
  const t = useTranslations("checkout.fake");
  const locale = useLocale();
  const errorText = useCheckoutError();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function complete(outcome: "paid" | "failed") {
    startTransition(async () => {
      const result = await completeFakePaymentAction({ reference, outcome, locale });
      if (result.status === "success" && result.redirectUrl)
        window.location.assign(result.redirectUrl);
      else setError(errorText(result.message));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button size="lg" disabled={pending} onClick={() => complete("paid")}>
          {t("pay")}
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => complete("failed")}>
          {t("fail")}
        </Button>
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
    </div>
  );
}
