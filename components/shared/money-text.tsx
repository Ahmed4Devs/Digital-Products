import type { Locale } from "next-intl";
import { formats } from "@/i18n/formats";
import { toMajorUnits, type Currency } from "@/lib/money";

const FORMAT_FOR: Record<Currency, keyof typeof formats.number> = { USD: "usd", SAR: "sar" };

type MoneyTextProps = {
  locale: Locale;
  amountMinor: number;
  currency: Currency;
};

/**
 * A price formatted with the shared named format (Latin digits, spec §7.4). The currency
 * symbol is bidi-isolated and takes its direction from its own letters: inside Arabic
 * text "US$" would otherwise be reordered into "$US", and "ر.س." must stay right-to-left.
 */
export function MoneyText({ locale, amountMinor, currency }: MoneyTextProps) {
  const parts = new Intl.NumberFormat(locale, formats.number[FORMAT_FOR[currency]]).formatToParts(
    toMajorUnits(amountMinor, currency),
  );
  return (
    <span>
      {parts.map((part, index) =>
        part.type === "currency" ? <bdi key={index}>{part.value}</bdi> : part.value,
      )}
    </span>
  );
}
