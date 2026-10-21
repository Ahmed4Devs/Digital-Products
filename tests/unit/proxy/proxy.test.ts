import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy from "@/proxy";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

const SESSION_COOKIE = "better-auth.session_token=token.signature";

describe("proxy (optimistic checks only)", () => {
  it("sends guests from customer areas to sign-in with a return path", async () => {
    const response = await proxy(request("/ar/account?tab=orders"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/ar/sign-in?next=%2Faccount%3Ftab%3Dorders",
    );

    const checkout = await proxy(request("/en/checkout"));
    expect(checkout.headers.get("location")).toBe(
      "http://localhost:3000/en/sign-in?next=%2Fcheckout",
    );
  });

  it("lets requests with a session cookie through to the real checks", async () => {
    const response = await proxy(request("/ar/account", SESSION_COOKIE));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite") ?? "").not.toContain("_not-found");
  });

  it("answers the admin with a 404 for guests", async () => {
    for (const path of ["/ar/admin", "/en/admin/products/123"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("x-middleware-rewrite")).toMatch(/\/(ar|en)\/admin\/_not-found$/);
    }
  });

  it("never blocks the owner sign-in page", async () => {
    const response = await proxy(request("/ar/admin/sign-in"));
    expect(response.headers.get("x-middleware-rewrite") ?? "").not.toContain("_not-found");
  });

  it("leaves the admin decision to the layout when the role is unknown", async () => {
    const response = await proxy(request("/ar/admin", SESSION_COOKIE));
    expect(response.headers.get("x-middleware-rewrite") ?? "").not.toContain("_not-found");
  });

  it("does not treat look-alike paths as protected", async () => {
    const response = await proxy(request("/ar/accounting-guide"));
    expect(response.status).not.toBe(307);
  });
});
