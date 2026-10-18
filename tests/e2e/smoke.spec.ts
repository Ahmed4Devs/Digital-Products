import { expect, test } from "@playwright/test";

test("health check reports a healthy database", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok" } });
});

test.describe("with an Arabic-speaking browser", () => {
  test.use({ locale: "ar-SA" });

  test("/ lands on the right-to-left Arabic home page", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test("does not advertise the framework in response headers", async ({ request }) => {
  const response = await request.get("/ar");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
