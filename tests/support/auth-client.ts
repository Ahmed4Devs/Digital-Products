import type { Auth } from "@/lib/auth/server";
import { TURNSTILE_TEST_TOKEN } from "@/lib/auth/turnstile";
import { uniqueIp } from "./users";

const ORIGIN = "http://localhost:3000";

export type AuthResponse = {
  status: number;
  body: unknown;
  /** `name=value` pairs from Set-Cookie, ready for a Cookie header. */
  cookies: string;
  headers: Headers;
};

type CallOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  /** Defaults to a fresh IP per call so per-IP limits do not interfere. */
  ip?: string;
  cookies?: string;
  headers?: Record<string, string>;
};

/** Calls Better Auth through its real HTTP handler: rate limits, plugins and hooks apply. */
export async function callAuth(
  auth: Auth,
  path: string,
  options: CallOptions = {},
): Promise<AuthResponse> {
  const headers = new Headers({
    origin: ORIGIN,
    "x-forwarded-for": options.ip ?? uniqueIp(),
    ...options.headers,
  });
  if (options.cookies) headers.set("cookie", options.cookies);
  if (path === "/sign-up/email" && !headers.has("x-captcha-response")) {
    headers.set("x-captcha-response", TURNSTILE_TEST_TOKEN);
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      redirect: "manual",
    }),
  );
  const text = await response.text();
  const cookies = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0]!)
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON bodies (redirects, plain text) are returned as text.
  }
  return { status: response.status, body: parsed, cookies, headers: response.headers };
}
