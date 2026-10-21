import type { Locale } from "next-intl";
import { z } from "zod";

// Text helpers shared by the catalog and, from Phase 5, the owner's forms.

/** Maximum slug length, in characters. */
export const SLUG_MAX_LENGTH = 80;

const KEYCAP_SEQUENCE = /[0-9#*]️?⃣/gu;
// Pictographs plus the invisible pieces emoji are assembled from: ZWJ, variation
// selectors, skin tones, regional-indicator flags and tag sequences.
const EMOJI_PARTS =
  /[\p{Extended_Pictographic}‍︎️\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}]/gu;
const ARABIC_TATWEEL = /ـ/g;
const COMBINING_MARKS = /\p{Mn}/gu;
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/g;
const SEPARATORS = /[^\p{L}\p{N}]+/gu;
const VALID_SLUG = /^[\p{Ll}\p{Lo}0-9]+(?:-[\p{Ll}\p{Lo}0-9]+)*$/u;

function latinDigit(digit: string): string {
  const code = digit.charCodeAt(0);
  return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
}

/**
 * URL slug for Arabic or English text: emoji removed (spec §7.6), Arabic diacritics and
 * tatweel removed, Latin accents folded, Arabic-Indic digits turned into Latin digits,
 * lower case, words joined by hyphens. Arabic letters are kept, so Arabic-only titles
 * still get a readable slug. Returns "" when nothing usable remains.
 */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKC")
    .replace(KEYCAP_SEQUENCE, " ")
    .replace(EMOJI_PARTS, " ")
    .replace(ARABIC_TATWEEL, "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .normalize("NFC")
    .replace(ARABIC_INDIC_DIGIT, latinDigit)
    .toLowerCase()
    .replace(SEPARATORS, "-")
    .replace(/^-+|-+$/g, "");

  const truncated = Array.from(slug).slice(0, SLUG_MAX_LENGTH).join("");
  return truncated.replace(/-+$/, "");
}

/** True for a slug that slugify() could have produced. */
export function isValidSlug(value: string): boolean {
  return (
    VALID_SLUG.test(value) &&
    Array.from(value).length <= SLUG_MAX_LENGTH &&
    slugify(value) === value
  );
}

const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

/**
 * Length in user-perceived characters: a family emoji, a flag or a letter with
 * combining marks counts as one (spec §7.6), unlike `String.prototype.length`.
 */
export function graphemeLength(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}

/** A trimmed string whose length is limited in graphemes rather than UTF-16 units. */
export function graphemeString({ min = 0, max }: { min?: number; max: number }) {
  return z
    .string()
    .trim()
    .refine((value) => graphemeLength(value) >= min, {
      error: `must be at least ${min} characters`,
    })
    .refine((value) => graphemeLength(value) <= max, {
      error: `must be at most ${max} characters`,
    });
}

/**
 * Picks the value for `locale` from a pair of bilingual columns, falling back to the
 * other language when it is empty (spec §7.1).
 */
export function localized(
  locale: Locale,
  values: { ar: string | null | undefined; en: string | null | undefined },
): string {
  const preferred = locale === "ar" ? values.ar : values.en;
  const fallback = locale === "ar" ? values.en : values.ar;
  return preferred?.trim() ? preferred : (fallback ?? "");
}
