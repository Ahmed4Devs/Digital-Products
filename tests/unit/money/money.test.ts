import { describe, expect, it } from "vitest";
import {
  MoneyError,
  parseRate,
  sarPriceHalalas,
  toDecimalString,
  toMajorUnits,
  usdCentsToSarHalalas,
} from "@/lib/money";

describe("parseRate", () => {
  it("scales decimal strings exactly", () => {
    expect(parseRate("3.75")).toBe(3_750_000n);
    expect(parseRate("3.750000")).toBe(3_750_000n);
    expect(parseRate("1")).toBe(1_000_000n);
    expect(parseRate("0.000001")).toBe(1n);
  });

  it.each(["0", "0.0", "-3.75", "3.7500001", "3,75", "abc", "", "1e3"])("rejects %j", (rate) => {
    expect(() => parseRate(rate)).toThrow(MoneyError);
  });
});

describe("usdCentsToSarHalalas", () => {
  it("converts at the default rate", () => {
    expect(usdCentsToSarHalalas(1_000, "3.75")).toBe(3_750);
    expect(usdCentsToSarHalalas(1_999, "3.75")).toBe(7_496); // 7496.25 → 7496
    expect(usdCentsToSarHalalas(0, "3.75")).toBe(0);
  });

  it("rounds half up to the nearest halala", () => {
    expect(usdCentsToSarHalalas(2, "3.75")).toBe(8); // 7.5 → 8
    expect(usdCentsToSarHalalas(1, "3.75")).toBe(4); // 3.75 → 4
    expect(usdCentsToSarHalalas(1, "3.745")).toBe(4); // 3.745 → 4
    expect(usdCentsToSarHalalas(1, "3.4999")).toBe(3); // 3.4999 → 3
    expect(usdCentsToSarHalalas(1, "0.5")).toBe(1); // exactly half → up
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 style traps: 1001 × 3.7543 = 3758.0543 halalas.
    expect(usdCentsToSarHalalas(1_001, "3.7543")).toBe(3_758);
    expect(usdCentsToSarHalalas(9_999_999, "3.750001")).toBe(37_500_006);
  });

  it("rejects fractional, negative and unsafe amounts", () => {
    expect(() => usdCentsToSarHalalas(1.5, "3.75")).toThrow(MoneyError);
    expect(() => usdCentsToSarHalalas(-1, "3.75")).toThrow(MoneyError);
    expect(() => usdCentsToSarHalalas(Number.MAX_SAFE_INTEGER + 1, "3.75")).toThrow(MoneyError);
  });
});

describe("sarPriceHalalas", () => {
  it("uses the fixed SAR price when the owner set one", () => {
    expect(sarPriceHalalas({ priceUsdCents: 1_000, fixedPriceSarHalalas: 3_500 }, "3.75")).toBe(
      3_500,
    );
  });

  it("converts the USD price otherwise", () => {
    expect(sarPriceHalalas({ priceUsdCents: 1_000, fixedPriceSarHalalas: null }, "3.75")).toBe(
      3_750,
    );
  });
});

describe("toMajorUnits", () => {
  it("converts for display only", () => {
    expect(toMajorUnits(1_999, "USD")).toBe(19.99);
    expect(toMajorUnits(7_496, "SAR")).toBe(74.96);
    expect(toMajorUnits(0, "USD")).toBe(0);
  });
});

describe("toDecimalString", () => {
  it("prints exact two-decimal amounts", () => {
    expect(toDecimalString(1_999, "USD")).toBe("19.99");
    expect(toDecimalString(1_200, "USD")).toBe("12.00");
    expect(toDecimalString(5, "SAR")).toBe("0.05");
    expect(toDecimalString(0, "USD")).toBe("0.00");
  });
});
