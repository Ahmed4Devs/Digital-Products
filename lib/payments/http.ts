import { ProviderRequestError, type ProviderId } from "./types";

export { safeEqual } from "@/lib/security/compare";

const TIMEOUT_MS = 15_000;

/**
 * JSON request to a provider API with a timeout. Errors carry the provider and status
 * only: response bodies can echo customer data and are never logged.
 */
export async function requestJson<T>(
  provider: ProviderId,
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        accept: "application/json",
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ProviderRequestError(provider, null, "request failed");
  }
  if (!response.ok) {
    throw new ProviderRequestError(provider, response.status, `HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new ProviderRequestError(provider, response.status, "invalid JSON");
  }
}

/** Major-unit decimal string for APIs that take "15.00" (PayPal). */
export function decimalAmount(amountMinor: number): string {
  const whole = Math.floor(amountMinor / 100);
  return `${whole}.${String(amountMinor % 100).padStart(2, "0")}`;
}

/** Minor units from a decimal string such as "15.00" or "15.5"; NaN when malformed. */
export function minorFromDecimal(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
