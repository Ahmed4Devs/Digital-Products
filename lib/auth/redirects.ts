import { routing } from "@/i18n/routing";

const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

/**
 * Validates a post-sign-in destination taken from the URL (`?next=`). Only same-site,
 * locale-less paths are accepted, so the parameter can never become an open redirect:
 * no scheme, no protocol-relative `//host`, no backslashes and no control characters.
 * A leading locale is dropped because navigation helpers add the current one.
 */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;

  let url: URL;
  try {
    url = new URL(value, "http://localhost");
  } catch {
    return undefined;
  }
  if (url.origin !== "http://localhost") return undefined;

  const path = url.pathname.replace(LOCALE_PREFIX, "") || "/";
  // Never bounce back into the auth pages themselves.
  if (/^\/(sign-in|sign-up|forgot-password|reset-password|verify-email)(\/|$)/.test(path)) {
    return undefined;
  }
  return `${path}${url.search}`;
}
