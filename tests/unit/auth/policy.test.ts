import { describe, expect, it } from "vitest";
import { deriveCustomerName, isSessionAllowed } from "@/lib/auth/policy";

describe("deriveCustomerName", () => {
  it("uses the local part of the email", () => {
    expect(deriveCustomerName("sara.ali@example.com")).toBe("sara.ali");
  });

  it("caps the length by characters, not UTF-16 units", () => {
    const name = deriveCustomerName(`${"م".repeat(80)}@example.com`);
    expect(Array.from(name)).toHaveLength(64);
  });

  it("never returns an empty name", () => {
    expect(deriveCustomerName("@example.com")).toBe("customer");
  });
});

describe("isSessionAllowed", () => {
  it("gives the owner sessions only through owner sign-in", () => {
    expect(isSessionAllowed("owner", "/sign-in/username")).toBe(true);
    expect(isSessionAllowed("owner", "/sign-in/email")).toBe(false);
    expect(isSessionAllowed("owner", "/magic-link/verify")).toBe(false);
    expect(isSessionAllowed("owner", "/verify-email")).toBe(false);
  });

  it("never gives a customer a session through username sign-in", () => {
    expect(isSessionAllowed("customer", "/sign-in/username")).toBe(false);
    expect(isSessionAllowed("customer", "/sign-in/email")).toBe(true);
    expect(isSessionAllowed("customer", "/magic-link/verify")).toBe(true);
  });
});
