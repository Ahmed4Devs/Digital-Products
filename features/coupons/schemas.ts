import { z } from "zod";
import { normalizeCouponCode } from "@/features/checkout/coupons";
import { normalizeDecimalInput, parseMajorUnits } from "@/lib/money";

// The owner's coupon form (spec §11, §17.5 §9). Messages are keys under `admin.errors`.
// Percent coupons take whole percents (1–100); fixed coupons take a USD amount, converted
// at the store's rate when the charge is in SAR.

/** Highest fixed discount and minimum subtotal: 99,999.99. */
const MAX_AMOUNT_MINOR = 9_999_999;
const MAX_USAGE_LIMIT = 1_000_000;

const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on");

/** "2026-10-21T18:30" from a datetime-local input, in the store's time zone (UTC+3). */
const storeDateTime = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "invalidDate" });
      return z.NEVER;
    }
    const date = new Date(`${value}:00+03:00`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "invalidDate" });
      return z.NEVER;
    }
    return date;
  })
  .default(null);

const optionalAmount = z
  .string()
  .transform((value, ctx) => {
    if (value.trim() === "") return null;
    const minor = parseMajorUnits(value, "USD");
    if (minor === null || minor > MAX_AMOUNT_MINOR) {
      ctx.addIssue({ code: "custom", message: "invalidAmount" });
      return z.NEVER;
    }
    return minor;
  })
  .default(null);

const optionalLimit = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizeDecimalInput(value);
    if (normalized === "") return null;
    const limit = /^\d+$/.test(normalized) ? Number(normalized) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_USAGE_LIMIT) {
      ctx.addIssue({ code: "custom", message: "outOfRange" });
      return z.NEVER;
    }
    return limit;
  })
  .default(null);

const couponFields = {
  type: z.enum(["percent", "fixed"], { error: "required" }),
  value: z.string({ error: "required" }),
  minSubtotalUsd: optionalAmount,
  usageLimit: optionalLimit,
  allowMultiplePerCustomer: checkbox,
  startsAt: storeDateTime,
  endsAt: storeDateTime,
};

type CouponTermsInput = {
  type: "percent" | "fixed";
  value: string;
  startsAt: Date | null;
  endsAt: Date | null;
};

function couponTerms<T extends CouponTermsInput>(input: T, ctx: z.RefinementCtx) {
  const normalized = normalizeDecimalInput(input.value);
  let value: number | null = null;
  if (input.type === "percent") {
    const percent = /^\d{1,3}$/.test(normalized) ? Number(normalized) : NaN;
    if (percent >= 1 && percent <= 100) value = percent;
    else ctx.addIssue({ code: "custom", path: ["value"], message: "invalidCouponPercent" });
  } else {
    const minor = parseMajorUnits(normalized, "USD");
    if (minor !== null && minor > 0 && minor <= MAX_AMOUNT_MINOR) value = minor;
    else ctx.addIssue({ code: "custom", path: ["value"], message: "invalidAmount" });
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "endsBeforeStarts" });
  }
  return value === null ? z.NEVER : { ...input, value };
}

// Editing leaves `active` alone: the coupon page switches it with its own button.
export const couponUpdateSchema = z.strictObject(couponFields).transform(couponTerms);

export const couponCreateSchema = z
  .strictObject({
    code: z.string({ error: "required" }).transform((value, ctx) => {
      const code = normalizeCouponCode(value);
      if (!code || code.length < 3) {
        ctx.addIssue({ code: "custom", message: "invalidCouponCode" });
        return z.NEVER;
      }
      return code;
    }),
    ...couponFields,
    active: checkbox,
  })
  .transform(couponTerms);

export type CouponUpdateValues = z.output<typeof couponUpdateSchema>;
export type CouponCreateValues = z.output<typeof couponCreateSchema>;
