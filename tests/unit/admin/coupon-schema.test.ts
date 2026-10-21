import { describe, expect, it } from "vitest";
import { couponFormDefaults, couponState } from "@/features/coupons/admin-data";
import { couponCreateSchema, couponUpdateSchema } from "@/features/coupons/schemas";

function issues(input: Record<string, string>) {
  const result = couponCreateSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
}

describe("coupon form", () => {
  it("normalizes codes, percentages, amounts and Riyadh times", () => {
    expect(
      couponCreateSchema.parse({
        code: " summer-25 ",
        type: "percent",
        value: "٢٥",
        minSubtotalUsd: "10",
        usageLimit: "100",
        startsAt: "2026-11-01T00:00",
        endsAt: "2026-11-30T23:59",
        active: "on",
      }),
    ).toEqual({
      code: "SUMMER-25",
      type: "percent",
      value: 25,
      minSubtotalUsd: 1000,
      usageLimit: 100,
      allowMultiplePerCustomer: false,
      startsAt: new Date("2026-10-31T21:00:00Z"),
      endsAt: new Date("2026-11-30T20:59:00Z"),
      active: true,
    });
    expect(couponUpdateSchema.parse({ type: "fixed", value: "4.99" })).toMatchObject({
      value: 499,
      minSubtotalUsd: null,
      usageLimit: null,
      startsAt: null,
      endsAt: null,
    });
    // Editing never touches the active flag.
    expect(couponUpdateSchema.safeParse({ type: "fixed", value: "1", active: "on" }).success).toBe(
      false,
    );
  });

  it("explains every invalid field", () => {
    expect(issues({ code: "x", type: "percent", value: "10" })).toEqual({
      code: "invalidCouponCode",
    });
    expect(issues({ code: "OK1", type: "percent", value: "101" })).toEqual({
      value: "invalidCouponPercent",
    });
    expect(issues({ code: "OK1", type: "percent", value: "12.5" })).toEqual({
      value: "invalidCouponPercent",
    });
    expect(issues({ code: "OK1", type: "fixed", value: "0" })).toEqual({ value: "invalidAmount" });
    expect(issues({ code: "OK1", type: "fixed", value: "5", usageLimit: "0" })).toEqual({
      usageLimit: "outOfRange",
    });
    expect(issues({ code: "OK1", type: "fixed", value: "5", startsAt: "tomorrow" })).toEqual({
      startsAt: "invalidDate",
    });
    expect(
      issues({
        code: "OK1",
        type: "fixed",
        value: "5",
        startsAt: "2026-11-02T00:00",
        endsAt: "2026-11-01T00:00",
      }),
    ).toEqual({ endsAt: "endsBeforeStarts" });
  });

  it("round-trips stored values back into the form", () => {
    expect(
      couponFormDefaults({
        type: "fixed",
        value: 499,
        minSubtotalUsdCents: 1000,
        usageLimit: null,
        allowMultiplePerCustomer: true,
        startsAt: new Date("2026-10-31T21:00:00Z"),
        endsAt: null,
        active: true,
      }),
    ).toEqual({
      type: "fixed",
      value: "4.99",
      minSubtotalUsd: "10.00",
      usageLimit: "",
      allowMultiplePerCustomer: true,
      startsAt: "2026-11-01T00:00",
      endsAt: "",
      active: true,
    });
  });

  it("reports what a customer would see right now", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const base = {
      active: true,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usedCount: 0,
      reservedCount: 0,
    };
    expect(couponState(base, now)).toBe("active");
    expect(couponState({ ...base, active: false }, now)).toBe("inactive");
    expect(couponState({ ...base, startsAt: new Date("2026-10-22T00:00:00Z") }, now)).toBe(
      "scheduled",
    );
    expect(couponState({ ...base, endsAt: now }, now)).toBe("ended");
    expect(couponState({ ...base, usageLimit: 2, usedCount: 1, reservedCount: 1 }, now)).toBe(
      "exhausted",
    );
  });
});
