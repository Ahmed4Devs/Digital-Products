import type { Formats } from "next-intl";

/**
 * Shared next-intl formats. Every format pins Latin digits and the Gregorian calendar:
 * some engines default `ar` / `ar-SA` to Arabic-Indic digits and the Umm al-Qura
 * calendar, and the server and the browser must produce identical output.
 *
 * Always format through one of these names (`format.number(x, "integer")`,
 * `{count, number, integer}` in messages). tests/unit/i18n enforces this for messages.
 */
const latinDigits = { numberingSystem: "latn" } as const;
const gregorianLatin = { numberingSystem: "latn", calendar: "gregory" } as const;

export const formats = {
  number: {
    integer: { ...latinDigits, maximumFractionDigits: 0 },
    decimal: { ...latinDigits, minimumFractionDigits: 0, maximumFractionDigits: 2 },
    percent: { ...latinDigits, style: "percent", maximumFractionDigits: 2 },
    usd: { ...latinDigits, style: "currency", currency: "USD" },
    sar: { ...latinDigits, style: "currency", currency: "SAR" },
  },
  dateTime: {
    year: { ...gregorianLatin, year: "numeric" },
    date: { ...gregorianLatin, dateStyle: "medium" },
    dateLong: { ...gregorianLatin, dateStyle: "long" },
    dateTime: { ...gregorianLatin, dateStyle: "medium", timeStyle: "short" },
    time: { ...gregorianLatin, timeStyle: "short" },
  },
  list: {
    and: { type: "conjunction", style: "long" },
  },
} satisfies Formats;

/** All dates are shown in the store's local time, identically on server and client. */
export const TIME_ZONE = "Asia/Riyadh";
