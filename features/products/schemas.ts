import { z } from "zod";
import { parseMajorUnits, type Currency } from "@/lib/money";
import { graphemeLength, SLUG_MAX_LENGTH, slugify } from "@/lib/text";

// The owner's product form (spec §11). Shared by the browser (instant feedback) and the
// Server Action (the authority). Messages are keys under `admin.errors`.

export const PRODUCT_LIMITS = {
  title: 120,
  shortDescription: 300,
  /** Characters of HTML, after sanitizing. */
  description: 50_000,
  seoTitle: 70,
  seoDescription: 160,
} as const;

/** Highest accepted price in minor units: 99,999.99. */
export const MAX_PRICE_MINOR = 9_999_999;

function text(max: number) {
  return z
    .string()
    .trim()
    .refine((value) => graphemeLength(value) <= max, { error: "tooLong" });
}

function parseAmount(value: string, currency: Currency, ctx: z.RefinementCtx): number {
  const minor = parseMajorUnits(value, currency);
  if (minor === null) {
    ctx.addIssue({ code: "custom", message: "invalidAmount" });
    return 0;
  }
  if (minor > MAX_PRICE_MINOR) {
    ctx.addIssue({ code: "custom", message: "amountTooHigh" });
  }
  return minor;
}

function amount(currency: Currency) {
  return z
    .string({ error: "required" })
    .transform((value, ctx) => parseAmount(value, currency, ctx));
}

/** An optional amount: an empty field means "not set". */
function optionalAmount(currency: Currency) {
  return z
    .string({ error: "invalidAmount" })
    .transform((value, ctx) => (value.trim() === "" ? null : parseAmount(value, currency, ctx)));
}

/** Whether these fields already parsed successfully, so a cross-field rule can use them. */
function parsed(payload: { value: unknown }, check: (value: Record<string, unknown>) => boolean) {
  return (
    typeof payload.value === "object" &&
    payload.value !== null &&
    check(payload.value as Record<string, unknown>)
  );
}

const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on");

export const productFormSchema = z
  .strictObject({
    slug: z.string().trim().max(200, { error: "tooLong" }).default(""),
    titleAr: text(PRODUCT_LIMITS.title).default(""),
    titleEn: text(PRODUCT_LIMITS.title).default(""),
    shortDescriptionAr: text(PRODUCT_LIMITS.shortDescription).default(""),
    shortDescriptionEn: text(PRODUCT_LIMITS.shortDescription).default(""),
    // Raw editor HTML; sanitized and measured again on the server.
    descriptionAr: z
      .string()
      .max(PRODUCT_LIMITS.description * 2, { error: "tooLong" })
      .default(""),
    descriptionEn: z
      .string()
      .max(PRODUCT_LIMITS.description * 2, { error: "tooLong" })
      .default(""),
    seoTitleAr: text(PRODUCT_LIMITS.seoTitle).default(""),
    seoTitleEn: text(PRODUCT_LIMITS.seoTitle).default(""),
    seoDescriptionAr: text(PRODUCT_LIMITS.seoDescription).default(""),
    seoDescriptionEn: text(PRODUCT_LIMITS.seoDescription).default(""),
    priceUsd: amount("USD"),
    fixedPriceSar: optionalAmount("SAR").default(null),
    compareAtPriceUsd: optionalAmount("USD").default(null),
    categoryId: z
      .union([z.literal("").transform(() => null), z.uuid({ error: "invalid" })])
      .default(null),
    featured: checkbox,
  })
  // Each cross-field rule runs as soon as its own fields are valid, even when other
  // fields failed, so the owner sees every problem at once (Zod skips refinements on an
  // object with issues unless `when` says otherwise; `payload.value` then holds the
  // already transformed values).
  .refine((input) => Boolean(input.titleAr || input.titleEn), {
    path: ["titleAr"],
    message: "titleRequired",
    when: (payload) =>
      parsed(
        payload,
        (value) => typeof value.titleAr === "string" && typeof value.titleEn === "string",
      ),
  })
  .refine((input) => input.compareAtPriceUsd === null || input.compareAtPriceUsd > input.priceUsd, {
    path: ["compareAtPriceUsd"],
    message: "compareAtTooLow",
    when: (payload) =>
      payload.issues.every(
        (issue) => !["priceUsd", "compareAtPriceUsd"].includes(String(issue.path?.[0])),
      ) && parsed(payload, (value) => typeof value.priceUsd === "number"),
  })
  .refine(
    (input) => input.fixedPriceSar === null || (input.fixedPriceSar > 0 && input.priceUsd > 0),
    {
      // A free product is free in both currencies (zero-total orders, §17.5 §6).
      path: ["fixedPriceSar"],
      message: "fixedPriceInvalid",
      when: (payload) =>
        payload.issues.every(
          (issue) => !["priceUsd", "fixedPriceSar"].includes(String(issue.path?.[0])),
        ) && parsed(payload, (value) => typeof value.priceUsd === "number"),
    },
  )
  .transform((input, ctx) => {
    // The slug defaults to the English title, falling back to Arabic (Arabic slugs work).
    const slug = slugify(input.slug || input.titleEn || input.titleAr);
    if (!slug) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: "invalidSlug" });
      return z.NEVER;
    }
    return { ...input, slug: Array.from(slug).slice(0, SLUG_MAX_LENGTH).join("") };
  });

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;

export const PRODUCT_STATUS_TARGETS = ["published", "archived", "draft"] as const;
export type ProductStatusTarget = (typeof PRODUCT_STATUS_TARGETS)[number];

export const imageAltSchema = z.strictObject({
  altAr: text(200).default(""),
  altEn: text(200).default(""),
});
