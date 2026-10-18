import type { Locale } from "next-intl";

export type Direction = "rtl" | "ltr";

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar"]);

/** Text direction for a locale; drives `<html dir>` and Base UI's DirectionProvider. */
export function getDirection(locale: Locale): Direction {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
