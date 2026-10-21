import { describe, expect, it } from "vitest";
import { authErrorKey } from "@/lib/auth/error-messages";
import { messagesByLocale } from "@/messages";

describe("authErrorKey", () => {
  it("collapses every credential failure into one message", () => {
    for (const code of [
      "INVALID_EMAIL_OR_PASSWORD",
      "INVALID_USERNAME_OR_PASSWORD",
      "USER_NOT_FOUND",
      "INVALID_USERNAME",
    ]) {
      expect(authErrorKey({ code, status: 401 })).toBe("invalidCredentials");
    }
  });

  it("maps specific codes and rate limiting", () => {
    expect(authErrorKey({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe("emailNotVerified");
    expect(authErrorKey({ code: "PASSWORD_COMPROMISED", status: 400 })).toBe("passwordCompromised");
    expect(authErrorKey({ code: "TOKEN_EXPIRED" })).toBe("invalidToken");
    expect(authErrorKey({ code: "VERIFICATION_FAILED", status: 403 })).toBe("captchaFailed");
    expect(authErrorKey({ status: 429 })).toBe("tooManyRequests");
  });

  it("falls back to a generic message", () => {
    expect(authErrorKey({ code: "SOMETHING_NEW", status: 500 })).toBe("generic");
    expect(authErrorKey({})).toBe("generic");
  });

  it("has a translation for every key in both languages", () => {
    const keys = [
      "invalidCredentials",
      "emailNotVerified",
      "invalidEmail",
      "passwordTooShort",
      "passwordTooLong",
      "passwordCompromised",
      "invalidToken",
      "captchaFailed",
      "captchaRequired",
      "tooManyRequests",
      "signInFailed",
      "generic",
    ] satisfies ReturnType<typeof authErrorKey>[];
    for (const locale of ["ar", "en"] as const) {
      expect(Object.keys(messagesByLocale[locale].auth.errors).sort()).toEqual([...keys].sort());
    }
  });
});
