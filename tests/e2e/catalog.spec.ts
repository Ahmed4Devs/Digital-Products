import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Browsing the catalog seeded by tests/e2e/prepare-database.ts (scripts/lib/demo-catalog
// plus tests/support/catalog), in both languages.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function waitForAssets(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
}

const main = (page: Page) => page.getByRole("main");

test.describe("Arabic storefront", () => {
  test("home → featured product, with USD and the SAR equivalent", async ({ page }) => {
    await page.goto("/ar");
    const featured = page.getByRole("region", { name: "منتجات مختارة" });
    await expect(featured.getByRole("listitem")).toHaveCount(3);

    await featured.getByRole("link", { name: /مخطط الميزانية الشهرية/ }).click();
    await expect(page).toHaveURL(/\/ar\/products\/monthly-budget-planner$/);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("مخطط الميزانية الشهرية");
    await expect(heading.getByRole("img", { name: "✨" })).toHaveAttribute(
      "src",
      "/twemoji/2728.svg",
    );

    // $12.00 → 45.00 SAR at the default 3.75 rate, in Latin digits.
    await expect(main(page)).toContainText("12.00");
    await expect(main(page)).toContainText("45.00");
    await expect(main(page)).toContainText("ماذا ستحصل؟");
  });

  test("category page lists only its published products", async ({ page }) => {
    await page.goto("/ar/categories/templates");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("قوالب");
    const items = main(page).getByRole("article");
    await expect(items).toHaveCount(4);
    await expect(main(page)).not.toContainText("قالب مؤرشف");
  });

  test("an empty category explains itself", async ({ page }) => {
    await page.goto("/ar/categories/audio");
    await expect(main(page)).toContainText("لا توجد منتجات في هذا القسم بعد.");
  });

  test("Arabic slugs work", async ({ page }) => {
    const response = await page.goto(`/ar/products/${encodeURIComponent("قالب-السيرة-الذاتية")}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("قالب السيرة الذاتية");
  });
});

test.describe("English storefront", () => {
  test("falls back to Arabic text when English is missing", async ({ page }) => {
    await page.goto("/en/categories/templates");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Templates");
    await expect(main(page)).toContainText("قالب السيرة الذاتية");
    await expect(main(page)).toContainText("Monthly Budget Planner");
  });

  test("shows the owner's fixed SAR price, compare-at prices and free products", async ({
    page,
  }) => {
    await page.goto("/en/products/arabic-typography-guide");
    await expect(main(page)).toContainText("19.99");
    await expect(main(page)).toContainText("74.00"); // fixed, not the converted 74.96
    await expect(main(page)).not.toContainText("74.96");

    await page.goto("/en/products/social-media-design-kit");
    await expect(main(page).locator("del")).toContainText("39.00");

    await page.goto("/en/products/free-wallpapers");
    await expect(main(page)).toContainText("Free");
  });

  test("never serves draft, archived or unknown products", async ({ request }) => {
    for (const slug of ["unreleased-course", "retired-template", "no-such-product"]) {
      const response = await request.get(`/en/products/${slug}`);
      expect(response.status(), slug).toBe(404);
    }
  });
});

test.describe("product listing", () => {
  test("searches, filters, sorts and paginates", async ({ page }) => {
    await page.goto("/en/products");
    await expect(page.getByRole("status").filter({ hasText: "Results" })).toHaveText("Results: 18");
    await expect(main(page).getByRole("article")).toHaveCount(12);

    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/products\?page=2$/);
    await expect(main(page).getByRole("article")).toHaveCount(6);
    await expect(main(page)).toContainText("Page 2 of 2");

    await page.getByLabel("Search").fill("budget");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/\/en\/products\?q=budget/);
    await expect(main(page).getByRole("article")).toHaveCount(1);
    await expect(main(page)).toContainText("Monthly Budget Planner");
  });

  test("filters by category with the cheapest first", async ({ page }) => {
    await page.goto("/ar/products?category=courses&sort=price-asc");
    await expect(page.getByLabel("القسم")).toHaveValue("courses");
    await expect(main(page).getByRole("article")).toHaveCount(1);
    await expect(main(page)).toContainText("دورة Next.js للمبتدئين");
  });

  test("shows an empty state and ignores invalid parameters", async ({ page }) => {
    await page.goto("/en/products?q=zzzz-nothing");
    await expect(main(page)).toContainText("No products match.");
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/products$/);

    const response = await page.goto("/en/products?page=-3&sort=evil&utm_source=x");
    expect(response?.status()).toBe(200);
    await expect(main(page)).toContainText("Page 1 of 2");
  });
});

test("descriptions are sanitized: nothing in them can run", async ({ page }) => {
  await page.goto("/en/products/sanitizer-probe");
  const description = page.getByRole("region", { name: "Description" });
  await expect(description).toContainText("Safe text");
  await expect(description.getByRole("img", { name: "✨" })).toBeVisible();
  await description.getByText("click").click();
  // The javascript: URL was removed, so what is left is an inert anchor without href.
  await description.getByText("link", { exact: true }).click();

  expect(await page.evaluate(() => (window as { __xss?: unknown }).__xss)).toBeUndefined();
  await expect(description.locator("script")).toHaveCount(0);
  await expect(description.locator("[onerror], [onclick]")).toHaveCount(0);
  await expect(description.locator("a[href]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/en\/products\/sanitizer-probe$/);
});

test.describe("SEO", () => {
  test("product pages have canonical, hreflang and structured data", async ({ page }) => {
    await page.goto("/ar/products/monthly-budget-planner");
    const head = page.locator("head");
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/ar\/products\/monthly-budget-planner$/,
    );
    for (const [language, path] of [
      ["ar", "/ar/products/monthly-budget-planner"],
      ["en", "/en/products/monthly-budget-planner"],
      ["x-default", "/products/monthly-budget-planner"],
    ]) {
      await expect(head.locator(`link[rel="alternate"][hreflang="${language}"]`)).toHaveAttribute(
        "href",
        new RegExp(`${path}$`),
      );
    }
    await expect(head.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page).toHaveTitle("مخطط الميزانية الشهرية ✨ | المتجر الرقمي");

    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    );
    expect(jsonLd).toMatchObject({
      "@type": "Product",
      name: "مخطط الميزانية الشهرية ✨",
      offers: { price: "12.00", priceCurrency: "USD" },
    });
  });

  test("sitemap lists public pages in both languages and nothing private", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/ar/products/monthly-budget-planner</loc>");
    expect(sitemap).toContain("/en/categories/templates</loc>");
    expect(sitemap).toContain('hreflang="x-default"');
    for (const hidden of [
      "unreleased-course",
      "retired-template",
      "/admin",
      "/account",
      "sign-in",
    ]) {
      expect(sitemap).not.toContain(hidden);
    }
  });

  test("robots.txt keeps crawlers out of private areas", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /ar/admin");
    expect(robots).toContain("Disallow: /en/account");
    expect(robots).toContain("Sitemap: ");
  });

  test("auth pages are not indexed", async ({ page }) => {
    await page.goto("/en/sign-in");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
  });
});

for (const { locale, dir } of [
  { locale: "ar", dir: "rtl" },
  { locale: "en", dir: "ltr" },
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`catalog · ${locale} · ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      for (const path of ["", "/products", "/products/social-media-design-kit"]) {
        test(`${path || "/"} has no WCAG 2.2 AA violations`, async ({ page }) => {
          await page.goto(`/${locale}${path}`);
          await expect(page.locator("html")).toHaveAttribute("dir", dir);
          await waitForAssets(page);
          const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
          expect(results.violations).toEqual([]);
        });
      }

      test("product page matches its visual snapshot", async ({ page }) => {
        await page.goto(`/${locale}/products/social-media-design-kit`);
        await waitForAssets(page);
        await expect(page).toHaveScreenshot(`product-${locale}-${scheme}.png`, { fullPage: true });
      });
    });
  }
}
