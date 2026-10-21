import { describe, expect, it } from "vitest";
import { graphemeLength, graphemeString, isValidSlug, localized, slugify } from "@/lib/text";

describe("slugify", () => {
  it("builds lower-case hyphenated slugs from English", () => {
    expect(slugify("  The Ultimate Notion Template  ")).toBe("the-ultimate-notion-template");
    expect(slugify("Café & Crème — 2026!")).toBe("cafe-creme-2026");
  });

  it("keeps Arabic letters and removes diacritics and tatweel", () => {
    expect(slugify("قالب  مُخطّط الميزانية")).toBe("قالب-مخطط-الميزانية");
    expect(slugify("كتـــاب")).toBe("كتاب");
  });

  it("turns Arabic-Indic digits into Latin digits", () => {
    expect(slugify("دليل ٢٠٢٦")).toBe("دليل-2026");
    expect(slugify("نسخة ۳")).toBe("نسخة-3");
  });

  it("strips emoji at the start, middle and end", () => {
    expect(slugify("✨ Starter Kit")).toBe("starter-kit");
    expect(slugify("Starter 🚀 Kit")).toBe("starter-kit");
    expect(slugify("Starter Kit 👨‍👩‍👧‍👦")).toBe("starter-kit");
    expect(slugify("حزمة 🇸🇦 جاهزة 👍🏽")).toBe("حزمة-جاهزة");
    expect(slugify("Top 1️⃣ pick #️⃣")).toBe("top-pick");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugify("🎉🎉🎉")).toBe("");
    expect(slugify("!!!")).toBe("");
  });

  it("limits the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"word ".repeat(30)}`);
    expect(Array.from(slug).length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts what slugify produces", () => {
    for (const text of ["Starter Kit", "قالب مخطط", "guide 2026"]) {
      expect(isValidSlug(slugify(text))).toBe(true);
    }
  });

  it.each(["Upper", "two--hyphens", "-leading", "trailing-", "has space", "emoji-✨", "a/b", ""])(
    "rejects %j",
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );
});

describe("graphemeLength", () => {
  it("counts composite emoji and flags as one character", () => {
    expect(graphemeLength("👨‍👩‍👧‍👦")).toBe(1);
    expect(graphemeLength("🇸🇦")).toBe(1);
    expect(graphemeLength("👍🏽")).toBe(1);
    expect("👨‍👩‍👧‍👦".length).toBe(11);
  });

  it("counts Arabic letters with marks as one each", () => {
    expect(graphemeLength("مُخطّط")).toBe(4);
    expect(graphemeLength("abc ✨")).toBe(5);
  });
});

describe("graphemeString", () => {
  const title = graphemeString({ min: 1, max: 3 });

  it("validates in graphemes after trimming", () => {
    expect(title.safeParse("  👨‍👩‍👧‍👦🇸🇦✨ ").success).toBe(true);
    expect(title.safeParse("abcd").success).toBe(false);
    expect(title.safeParse("   ").success).toBe(false);
  });
});

describe("localized", () => {
  it("prefers the requested language", () => {
    expect(localized("ar", { ar: "قالب", en: "Template" })).toBe("قالب");
    expect(localized("en", { ar: "قالب", en: "Template" })).toBe("Template");
  });

  it("falls back to the other language when empty", () => {
    expect(localized("en", { ar: "قالب", en: "  " })).toBe("قالب");
    expect(localized("ar", { ar: null, en: "Template" })).toBe("Template");
    expect(localized("ar", { ar: "", en: undefined })).toBe("");
  });
});
