"use client";

import { useFormatter } from "next-intl";

/**
 * "1.4 MB" style sizes in the visitor's language, decimal units like file managers, in
 * Latin digits like every other number in the store (i18n/formats.ts).
 */
export function useFileSize() {
  const format = useFormatter();
  return (bytes: number) => {
    const units = [
      ["gigabyte", 1e9],
      ["megabyte", 1e6],
      ["kilobyte", 1e3],
    ] as const;
    for (const [unit, size] of units) {
      if (bytes >= size) {
        return format.number(bytes / size, {
          numberingSystem: "latn",
          style: "unit",
          unit,
          maximumFractionDigits: 1,
        });
      }
    }
    return format.number(bytes, { numberingSystem: "latn", style: "unit", unit: "byte" });
  };
}
