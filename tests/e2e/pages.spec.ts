import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Legal pages and the translated 404 page (Phase 9).

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("legal pages are linked from the footer and show placeholders until written", async ({
  page,
}) => {
  await page.goto("/en");
  const legal = page.getByRole("navigation", { name: "Store information" });
  await legal.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/en\/legal\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
  await expect(page.getByText(/Sample text: the store owner has not published/)).toBeVisible();
  // The privacy placeholder states how long order records are kept (spec §17.5 §5).
  await expect(page.getByRole("main")).toContainText(
    "Order records, including the email address used for each order, are kept",
  );
  await expect(page).toHaveTitle(/^Privacy policy \| /);

  const response = await page.goto("/ar/legal/refund-policy");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("سياسة الاسترداد");
  for (const slug of ["terms", "about", "contact"]) {
    expect((await page.request.get(`/en/legal/${slug}`)).status(), slug).toBe(200);
  }
  expect((await page.request.get("/en/legal/cookies")).status()).toBe(404);
});

test("unknown pages get the translated 404 with a real status", async ({ page }) => {
  for (const [path, heading] of [
    ["/en/no-such-page", "We couldn't find this page"],
    ["/ar/no/such/page", "لم نعثر على هذه الصفحة"],
    ["/en/products/no-such-product", "We couldn't find this page"],
    ["/ar/categories/no-such-category", "لم نعثر على هذه الصفحة"],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
    await expect(page.getByRole("banner"), path).toBeVisible();
  }
  await page.getByRole("main").getByRole("link", { name: "تصفّح المنتجات" }).click();
  await expect(page).toHaveURL(/\/ar\/products$/);
});

for (const locale of ["ar", "en"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`legal and 404 pages have no WCAG 2.2 AA violations · ${locale} · ${scheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["/legal/terms", "/legal/privacy", "/no-such-page"]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
}
