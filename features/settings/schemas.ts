import { z } from "zod";
import { normalizeRate } from "@/lib/money";

// Owner settings forms. Messages are keys under `admin.errors`.

/** Sanity bounds for USD → SAR; the peg is 3.75. */
const MIN_RATE = "0.000001";
const MAX_RATE = 100;

export const exchangeRateSchema = z.strictObject({
  usdToSarRate: z.string().transform((value, ctx) => {
    const rate = normalizeRate(value);
    if (rate === null || Number(rate) < Number(MIN_RATE) || Number(rate) > MAX_RATE) {
      ctx.addIssue({ code: "custom", message: "invalidRate" });
      return z.NEVER;
    }
    return rate;
  }),
});
