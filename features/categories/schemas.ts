import { z } from "zod";
import { graphemeLength, SLUG_MAX_LENGTH, slugify } from "@/lib/text";

// The owner's category form. Messages are keys under `admin.errors`.

export const CATEGORY_NAME_MAX = 60;

const name = z
  .string()
  .trim()
  .refine((value) => graphemeLength(value) <= CATEGORY_NAME_MAX, { error: "tooLong" });

export const categoryFormSchema = z
  .strictObject({
    slug: z.string().trim().max(200, { error: "tooLong" }).default(""),
    nameAr: name.refine((value) => value.length > 0, { error: "required" }),
    nameEn: name.default(""),
  })
  .transform((input, ctx) => {
    const slug = slugify(input.slug || input.nameEn || input.nameAr);
    if (!slug) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: "invalidSlug" });
      return z.NEVER;
    }
    return { ...input, slug: Array.from(slug).slice(0, SLUG_MAX_LENGTH).join("") };
  });

export type CategoryFormValues = z.output<typeof categoryFormSchema>;

export const categoryMoveSchema = z.strictObject({
  id: z.uuid(),
  direction: z.enum(["up", "down"]),
});
