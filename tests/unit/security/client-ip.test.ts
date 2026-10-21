import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/security/client-ip";

const headers = (values: Record<string, string>) => new Headers(values);

describe("clientIp", () => {
  it("believes a single forwarded address without trusted proxies", () => {
    const options = { ipHeaders: ["x-forwarded-for"], trustedProxies: [] };
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7" }), options)).toBe("203.0.113.7");
    // The leftmost entry of a chain is client-controlled.
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }), options)).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "not-an-ip" }), options)).toBeNull();
    expect(clientIp(headers({}), options)).toBeNull();
  });

  it("walks the chain from the right past trusted proxies", () => {
    const options = { ipHeaders: ["x-forwarded-for"], trustedProxies: ["10.0.0.0/8", "192.0.2.1"] };
    expect(
      clientIp(
        headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.1.2.3, 192.0.2.1" }),
        options,
      ),
    ).toBe("203.0.113.7");
    expect(clientIp(headers({ "x-forwarded-for": "10.1.2.3" }), options)).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "garbage, 10.1.2.3" }), options)).toBeNull();
  });

  it("tries headers in order and supports IPv6", () => {
    const options = {
      ipHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      trustedProxies: ["2001:db8::/32"],
    };
    expect(
      clientIp(
        headers({ "cf-connecting-ip": "2001:db9::1", "x-forwarded-for": "198.51.100.1" }),
        options,
      ),
    ).toBe("2001:db9::1");
    expect(clientIp(headers({ "x-forwarded-for": "198.51.100.1, 2001:db8::5" }), options)).toBe(
      "198.51.100.1",
    );
  });
});
