import type { Locale } from "next-intl";
import { useFormatter } from "next-intl";
import { MoneyText } from "@/components/shared/money-text";

/** "15%" or "US$5.00", as the coupon would discount. */
export function CouponDiscount({
  locale,
  type,
  value,
}: {
  locale: Locale;
  type: "percent" | "fixed";
  value: number;
}) {
  const format = useFormatter();
  if (type === "percent") return <span>{format.number(value / 100, "percent")}</span>;
  return <MoneyText locale={locale} amountMinor={value} currency="USD" />;
}
