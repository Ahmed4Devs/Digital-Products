import { describe, expect, it } from "vitest";
import { checkEmail, checkNewPassword, formPassword, formString } from "@/lib/auth/form-schemas";

describe("auth form checks", () => {
  it("validates email addresses", () => {
    expect(checkEmail("buyer@example.com")).toBeNull();
    expect(checkEmail("not-an-email")).toBe("invalidEmail");
    expect(checkEmail("")).toBe("invalidEmail");
  });

  it("enforces the password length window", () => {
    expect(checkNewPassword("12345678")).toBeNull();
    expect(checkNewPassword("1234567")).toBe("passwordTooShort");
    expect(checkNewPassword("x".repeat(129))).toBe("passwordTooLong");
  });

  it("trims text fields but never passwords", () => {
    const data = new FormData();
    data.set("email", "  buyer@example.com ");
    data.set("password", "  spaced password  ");
    expect(formString(data, "email")).toBe("buyer@example.com");
    expect(formPassword(data, "password")).toBe("  spaced password  ");
    expect(formString(data, "missing")).toBe("");
  });
});
