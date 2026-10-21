// All money math lives here (spec §5.2): amounts are integer minor units (cents for USD,
// halalas for SAR) next to an ISO currency code, never floating-point numbers.
//
// Phase 6 adds coupons and the optional store tax on top of these primitives.

export const CURRENCIES = ["USD", "SAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Minor units per major unit; both currencies use two decimals. */
const MINOR_UNITS: Record<Currency, number> = { USD: 100, SAR: 100 };

/** Exchange rates are stored with six decimals (`DECIMAL(12, 6)`). */
const RATE_SCALE = 1_000_000n;
const RATE_PATTERN = /^(\d{1,6})(?:\.(\d{1,6}))?$/;

export class MoneyError extends Error {
  override readonly name = "MoneyError";
}

export function assertMinorUnits(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new MoneyError("Amounts must be non-negative safe integers in minor units");
  }
}

/**
 * Parses a positive decimal exchange rate ("3.75", "3.750000") into an exact integer
 * scaled by 10^6. Floats are rejected so the rate never passes through binary rounding.
 */
export function parseRate(rate: string): bigint {
  const match = RATE_PATTERN.exec(rate.trim());
  if (!match) throw new MoneyError("Exchange rates must be decimal strings with up to 6 decimals");
  const [, whole = "0", fraction = ""] = match;
  const scaled = BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(6, "0"));
  if (scaled === 0n) throw new MoneyError("Exchange rates must be greater than zero");
  return scaled;
}

/**
 * Converts USD cents to SAR halalas at `usdToSarRate`, rounding half up to the nearest
 * halala — the store's single rounding rule (spec §10.3). One cent times the rate is
 * exactly the amount in halalas, so the computation is integer-only.
 */
export function usdCentsToSarHalalas(usdCents: number, usdToSarRate: string): number {
  assertMinorUnits(usdCents);
  const scaled = BigInt(usdCents) * parseRate(usdToSarRate);
  // Round half up: add half of the scale before the integer division.
  const halalas = (scaled + RATE_SCALE / 2n) / RATE_SCALE;
  return Number(halalas);
}

export type PricedProduct = {
  priceUsdCents: number;
  /** Optional owner-set SAR price that overrides the converted one. */
  fixedPriceSarHalalas: number | null;
};

/** The SAR price shown beneath the USD price and charged through Moyasar. */
export function sarPriceHalalas(product: PricedProduct, usdToSarRate: string): number {
  if (product.fixedPriceSarHalalas !== null) {
    assertMinorUnits(product.fixedPriceSarHalalas);
    return product.fixedPriceSarHalalas;
  }
  return usdCentsToSarHalalas(product.priceUsdCents, usdToSarRate);
}

/**
 * Minor units → major units, for display through Intl only. The result never feeds back
 * into calculations.
 */
export function toMajorUnits(amountMinor: number, currency: Currency): number {
  assertMinorUnits(amountMinor);
  return amountMinor / MINOR_UNITS[currency];
}

/** Exact decimal string ("19.99") for machine-readable output such as structured data. */
export function toDecimalString(amountMinor: number, currency: Currency): string {
  assertMinorUnits(amountMinor);
  const unit = MINOR_UNITS[currency];
  const whole = Math.floor(amountMinor / unit);
  const fraction = String(amountMinor % unit).padStart(String(unit).length - 1, "0");
  return `${whole}.${fraction}`;
}

// ── Owner input ────────────────────────────────────────────────────────────────────

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;
const AMOUNT_PATTERN = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/** Latin digits and "." for amounts typed on an Arabic keyboard ("١٢٫٥٠" → "12.50"). */
export function normalizeDecimalInput(text: string): string {
  return text
    .trim()
    .replace(ARABIC_INDIC_DIGITS, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/[٫,]/g, ".");
}

/**
 * Parses an amount typed in major units ("12", "12.5", "12.50") into minor units without
 * floating-point arithmetic. Returns null for anything else, including negatives,
 * thousands separators and more than two decimals.
 */
export function parseMajorUnits(text: string, currency: Currency): number | null {
  const match = AMOUNT_PATTERN.exec(normalizeDecimalInput(text));
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  const unit = MINOR_UNITS[currency];
  const amount = Number(whole) * unit + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Normalized exchange rate with six decimals ("3.75" → "3.750000"), or null if invalid. */
export function normalizeRate(text: string): string | null {
  try {
    const scaled = parseRate(normalizeDecimalInput(text));
    const whole = scaled / RATE_SCALE;
    const fraction = String(scaled % RATE_SCALE).padStart(6, "0");
    return `${whole}.${fraction}`;
  } catch {
    return null;
  }
}
