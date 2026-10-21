import {
  assertMinorUnits,
  MoneyError,
  sarPriceHalalas,
  usdCentsToSarHalalas,
  type Currency,
  type PricedProduct,
} from "./index";

// Order pricing (spec §10.3, §17.5 §3, §17.5 §6): pure, integer-only, and the single
// place that turns cart lines, a coupon and the store tax into what is charged.

/** n / d rounded half up, for non-negative integers. */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new MoneyError("Denominator must be positive");
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return Number((n * 2n + d) / (2n * d));
}

/**
 * Splits `total` into integer parts proportional to `weights` (largest remainder, ties to
 * the earliest line), so the parts always add up to `total` exactly.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  assertMinorUnits(total);
  weights.forEach(assertMinorUnits);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum === 0) {
    if (total !== 0) throw new MoneyError("Cannot allocate a positive amount over zero weights");
    return weights.map(() => 0);
  }
  const exact = weights.map((weight) => {
    const product = BigInt(total) * BigInt(weight);
    return { floor: Number(product / BigInt(sum)), remainder: Number(product % BigInt(sum)) };
  });
  let left = total - exact.reduce((acc, part) => acc + part.floor, 0);
  const order = exact
    .map((part, index) => ({ index, remainder: part.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const parts = exact.map((part) => part.floor);
  for (const { index } of order) {
    if (left === 0) break;
    parts[index]! += 1;
    left -= 1;
  }
  return parts;
}

export type CouponTerms =
  | { type: "percent"; value: number }
  /** A fixed amount in USD cents. */
  | { type: "fixed"; value: number };

/**
 * Discount on a subtotal, never more than the subtotal. A fixed coupon is defined in USD
 * cents; for a SAR subtotal it is converted at the order's rate.
 */
export function couponDiscount(
  subtotalMinor: number,
  coupon: CouponTerms,
  currency: Currency,
  usdToSarRate: string,
): number {
  assertMinorUnits(subtotalMinor);
  if (coupon.type === "percent") {
    if (!Number.isInteger(coupon.value) || coupon.value < 1 || coupon.value > 100) {
      throw new MoneyError("Percent coupons must be between 1 and 100");
    }
    return Math.min(subtotalMinor, divideRoundHalfUp(subtotalMinor * coupon.value, 100));
  }
  assertMinorUnits(coupon.value);
  const amount =
    currency === "USD" ? coupon.value : usdCentsToSarHalalas(coupon.value, usdToSarRate);
  return Math.min(subtotalMinor, amount);
}

/** Store tax in basis points (1500 = 15 %) on a taxable amount, rounded half up. */
export function storeTax(taxableMinor: number, basisPoints: number): number {
  assertMinorUnits(taxableMinor);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError("Tax rates must be between 0 and 10000 basis points");
  }
  return divideRoundHalfUp(taxableMinor * basisPoints, 10_000);
}

export type PricingLine = PricedProduct & { productId: string };

export type PricingInput = {
  lines: PricingLine[];
  coupon: CouponTerms | null;
  /** The store's own tax; never applied for Paddle, the Merchant of Record (§17.5 §3). */
  tax: { enabled: boolean; basisPoints: number };
  applyStoreTax: boolean;
  chargeCurrency: Currency;
  usdToSarRate: string;
};

export type PricedLine = {
  productId: string;
  unitPriceUsdCents: number;
  /** The line after its share of the discount, in the charged currency, before tax. */
  unitChargedMinor: number;
};

export type OrderPricing = {
  subtotalUsdCents: number;
  discountUsdCents: number;
  taxUsdCents: number;
  totalUsdCents: number;
  chargedCurrency: Currency;
  chargedAmountMinor: number;
  chargedTaxMinor: number;
  lines: PricedLine[];
};

function priceIn(
  currency: Currency,
  input: PricingInput,
  bases: number[],
): { subtotal: number; discount: number; tax: number; lines: number[] } {
  const subtotal = bases.reduce((sum, base) => sum + base, 0);
  const discount = input.coupon
    ? couponDiscount(subtotal, input.coupon, currency, input.usdToSarRate)
    : 0;
  const shares = allocateProportionally(discount, bases);
  const lines = bases.map((base, index) => base - shares[index]!);
  const tax =
    input.applyStoreTax && input.tax.enabled
      ? storeTax(subtotal - discount, input.tax.basisPoints)
      : 0;
  return { subtotal, discount, tax, lines };
}

/**
 * Prices an order: USD totals for the record (spec §9) and the amounts to charge. SAR is
 * charged only through Moyasar; each line's SAR price is the owner's fixed price or the
 * converted one, and a coupon is applied to the SAR subtotal directly, so the customer
 * pays exactly what the store showed.
 */
export function priceOrder(input: PricingInput): OrderPricing {
  if (input.lines.length === 0) throw new MoneyError("An order needs at least one line");
  const usd = priceIn(
    "USD",
    input,
    input.lines.map((line) => line.priceUsdCents),
  );
  const charged =
    input.chargeCurrency === "USD"
      ? usd
      : priceIn(
          "SAR",
          input,
          input.lines.map((line) => sarPriceHalalas(line, input.usdToSarRate)),
        );

  return {
    subtotalUsdCents: usd.subtotal,
    discountUsdCents: usd.discount,
    taxUsdCents: usd.tax,
    totalUsdCents: usd.subtotal - usd.discount + usd.tax,
    chargedCurrency: input.chargeCurrency,
    chargedAmountMinor: charged.subtotal - charged.discount + charged.tax,
    chargedTaxMinor: charged.tax,
    lines: input.lines.map((line, index) => ({
      productId: line.productId,
      unitPriceUsdCents: line.priceUsdCents,
      unitChargedMinor: charged.lines[index]!,
    })),
  };
}
