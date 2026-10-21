import { expect, test, type Page, type Response } from "@playwright/test";
import { e2eDb } from "@/tests/support/e2e-db";
import { ownerId, signInContext } from "@/tests/support/e2e-session";
import { createCustomer } from "@/tests/support/users";

// The two-policy CSP (spec §17.5 §2) and the other security headers, on the real build:
// every server-rendered script on nonce routes carries the request's nonce, no page
// triggers a CSP violation, and catalog pages keep their static policy.

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });
});

async function violations(page: Page): Promise<string[]> {
  // Late chunks (lazy editor, emoji data) load after the first paint.
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => window.__cspViolations);
}

function nonceOf(response: Response | null): string {
  const policy = response?.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  if (!nonce) throw new Error(`no nonce in ${policy}`);
  return nonce;
}

async function expectEveryScriptNonced(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  const nonce = nonceOf(response);
  const html = await response!.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length, path).toBeGreaterThan(0);
  for (const script of scripts) expect(script, path).toContain(`nonce="${nonce}"`);
  expect(await violations(page), path).toEqual([]);
}

test("auth pages: every script carries the nonce, no violations", async ({ page }) => {
  for (const path of ["/en/sign-in", "/ar/sign-up", "/en/forgot-password", "/ar/admin/sign-in"]) {
    await expectEveryScriptNonced(page, path);
  }
});

test("account and checkout: every script carries the nonce, no violations", async ({
  page,
  baseURL,
}) => {
  const customer = await createCustomer(e2eDb(), { preferredLocale: "en" });
  await signInContext(page.context(), baseURL!, customer.id);
  await page.goto("/en/products/monthly-budget-planner");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  for (const path of ["/en/account", "/en/account/library", "/ar/account/orders", "/en/checkout"]) {
    await expectEveryScriptNonced(page, path);
  }
});

test("the dashboard: every script carries the nonce, no violations", async ({ page, baseURL }) => {
  await signInContext(page.context(), baseURL!, await ownerId());
  for (const path of [
    "/en/admin",
    "/en/admin/products/new",
    "/ar/admin/settings",
    "/en/admin/coupons/new",
  ]) {
    await expectEveryScriptNonced(page, path);
  }
});

test("catalog pages keep the static policy and run without violations", async ({ page }) => {
  for (const path of ["/en", "/ar/products", "/en/products/monthly-budget-planner", "/en/cart"]) {
    const response = await page.goto(path);
    const policy = response?.headers()["content-security-policy"] ?? "";
    expect(policy, path).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy, path).not.toMatch(/nonce-|strict-dynamic|paddle|cloudflare/);
    expect(policy, path).toContain("frame-ancestors 'none'");
    expect(await violations(page), path).toEqual([]);
  }
});

test("every response carries the security headers", async ({ request }) => {
  for (const path of ["/en", "/en/sign-in", "/en/admin", "/api/health"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["strict-transport-security"], path).toBe("max-age=63072000; includeSubDomains");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});
