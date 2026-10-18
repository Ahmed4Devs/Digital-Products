import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitEmoji, TWEMOJI_BASE_PATH } from "@/lib/emoji";

const ASSET_DIR = join(process.cwd(), "public", "twemoji");
const assetFiles = readdirSync(ASSET_DIR).filter((file) => file.endsWith(".svg"));
const assetSet = new Set(assetFiles);

function emojiSources(text: string): string[] {
  return splitEmoji(text).flatMap((s) => (s.type === "emoji" ? [s.src] : []));
}

function joined(text: string): string {
  return splitEmoji(text)
    .map((segment) => segment.text)
    .join("");
}

describe("splitEmoji", () => {
  it("returns plain text untouched", () => {
    expect(splitEmoji("متجر رقمي")).toEqual([{ type: "text", text: "متجر رقمي" }]);
    expect(splitEmoji("")).toEqual([]);
  });

  it.each([
    ["Arabic, start", "✨ منتجات رقمية", ["emoji", "text"]],
    ["Arabic, middle", "منتجات ✨ رقمية", ["text", "emoji", "text"]],
    ["Arabic, end", "منتجات رقمية ✨", ["text", "emoji"]],
    ["English, start", "✨ Digital products", ["emoji", "text"]],
    ["English, middle", "Digital ✨ products", ["text", "emoji", "text"]],
    ["English, end", "Digital products ✨", ["text", "emoji"]],
  ])("handles emoji at the %s of a sentence", (_, text, shape) => {
    const segments = splitEmoji(text);
    expect(segments.map((s) => s.type)).toEqual(shape);
    expect(emojiSources(text)).toEqual([`${TWEMOJI_BASE_PATH}/2728.svg`]);
    // Nothing is lost or duplicated: the segments rebuild the original string.
    expect(joined(text)).toBe(text);
  });

  it.each([
    ["ZWJ family", "👨‍👩‍👧‍👦", "1f468-200d-1f469-200d-1f467-200d-1f466"],
    ["flag", "🇸🇦", "1f1f8-1f1e6"],
    ["keycap", "1️⃣", "31-20e3"],
    ["skin tone", "👍🏽", "1f44d-1f3fd"],
    ["VS16 heart", "❤️", "2764"],
    ["ZWJ with VS16", "❤️‍🔥", "2764-fe0f-200d-1f525"],
  ])("maps a %s to a single self-hosted SVG", (_, emoji, codepoints) => {
    const text = `قبل ${emoji} after`;
    expect(emojiSources(text)).toEqual([`${TWEMOJI_BASE_PATH}/${codepoints}.svg`]);
    expect(assetSet.has(`${codepoints}.svg`)).toBe(true);
    expect(joined(text)).toBe(text);
  });

  it("keeps the original emoji text for alt text and copy/paste", () => {
    const [segment] = splitEmoji("🇸🇦");
    expect(segment).toEqual({
      type: "emoji",
      text: "🇸🇦",
      src: `${TWEMOJI_BASE_PATH}/1f1f8-1f1e6.svg`,
    });
  });

  it("handles adjacent emoji as separate images", () => {
    expect(emojiSources("🎁🎉")).toEqual([
      `${TWEMOJI_BASE_PATH}/1f381.svg`,
      `${TWEMOJI_BASE_PATH}/1f389.svg`,
    ]);
  });

  it("leaves digits, #, * and Arabic-Indic digits alone", () => {
    for (const text of ["123", "# * 0", "١٢٣", "Order 42"]) {
      expect(emojiSources(text), text).toEqual([]);
    }
  });
});

describe("vendored Twemoji assets", () => {
  it("contain the full v17 set", () => {
    expect(readFileSync(join(ASSET_DIR, "VERSION"), "utf8").trim()).toBe("17.0.3");
    expect(assetFiles.length).toBeGreaterThan(3900);
    expect(readFileSync(join(ASSET_DIR, "LICENSE-GRAPHICS.txt"), "utf8")).toContain(
      "Attribution 4.0 International",
    );
  });

  it("exist for every image the parser can produce", () => {
    // Rebuild each emoji from its file name (with and without VS16) and parse it back.
    const missing = new Set<string>();
    for (const file of assetFiles) {
      const codepoints = file.replace(/\.svg$/, "").split("-");
      const emoji = String.fromCodePoint(...codepoints.map((cp) => Number.parseInt(cp, 16)));
      const [first, ...others] = [...emoji];
      const withVs16 = `${first ?? ""}️${others.join("")}`;
      for (const src of [...emojiSources(emoji), ...emojiSources(withVs16)]) {
        const name = src.slice(TWEMOJI_BASE_PATH.length + 1);
        if (!assetSet.has(name)) missing.add(name);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("contain no active content", () => {
    const unsafe =
      /<script|<foreignObject|\son\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*["']https?:/i;
    const offenders = assetFiles.filter((file) =>
      unsafe.test(readFileSync(join(ASSET_DIR, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
