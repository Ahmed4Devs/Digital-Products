import { describe, expect, it } from "vitest";
import { MoneyError } from "@/lib/money";
import {
  allocateProportionally,
  couponDiscount,
  divideRoundHalfUp,
  priceOrder,
  storeTax,
  type PricingInput,
} from "@/lib/money/order";

const line = (
  productId: string,
  priceUsdCents: number,
  fixedPriceSarHalalas: number | null = null,
) => ({
  productId,
  priceUsdCents,
  fixedPriceSarHalalas,
});

const base: Omit<PricingInput, "lines"> = {
  coupon: null,
  tax: { enabled: false, basisPoints: 0 },
  applyStoreTax: true,
  chargeCurrency: "USD",
  usdToSarRate: "3.75",
};

describe("divideRoundHalfUp", () => {
  it("rounds halves up and everything else to the nearest integer", () => {
    expect(divideRoundHalfUp(5, 2)).toBe(3);
    expect(divideRoundHalfUp(4, 2)).toBe(2);
    expect(divideRoundHalfUp(149, 100)).toBe(1);
    expect(divideRoundHalfUp(150, 100)).toBe(2);
    expect(divideRoundHalfUp(0, 7)).toBe(0);
    expect(() => divideRoundHalfUp(1, 0)).toThrow(MoneyError);
  });
});

describe("allocateProportionally", () => {
  it("always sums to the total", () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(10, [500, 300, 200])).toEqual([5, 3, 2]);
    expect(allocateProportionally(1, [999, 1])).toEqual([1, 0]);
    expect(allocateProportionally(0, [10, 20])).toEqual([0, 0]);
    expect(allocateProportionally(0, [0, 0])).toEqual([0, 0]);
    for (const [total, weights] of [
      [997, [333, 333, 334]],
      [12345, [1, 2, 3, 4, 5]],
      [1, [1, 1, 1]],
    ] as const) {
      const parts = allocateProportionally(total, [...weights]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("refuses impossible allocations", () => {
    expect(() => allocateProportionally(5, [0, 0])).toThrow(MoneyError);
    expect(() => allocateProportionally(-1, [1])).toThrow(MoneyError);
  });
});

describe("couponDiscount", () => {
  it("applies percentages with half-up rounding and caps at the subtotal", () => {
    expect(couponDiscount(1999, { type: "percent", value: 10 }, "USD", "3.75")).toBe(200);
    expect(couponDiscount(1999, { type: "percent", value: 100 }, "USD", "3.75")).toBe(1999);
    expect(couponDiscount(500, { type: "fixed", value: 700 }, "USD", "3.75")).toBe(500);
    expect(couponDiscount(5000, { type: "fixed", value: 700 }, "USD", "3.75")).toBe(700);
  });

  it("converts fixed USD coupons for SAR subtotals", () => {
    expect(couponDiscount(10_000, { type: "fixed", value: 500 }, "SAR", "3.75")).toBe(1875);
  });

  it("rejects invalid percentages", () => {
    for (const value of [0, 101, 1.5]) {
      expect(() => couponDiscount(100, { type: "percent", value }, "USD", "3.75")).toThrow(
        MoneyError,
      );
    }
  });
});

describe("storeTax", () => {
  it("rounds half up in basis points", () => {
    expect(storeTax(1000, 1500)).toBe(150);
    expect(storeTax(333, 1500)).toBe(50);
    expect(storeTax(0, 1500)).toBe(0);
    expect(() => storeTax(100, 10_001)).toThrow(MoneyError);
  });
});

describe("priceOrder", () => {
  it("prices a USD order with a coupon spread over the lines", () => {
    const pricing = priceOrder({
      ...base,
      lines: [line("a", 1200), line("b", 2900)],
      coupon: { type: "percent", value: 10 },
    });
    expect(pricing).toMatchObject({
      subtotalUsdCents: 4100,
      discountUsdCents: 410,
      taxUsdCents: 0,
      totalUsdCents: 3690,
      chargedCurrency: "USD",
      chargedAmountMinor: 3690,
    });
    expect(pricing.lines.map((l) => l.unitChargedMinor)).toEqual([1080, 2610]);
    expect(pricing.lines.reduce((sum, l) => sum + l.unitChargedMinor, 0)).toBe(3690);
  });

  it("charges SAR with fixed prices and a coupon on the SAR subtotal", () => {
    const pricing = priceOrder({
      ...base,
      chargeCurrency: "SAR",
      lines: [line("a", 1999, 7400), line("b", 1200)],
      coupon: { type: "percent", value: 50 },
    });
    // SAR: 74.00 (fixed) + 45.00 (converted) = 119.00, half off = 59.50.
    expect(pricing).toMatchObject({
      subtotalUsdCents: 3199,
      discountUsdCents: 1600,
      totalUsdCents: 1599,
      chargedCurrency: "SAR",
      chargedAmountMinor: 5950,
    });
    expect(pricing.lines.map((l) => l.unitChargedMinor)).toEqual([3700, 2250]);
  });

  it("adds store tax after the discount, except where it must not apply", () => {
    const taxed = { ...base, tax: { enabled: true, basisPoints: 1500 } };
    const pricing = priceOrder({
      ...taxed,
      lines: [line("a", 1000)],
      coupon: { type: "fixed", value: 200 },
    });
    expect(pricing).toMatchObject({
      discountUsdCents: 200,
      taxUsdCents: 120,
      totalUsdCents: 920,
      chargedAmountMinor: 920,
      chargedTaxMinor: 120,
    });

    const sar = priceOrder({ ...taxed, chargeCurrency: "SAR", lines: [line("a", 1000)] });
    expect(sar).toMatchObject({ taxUsdCents: 150, chargedAmountMinor: 4313, chargedTaxMinor: 563 });

    // Paddle is the Merchant of Record: never the store's tax.
    const paddle = priceOrder({ ...taxed, applyStoreTax: false, lines: [line("a", 1000)] });
    expect(paddle).toMatchObject({ taxUsdCents: 0, totalUsdCents: 1000, chargedTaxMinor: 0 });

    const disabled = priceOrder({
      ...base,
      tax: { enabled: false, basisPoints: 1500 },
      lines: [line("a", 1000)],
    });
    expect(disabled.taxUsdCents).toBe(0);
  });

  it("reaches zero for free products and full coupons", () => {
    expect(priceOrder({ ...base, lines: [line("free", 0)] }).totalUsdCents).toBe(0);
    const full = priceOrder({
      ...base,
      chargeCurrency: "SAR",
      lines: [line("a", 1999, 7400)],
      coupon: { type: "percent", value: 100 },
    });
    expect(full).toMatchObject({ totalUsdCents: 0, chargedAmountMinor: 0 });
  });

  it("needs at least one line", () => {
    expect(() => priceOrder({ ...base, lines: [] })).toThrow(MoneyError);
  });
});
