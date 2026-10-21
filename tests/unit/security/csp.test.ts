import { describe, expect, it } from "vitest";
import {
  createNonce,
  cspContextFromEnv,
  noncePolicy,
  nonceRouteFor,
  securityHeaders,
  STATIC_POLICY_SOURCE,
  staticPolicy,
  type CspContext,
} from "@/lib/security/csp";

const context: CspContext = {
  dev: false,
  publicMediaOrigin: "https://media.example.test",
  uploadOrigin: "https://storage.example.test",
  upgradeInsecureRequests: true,
};

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((part) => {
      const [name = "", ...values] = part.split(" ");
      return [name, values];
    }),
  );
}

describe("route classification", () => {
  it("puts the dynamic areas and customer auth pages under the nonce policy", () => {
    expect(nonceRouteFor("/en/admin")).toBe("admin");
    expect(nonceRouteFor("/ar/admin/sign-in")).toBe("admin");
    expect(nonceRouteFor("/ar/account/library")).toBe("account");
    expect(nonceRouteFor("/en/checkout/paddle")).toBe("checkout");
    expect(nonceRouteFor("/ar/sign-up")).toBe("signUp");
    for (const page of ["sign-in", "forgot-password", "reset-password", "verify-email"]) {
      expect(nonceRouteFor(`/en/${page}`)).toBe("auth");
    }
  });

  it("leaves catalog, cart and look-alike paths to the static policy", () => {
    for (const path of [
      "/",
      "/en",
      "/ar/products/monthly-budget-planner",
      "/en/cart",
      "/en/accounting-guide",
      "/en/checkouts",
      "/en/products/admin",
      "/fr/admin",
    ]) {
      expect(nonceRouteFor(path), path).toBeNull();
    }
  });

  it("matches exactly the complement in next.config's header source", () => {
    const source = new RegExp(`^${STATIC_POLICY_SOURCE}$`);
    for (const path of [
      "/",
      "/en",
      "/en/products",
      "/ar/cart",
      "/en/accounting-guide",
      "/api/health",
    ]) {
      expect(source.test(path), path).toBe(true);
    }
    for (const path of [
      "/en/admin",
      "/en/admin/orders",
      "/ar/account",
      "/en/checkout/result",
      "/ar/sign-up",
    ]) {
      expect(source.test(path), path).toBe(false);
    }
  });
});

describe("policies", () => {
  it("nonce routes trust only their nonce, with 'strict-dynamic' and no inline scripts", () => {
    const policy = directives(noncePolicy("account", "abc123", context));
    expect(policy.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("img-src")).toContain("https://media.example.test");
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
  });

  it("allows each third party only on the route that needs it", () => {
    const checkout = directives(noncePolicy("checkout", "n", context));
    expect(checkout.get("script-src")).toContain("https://cdn.paddle.com");
    expect(checkout.get("frame-src")).toEqual([
      "https://buy.paddle.com",
      "https://sandbox-buy.paddle.com",
    ]);
    const signUp = directives(noncePolicy("signUp", "n", context));
    expect(signUp.get("script-src")).toContain("https://challenges.cloudflare.com");
    expect(signUp.get("script-src")).not.toContain("https://cdn.paddle.com");
    const admin = directives(noncePolicy("admin", "n", context));
    expect(admin.get("connect-src")).toEqual(["'self'", "https://storage.example.test"]);
    expect(admin.get("frame-src")).toEqual(["'none'"]);
    const auth = directives(noncePolicy("auth", "n", context));
    expect(auth.get("connect-src")).toEqual(["'self'"]);
    expect(auth.get("script-src")?.join(" ")).not.toMatch(/https:/);
  });

  it("the static policy allows inline framework scripts but no third-party origin", () => {
    const policy = staticPolicy(context);
    expect(policy).not.toMatch(/nonce-|strict-dynamic|paddle|cloudflare/);
    const parsed = directives(policy);
    expect(parsed.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(parsed.get("frame-src")).toEqual(["'none'"]);
    expect(parsed.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("adds 'unsafe-eval' only in development and upgrades requests only over HTTPS", () => {
    const local = cspContextFromEnv({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      S3_PUBLIC_BASE_URL: "http://127.0.0.1:9010/media",
      S3_ENDPOINT: "http://127.0.0.1:9010",
    });
    expect(local).toEqual({
      dev: true,
      publicMediaOrigin: "http://127.0.0.1:9010",
      uploadOrigin: "http://127.0.0.1:9010",
      upgradeInsecureRequests: false,
    });
    expect(directives(staticPolicy(local)).get("script-src")).toContain("'unsafe-eval'");
    expect(directives(noncePolicy("admin", "n", local)).has("upgrade-insecure-requests")).toBe(
      false,
    );
    expect(cspContextFromEnv({ NODE_ENV: "production", S3_ENDPOINT: "not a url" })).toMatchObject({
      dev: false,
      uploadOrigin: null,
      publicMediaOrigin: null,
    });
  });
});

describe("nonces and headers", () => {
  it("creates unpredictable 128-bit nonces", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("sends the standard security headers", () => {
    const headers = Object.fromEntries(securityHeaders().map(({ key, value }) => [key, value]));
    expect(headers).toMatchObject({
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});
