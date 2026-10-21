import { describe, expect, it } from "vitest";
import { keyedHash } from "@/lib/security/keyed-hash";

const secret = "a-test-secret-that-is-long-enough-000";

describe("keyedHash", () => {
  it("is deterministic per secret, purpose and value", () => {
    expect(keyedHash(secret, "ip-address", "203.0.113.7")).toBe(
      keyedHash(secret, "ip-address", "203.0.113.7"),
    );
  });

  it("separates purposes and secrets", () => {
    const base = keyedHash(secret, "ip-address", "203.0.113.7");
    expect(keyedHash(secret, "rate-limit", "203.0.113.7")).not.toBe(base);
    expect(keyedHash(`${secret}x`, "ip-address", "203.0.113.7")).not.toBe(base);
  });

  it("never contains the input", () => {
    const hash = keyedHash(secret, "ip-address", "203.0.113.7");
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("203");
  });
});
