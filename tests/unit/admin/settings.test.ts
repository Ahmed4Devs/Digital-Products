import { describe, expect, it } from "vitest";
import { basisPointsToPercent } from "@/features/settings/data";
import { legalPageSchema, storeSettingsSchema } from "@/features/settings/schemas";

describe("store settings form", () => {
  it("round-trips tax rates between percent and basis points", () => {
    for (const [text, basisPoints] of [
      ["15", 1500],
      ["7.5", 750],
      ["0.25", 25],
      ["100", 10_000],
      ["0", 0],
    ] as const) {
      const parsed = storeSettingsSchema.parse({
        taxRate: text,
        downloadsPerMinute: "5",
        pendingOrderTtlMinutes: "60",
      });
      expect(parsed.taxRate).toBe(basisPoints);
      expect(basisPointsToPercent(basisPoints)).toBe(text);
    }
  });

  it("accepts each legal page on its own", () => {
    expect(legalPageSchema.parse({ page: "refundPolicy", contentAr: "<p>نص</p>" })).toEqual({
      page: "refundPolicy",
      contentAr: "<p>نص</p>",
      contentEn: "",
    });
    expect(legalPageSchema.safeParse({ page: "termsAr" }).success).toBe(false);
  });
});
