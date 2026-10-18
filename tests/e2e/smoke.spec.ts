import { expect, test } from "@playwright/test";

test("health check reports a healthy database", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok" } });
});

test("home page renders right-to-left Arabic by default", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("does not advertise the framework in response headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
