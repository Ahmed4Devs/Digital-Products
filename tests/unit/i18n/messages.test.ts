import { describe, expect, it } from "vitest";
import { formats } from "@/i18n/formats";
import { routing } from "@/i18n/routing";
import { messagesByLocale } from "@/messages";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") entries.set(path, value);
    else for (const [k, v] of flatten(value, path)) entries.set(k, v);
  }
  return entries;
}

const flat = Object.fromEntries(
  routing.locales.map((locale) => [locale, flatten(messagesByLocale[locale] as Tree)]),
) as Record<(typeof routing.locales)[number], Map<string, string>>;

/** `{name}` / `{name, type, style}` arguments and `<tag>` rich-text tags in a message. */
function placeholders(message: string): string[] {
  const args = [...message.matchAll(/\{\s*(\w+)\s*(?:,[^{}]*)?\}/g)].map((m) => `{${m[1]}}`);
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...args, ...tags].sort();
}

describe("message catalogues", () => {
  it("define exactly the same keys in every locale", () => {
    const [first, ...rest] = routing.locales;
    const reference = [...flat[first].keys()].sort();
    for (const locale of rest) {
      expect([...flat[locale].keys()].sort(), locale).toEqual(reference);
    }
  });

  it("have no empty messages", () => {
    for (const locale of routing.locales) {
      for (const [key, value] of flat[locale]) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("use the same arguments and rich-text tags in every locale", () => {
    for (const [key, arMessage] of flat.ar) {
      expect(placeholders(flat.en.get(key) ?? ""), key).toEqual(placeholders(arMessage));
    }
  });

  it("have balanced ICU braces", () => {
    for (const locale of routing.locales) {
      for (const [key, value] of flat[locale]) {
        let depth = 0;
        for (const char of value) {
          if (char === "{") depth++;
          if (char === "}") depth--;
          expect(depth, `${locale}:${key}`).toBeGreaterThanOrEqual(0);
        }
        expect(depth, `${locale}:${key}`).toBe(0);
      }
    }
  });
});

describe("Latin-digit guarantees in messages", () => {
  const numberFormats = new Set(Object.keys(formats.number));
  const dateFormats = new Set(Object.keys(formats.dateTime));

  it("format numbers and dates only through named shared formats", () => {
    for (const locale of routing.locales) {
      for (const [key, value] of flat[locale]) {
        const where = `${locale}:${key}`;
        // `{n, number}` / `{d, date}` without a style use the engine's locale defaults.
        expect(value, where).not.toMatch(/\{\s*\w+\s*,\s*(number|date|time)\s*\}/);

        for (const [, type, style] of value.matchAll(
          /\{\s*\w+\s*,\s*(number|date|time)\s*,\s*([\w-]+)\s*\}/g,
        )) {
          const known = type === "number" ? numberFormats : dateFormats;
          expect(known.has(style ?? ""), `${where} uses unknown format "${style}"`).toBe(true);
        }
      }
    }
  });

  it("never use `#` (plural numbers ignore the shared formats)", () => {
    for (const locale of routing.locales) {
      for (const [key, value] of flat[locale]) {
        expect(value, `${locale}:${key}`).not.toContain("#");
      }
    }
  });
});
