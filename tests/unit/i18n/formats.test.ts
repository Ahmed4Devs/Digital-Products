import { createFormatter, createTranslator, type Locale } from "next-intl";
import { describe, expect, it } from "vitest";
import { formats, TIME_ZONE } from "@/i18n/formats";
import { getDirection } from "@/i18n/locale";
import { messagesByLocale } from "@/messages";

// Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits.
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;

// `ar-SA` and `ar-EG` default to Arabic-Indic digits (and `ar-SA` to the Umm al-Qura
// calendar) in ICU; they stand in for browsers whose `ar` defaults differ from Node's.
const LOCALES = ["ar", "en", "ar-SA", "ar-EG"] as const;

// 2026-10-18 21:30 UTC is already 19 October 00:30 in Riyadh (UTC+3).
const INSTANT = new Date(Date.UTC(2026, 9, 18, 21, 30));

function formatterFor(locale: string) {
  // Deliberately wider than the app's Locale type to simulate other engines' defaults.
  return createFormatter({ locale: locale as Locale, formats, timeZone: TIME_ZONE });
}

describe("shared number formats", () => {
  for (const locale of LOCALES) {
    it(`always uses Latin digits (${locale})`, () => {
      const format = formatterFor(locale);
      for (const name of Object.keys(formats.number) as (keyof typeof formats.number)[]) {
        const output = format.number(1234567.891, name);
        expect(output, `${name} in ${locale}`).not.toMatch(NON_LATIN_DIGITS);
        expect(output).toMatch(/\d/);
      }
    });
  }

  it("formats USD and SAR prices in English", () => {
    const format = formatterFor("en");
    expect(format.number(1234.5, "usd")).toBe("$1,234.50");
    // Intl separates the currency code with a no-break space (U+00A0).
    expect(format.number(1234.5, "sar")).toBe("SAR 1,234.50");
  });

  it("formats USD and SAR prices in Arabic with Latin digits", () => {
    const format = formatterFor("ar");
    const usd = format.number(1234.5, "usd");
    const sar = format.number(1234.5, "sar");
    expect(usd).toContain("1,234.50");
    expect(usd).toContain("US$");
    expect(sar).toContain("1,234.50");
    expect(sar).toContain("ر.س");
  });

  it("rounds integers and keeps at most two decimals", () => {
    const format = formatterFor("en");
    expect(format.number(1234.5, "integer")).toBe("1,235");
    expect(format.number(0.125, "percent")).toBe("12.5%");
    expect(format.number(3.14159, "decimal")).toBe("3.14");
  });
});

describe("shared date formats", () => {
  for (const locale of LOCALES) {
    it(`always uses Latin digits and the Gregorian calendar (${locale})`, () => {
      const format = formatterFor(locale);
      for (const name of Object.keys(formats.dateTime) as (keyof typeof formats.dateTime)[]) {
        const output = format.dateTime(INSTANT, name);
        expect(output, `${name} in ${locale}`).not.toMatch(NON_LATIN_DIGITS);
      }
      // Gregorian year, not the Hijri year 1448.
      expect(format.dateTime(INSTANT, "year")).toBe("2026");
    });
  }

  it("shows dates in the store time zone (Asia/Riyadh)", () => {
    expect(formatterFor("en").dateTime(INSTANT, "dateLong")).toBe("October 19, 2026");
    expect(formatterFor("ar").dateTime(INSTANT, "dateLong")).toBe("19 أكتوبر 2026");
    expect(formatterFor("ar-SA").dateTime(INSTANT, "dateLong")).toBe("19 أكتوبر 2026");
  });
});

describe("message formatting", () => {
  it("renders ICU date arguments through the shared formats", () => {
    for (const locale of ["ar", "en"] as const) {
      const t = createTranslator({
        locale,
        messages: messagesByLocale[locale],
        namespace: "common",
        formats,
        timeZone: TIME_ZONE,
      });
      const text = t("footer.copyright", { date: INSTANT, storeName: "X" });
      expect(text).toContain("2026");
      expect(text).not.toMatch(NON_LATIN_DIGITS);
    }
  });
});

describe("getDirection", () => {
  it("maps Arabic to rtl and English to ltr", () => {
    expect(getDirection("ar")).toBe("rtl");
    expect(getDirection("en")).toBe("ltr");
  });
});
