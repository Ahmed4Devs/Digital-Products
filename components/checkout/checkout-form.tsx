"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  placeOrderAction,
  quoteCheckoutAction,
  type CheckoutQuoteView,
} from "@/features/checkout/actions";
import { useCheckoutError } from "./use-checkout-messages";

type ProviderOption = { id: "moyasar" | "paddle" | "paypal" | "fake"; currency: "USD" | "SAR" };

type CheckoutFormProps = {
  providers: ProviderOption[];
  initialProviderId: ProviderOption["id"] | null;
  initialQuote: CheckoutQuoteView;
};

/**
 * Coupon, payment method and the final totals. Every figure comes from the server
 * (quoteCheckoutAction); the browser never sends prices (spec §5.1).
 */
export function CheckoutForm({ providers, initialProviderId, initialQuote }: CheckoutFormProps) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const errorText = useCheckoutError();
  const couponId = useId();
  const [providerId, setProviderId] = useState(initialProviderId);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState(initialQuote);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);

  const free = quote.totalUsdCents === 0;

  function requote(nextProvider: ProviderOption["id"] | null, nextCoupon: string) {
    startTransition(async () => {
      const result = await quoteCheckoutAction({
        providerId: nextProvider,
        couponCode: nextCoupon,
      });
      if (result.status === "success" && result.quote) {
        setQuote(result.quote);
        setCoupon(nextCoupon);
        setError(null);
        setNotice(nextCoupon && nextCoupon !== coupon ? t("form.couponApplied") : null);
      } else {
        setError(errorText(result.fieldErrors?.couponCode ?? result.message));
        setNotice(null);
      }
    });
  }

  function pay() {
    startTransition(async () => {
      const result = await placeOrderAction({
        providerId: free ? null : providerId,
        couponCode: coupon,
        locale,
      });
      if (result.status === "success" && result.redirectUrl) {
        setRedirecting(true);
        window.location.assign(result.redirectUrl);
        return;
      }
      setError(
        errorText(result.fieldErrors?.couponCode ?? result.fieldErrors?.provider ?? result.message),
      );
    });
  }

  const rows: [string, number, boolean?][] = [
    [t("form.subtotal"), quote.subtotalUsdCents],
    ...(quote.discountUsdCents > 0
      ? [[t("form.discount"), quote.discountUsdCents, true] as [string, number, boolean]]
      : []),
    ...(quote.taxUsdCents > 0 ? [[t("form.tax"), quote.taxUsdCents] as [string, number]] : []),
  ];

  return (
    <div className="flex flex-col gap-6 rounded-xl border p-4 sm:p-6 lg:sticky lg:top-24 lg:self-start">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          requote(providerId, couponInput.trim());
        }}
      >
        <Label htmlFor={couponId}>{t("form.coupon")}</Label>
        <div className="flex gap-2">
          <Input
            id={couponId}
            value={couponInput}
            onChange={(event) => setCouponInput(event.target.value)}
            autoComplete="off"
            dir="ltr"
            className="uppercase"
          />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={pending || !couponInput.trim()}
          >
            {t("form.apply")}
          </Button>
        </div>
        {coupon ? (
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => {
              setCouponInput("");
              requote(providerId, "");
            }}
          >
            {t("form.removeCoupon")}
          </Button>
        ) : null}
      </form>

      {!free && providers.length === 0 ? (
        <FormAlert tone="error">{t("form.noGateways")}</FormAlert>
      ) : null}
      {!free && providers.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("form.gateway")}</legend>
          {providers.map((provider) => (
            <label
              key={provider.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name="provider"
                value={provider.id}
                checked={providerId === provider.id}
                onChange={() => {
                  setProviderId(provider.id);
                  requote(provider.id, coupon);
                }}
                className="mt-1 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t(`gateways.${provider.id}.name`)}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`gateways.${provider.id}.note`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <dl className="flex flex-col gap-2 text-sm" aria-live="polite">
        {rows.map(([label, amount, negative]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              {negative ? "−" : null}
              <MoneyText locale={locale} amountMinor={amount} currency="USD" />
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
          <dt>{t("form.total")}</dt>
          <dd>
            {free ? (
              t("form.free")
            ) : (
              <MoneyText locale={locale} amountMinor={quote.totalUsdCents} currency="USD" />
            )}
          </dd>
        </div>
        {!free && quote.chargedCurrency !== "USD" ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("form.chargedIn")}</dt>
            <dd className="font-medium">
              <MoneyText
                locale={locale}
                amountMinor={quote.chargedAmountMinor}
                currency={quote.chargedCurrency}
              />
            </dd>
          </div>
        ) : null}
      </dl>

      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending || redirecting || (!free && !providerId)}
        aria-busy={pending || redirecting}
        onClick={pay}
      >
        {pending || redirecting ? (
          <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
        ) : null}
        {redirecting ? t("form.processing") : free ? t("form.payFree") : t("form.pay")}
      </Button>
    </div>
  );
}
