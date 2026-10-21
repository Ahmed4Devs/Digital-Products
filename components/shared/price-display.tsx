import { getLocale, getTranslations } from "next-intl/server";
import { sarPriceHalalas } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MoneyText } from "./money-text";

type PriceDisplayProps = {
  priceUsdCents: number;
  fixedPriceSarHalalas: number | null;
  compareAtPriceUsdCents: number | null;
  /** USD → SAR rate from the store settings, as a decimal string. */
  usdToSarRate: string;
  size?: "md" | "lg";
  className?: string;
};

/**
 * USD price first with the SAR equivalent beneath it (spec §7.4, §10.3), formatted with
 * Latin digits in both languages. SAR comes from the owner's fixed price when set,
 * otherwise from the exchange rate (lib/money).
 */
export async function PriceDisplay({
  priceUsdCents,
  fixedPriceSarHalalas,
  compareAtPriceUsdCents,
  usdToSarRate,
  size = "md",
  className,
}: PriceDisplayProps) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("store.price")]);

  if (priceUsdCents === 0) {
    return (
      <p
        className={cn(
          "font-semibold text-primary",
          size === "lg" ? "text-2xl" : "text-base",
          className,
        )}
      >
        {t("free")}
      </p>
    );
  }

  const sar = sarPriceHalalas({ priceUsdCents, fixedPriceSarHalalas }, usdToSarRate);
  const showCompareAt = compareAtPriceUsdCents !== null && compareAtPriceUsdCents > priceUsdCents;

  return (
    <div className={cn("flex flex-col", className)}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="sr-only">{t("label")}</span>
        <span className={cn("font-semibold", size === "lg" ? "text-2xl" : "text-base")}>
          <MoneyText locale={locale} amountMinor={priceUsdCents} currency="USD" />
        </span>
        {showCompareAt ? (
          <del className="text-sm text-muted-foreground">
            <span className="sr-only">{t("originalPrice")} </span>
            <MoneyText locale={locale} amountMinor={compareAtPriceUsdCents} currency="USD" />
          </del>
        ) : null}
      </p>
      <p className={cn("text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}>
        <span className="sr-only">{t("sarEquivalent")} </span>
        <MoneyText locale={locale} amountMinor={sar} currency="SAR" />
      </p>
    </div>
  );
}
