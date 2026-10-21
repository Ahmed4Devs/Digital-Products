import { z } from "zod";
import { normalizeDecimalInput, normalizeRate } from "@/lib/money";
import { graphemeLength } from "@/lib/text";

// Owner settings forms. Messages are keys under `admin.errors`.

/** Sanity bounds for USD → SAR; the peg is 3.75. */
const MIN_RATE = "0.000001";
const MAX_RATE = 100;

export const exchangeRateSchema = z.strictObject({
  usdToSarRate: z.string().transform((value, ctx) => {
    const rate = normalizeRate(value);
    if (rate === null || Number(rate) < Number(MIN_RATE) || Number(rate) > MAX_RATE) {
      ctx.addIssue({ code: "custom", message: "invalidRate" });
      return z.NEVER;
    }
    return rate;
  }),
});

const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on");

export const gatewaySettingsSchema = z.strictObject({
  moyasarEnabled: checkbox,
  paddleEnabled: checkbox,
  paypalEnabled: checkbox,
});

export type GatewaySettings = z.output<typeof gatewaySettingsSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => graphemeLength(value) <= max, { error: "tooLong" })
    .default("");

/** Percent with up to two decimals ("15", "7.5") → basis points (1500, 750). */
const percent = z.string().transform((value, ctx) => {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalizeDecimalInput(value));
  const basisPoints = match
    ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"))
    : NaN;
  if (!Number.isInteger(basisPoints) || basisPoints > 10_000) {
    ctx.addIssue({ code: "custom", message: "invalidPercent" });
    return z.NEVER;
  }
  return basisPoints;
});

const integer = (min: number, max: number) =>
  z.string().transform((value, ctx) => {
    const normalized = normalizeDecimalInput(value);
    const number = /^\d+$/.test(normalized) ? Number(normalized) : NaN;
    if (!Number.isInteger(number) || number < min || number > max) {
      ctx.addIssue({ code: "custom", message: "outOfRange" });
      return z.NEVER;
    }
    return number;
  });

export const storeSettingsSchema = z
  .strictObject({
    storeNameAr: optionalText(60),
    storeNameEn: optionalText(60),
    supportEmail: z
      .union([z.literal("").transform(() => null), z.email({ error: "invalidEmail" })])
      .default(null),
    taxEnabled: checkbox,
    taxRate: percent,
    vatNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{0,30}$/, { error: "invalid" })
      .transform((value) => value || null)
      .default(null),
    downloadsPerMinute: integer(1, 1000),
    pendingOrderTtlMinutes: integer(5, 10_080),
  })
  .refine((input) => !input.taxEnabled || input.taxRate > 0, {
    path: ["taxRate"],
    message: "taxRateRequired",
  });

export type StoreSettingsValues = z.output<typeof storeSettingsSchema>;

export const LEGAL_PAGES = ["terms", "privacy", "refundPolicy", "about", "contact"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];
export const LEGAL_CONTENT_MAX = 100_000;

const legalField = z
  .string()
  .max(LEGAL_CONTENT_MAX * 2, { error: "tooLong" })
  .default("");

/** One legal page in both languages; each page is saved on its own. */
export const legalPageSchema = z.strictObject({
  page: z.enum(LEGAL_PAGES),
  contentAr: legalField,
  contentEn: legalField,
});

export type LegalPageValues = z.output<typeof legalPageSchema>;
