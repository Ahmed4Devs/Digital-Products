import { makeSignature } from "better-auth/crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLOCKING_RENDER_MARKER } from "@/lib/proxy/blocking-render";
import { createProxy } from "@/lib/proxy/create-proxy";
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

  it("leaves the admin decision to the layout when nothing can be verified", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    try {
      const response = await proxy(request("/ar/admin", SESSION_COOKIE));
      expect(response.headers.get("x-middleware-rewrite") ?? "").not.toContain("_not-found");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not treat look-alike paths as protected", async () => {
    const response = await proxy(request("/ar/accounting-guide"));
    expect(response.status).not.toBe(307);
  });
});

describe("admin 404s from the session token", () => {
  const SECRET = "unit-test-secret-at-least-32-characters-long";
  const lookUp = vi.fn(async (token: string) => token === "owner-token");
  const withLookup = createProxy(lookUp);
  const notFound = (response: Response) =>
    (response.headers.get("x-middleware-rewrite") ?? "").includes("_not-found");
  const signed = async (token: string) =>
    `better-auth.session_token=${encodeURIComponent(`${token}.${await makeSignature(token, SECRET)}`)}`;

  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
    lookUp.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets the owner's session through and answers everyone else with a real 404", async () => {
    expect(
      notFound(await withLookup(request("/en/admin/orders", await signed("owner-token")))),
    ).toBe(false);
    expect(
      notFound(await withLookup(request("/en/admin/orders", await signed("customer-token")))),
    ).toBe(true);
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("never looks up tokens with a forged signature", async () => {
    expect(
      notFound(
        await withLookup(request("/en/admin", "better-auth.session_token=owner-token.forged")),
      ),
    ).toBe(true);
    expect(lookUp).not.toHaveBeenCalled();
  });

  it("leaves the decision to the layout when the lookup fails", async () => {
    const failing = createProxy(async () => {
      throw new Error("database unavailable");
    });
    expect(notFound(await failing(request("/en/admin", await signed("any-token"))))).toBe(false);
  });
});

describe("CSP nonces", () => {
  it("passes one fresh nonce to the app and the browser on nonce routes", async () => {
    const first = await proxy(request("/en/sign-in"));
    const policy = first.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);

    const second = await proxy(request("/en/sign-in"));
    expect(second.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
  });

  it("gives the admin's 404 rewrite the store's static policy", async () => {
    const response = await proxy(request("/en/admin/orders"));
    expect(response.headers.get("x-middleware-rewrite")).toMatch(/_not-found$/);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toMatch(/'nonce-/);
  });

  it("leaves the static policy of catalog routes to next.config", async () => {
    const response = await proxy(request("/en/products"));
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
  });
});

describe("blocking render for page loads of the (secure) group", () => {
  const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0";
  // What a browser sends for a page load. Next.js strips the RSC headers before the proxy
  // runs, so a client navigation or prefetch arrives as a plain fetch that accepts `*/*`.
  const PAGE_LOAD = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const load = (path: string, headers: Record<string, string> = {}) =>
    proxy(
      new NextRequest(new URL(path, "http://localhost:3000"), {
        headers: { "user-agent": BROWSER, accept: PAGE_LOAD, cookie: SESSION_COOKIE, ...headers },
      }),
    );
  const forwardedUserAgent = (response: Response) =>
    response.headers.get("x-middleware-request-user-agent");

  it("marks page loads and keeps the real User-Agent in front", async () => {
    for (const path of ["/en/sign-in", "/ar/account", "/en/checkout/result?order=x"]) {
      expect(forwardedUserAgent(await load(path)), path).toBe(
        `${BROWSER} ${BLOCKING_RENDER_MARKER}`,
      );
    }
    const anonymous = await proxy(
      new NextRequest(new URL("/en/sign-in", "http://localhost:3000"), {
        headers: { accept: PAGE_LOAD },
      }),
    );
    expect(forwardedUserAgent(anonymous)).toBe(BLOCKING_RENDER_MARKER);
  });

  it("leaves client navigations, Server Actions and catalog pages alone", async () => {
    expect(forwardedUserAgent(await load("/en/account", { accept: "*/*" }))).toBe(BROWSER);

    const action = await proxy(
      new NextRequest(new URL("/en/checkout", "http://localhost:3000"), {
        method: "POST",
        headers: { "user-agent": BROWSER, cookie: SESSION_COOKIE, "next-action": "abc" },
        body: "[]",
      }),
    );
    expect(forwardedUserAgent(action)).toBe(BROWSER);

    expect(forwardedUserAgent(await load("/en/products")) ?? "").not.toContain(
      BLOCKING_RENDER_MARKER,
    );
  });
});

describe("request bodies", () => {
  it("never consumes the body of a Server Action POST to a nonce route", async () => {
    const post = new NextRequest(new URL("/en/checkout", "http://localhost:3000"), {
      method: "POST",
      headers: { cookie: SESSION_COOKIE, "next-action": "abc" },
      body: '["payload"]',
    });
    const response = await proxy(post);
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
    expect(post.bodyUsed).toBe(false);
    expect(await post.text()).toBe('["payload"]');
  });
});
