import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirects";

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/cart")).toBe("/cart");
    expect(safeNextPath("/products?page=2&sort=new")).toBe("/products?page=2&sort=new");
  });

  it("drops a leading locale, which navigation adds back", () => {
    expect(safeNextPath("/ar/account")).toBe("/account");
    expect(safeNextPath("/en")).toBe("/");
    expect(safeNextPath("/english-books")).toBe("/english-books");
  });

  it.each([
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/ok\u0000",
    "/line\nbreak",
    "",
    `/${"a".repeat(600)}`,
  ])("rejects %j", (value) => {
    expect(safeNextPath(value)).toBeUndefined();
  });

  it("never sends people back into the auth pages", () => {
    expect(safeNextPath("/sign-in")).toBeUndefined();
    expect(safeNextPath("/ar/reset-password?token=abc")).toBeUndefined();
    expect(safeNextPath("/sign-in-help")).toBe("/sign-in-help");
  });

  it("ignores non-string input", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(["/cart"])).toBeUndefined();
  });
});
