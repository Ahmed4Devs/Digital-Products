import { expect, test, type Locator, type Page } from "@playwright/test";
import { createCoupon } from "@/tests/support/checkout";
import { e2eDb } from "@/tests/support/e2e-db";
import { hydrated } from "@/tests/support/e2e-hydration";
import { signInContext } from "@/tests/support/e2e-session";
import { createPaidOrder } from "@/tests/support/orders";
import { createCustomer } from "@/tests/support/users";

// The store on phones and tablets, with touch. Every other spec runs at desktop width,
// which is how a header wider than every phone once went unnoticed. The dashboard's
// counterpart is responsive-admin.spec.ts.

const SCREENS = [
  { name: "small phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "large phone", width: 430, height: 932 },
  { name: "phone on its side", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet on its side", width: 1024, height: 768 },
];
const PUBLIC_PAGES = [
  "",
  "/products",
  "/products?q=no-such-product",
  "/products/monthly-budget-planner",
  "/categories/templates",
  "/cart",
  "/legal/terms",
  "/no-such-page",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
];
const CUSTOMER_PAGES = ["/account", "/account/library", "/account/orders", "/cart", "/checkout"];

/** The page's width beyond the screen, in pixels. Zero when nothing can scroll sideways. */
async function sideways(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
  });
}

async function tap(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.tap();
}

for (const { name, width, height } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    for (const locale of ["ar", "en"] as const) {
      test(`public pages fit the screen · ${locale}`, async ({ page }) => {
        for (const path of PUBLIC_PAGES) {
          await page.goto(`/${locale}${path}`);
          expect(await sideways(page), path).toBeLessThanOrEqual(0);
        }
      });

      test(`customer pages fit the screen · ${locale}`, async ({ page, baseURL }) => {
        const db = e2eDb();
        const customer = await createCustomer(db, { preferredLocale: locale });
        const product = await db.product.findUniqueOrThrow({
          where: { slug: "monthly-budget-planner" },
        });
        await createPaidOrder(db, { user: customer, products: [product] });
        await signInContext(page.context(), baseURL!, customer.id);

        await page.goto(`/${locale}/products/social-media-design-kit`);
        await tap(await hydrated(page.getByRole("button", { name: /Add to cart|أضف إلى السلة/ })));
        await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible();

        for (const path of CUSTOMER_PAGES) {
          await page.goto(`/${locale}${path}`);
          expect(await sideways(page), path).toBeLessThanOrEqual(0);
        }
      });
    }
  });
}

test.describe("on a touch screen", () => {
  test.describe("tablet", () => {
    test.use({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true });

    test("the header's controls fill a finger", async ({ page }) => {
      await page.goto("/en");
      const banner = page.getByRole("banner");
      for (const control of [
        banner.getByRole("link", { name: "Products" }),
        banner.getByRole("link", { name: "Cart" }),
        banner.getByRole("link", { name: "Sign in" }),
        banner.getByRole("link", { name: "العربية" }),
        banner.getByRole("button", { name: "Change theme" }),
      ]) {
        expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("links a finger has to hit are tall enough", async ({ page }) => {
      await page.goto("/en/products/monthly-budget-planner");
      for (const link of [
        page.getByRole("navigation", { name: "Store information" }).getByRole("link").first(),
        page.getByRole("main").getByRole("navigation").getByRole("link").first(),
      ]) {
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
    });

    test("the filters are large enough that iOS does not zoom on focus", async ({ page }) => {
      await page.goto("/en/products");
      for (const field of [
        page.getByLabel("Search"),
        page.getByLabel("Category"),
        page.getByLabel("Sort by"),
      ]) {
        const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(size).toBeGreaterThanOrEqual(16);
      }
    });
  });
});

test.describe("the header on a phone", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  const banner = (page: Page) => page.getByRole("banner");

  test("keeps the cart, the account and the menu on one line", async ({ page }) => {
    await page.goto("/ar");
    await expect(banner(page).getByRole("link", { name: "السلة" })).toBeVisible();
    await expect(banner(page).getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(banner(page).getByRole("button", { name: "القائمة" })).toBeVisible();
    // Everything else moved into the menu, and nothing is announced twice.
    await expect(banner(page).getByRole("link", { name: "المنتجات" })).toBeHidden();
    await expect(banner(page).getByRole("link", { name: "English" })).toBeHidden();
    expect((await banner(page).boundingBox())?.height).toBeLessThanOrEqual(66);
  });

  test("its controls are comfortable to tap", async ({ page }) => {
    await page.goto("/en");
    for (const control of [
      banner(page).getByRole("link", { name: "Cart" }),
      banner(page).getByRole("link", { name: "Sign in" }),
      banner(page).getByRole("button", { name: "Menu" }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("the menu reaches the products, the language and the theme", async ({ page }) => {
    await page.goto("/en/products?q=budget");
    const menuButton = await hydrated(banner(page).getByRole("button", { name: "Menu" }));

    await tap(menuButton);
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);

    await tap(page.getByRole("menuitemradio", { name: "Dark" }));
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await tap(menuButton);
    await tap(page.getByRole("menuitem", { name: "العربية" }));
    await expect(page).toHaveURL(/\/ar\/products\?q=budget$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await tap(await hydrated(banner(page).getByRole("button", { name: "القائمة" })));
    await tap(page.getByRole("menuitem", { name: "المنتجات" }));
    await expect(page).toHaveURL(/\/ar\/products$/);
  });
});

for (const { name, width, height } of [
  { name: "small phone", width: 320, height: 568 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test.describe(name, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    test("a purchase works by touch from start to finish", async ({ page, baseURL }) => {
      test.slow();
      const db = e2eDb();
      const customer = await createCustomer(db, { preferredLocale: "en" });
      const coupon = await createCoupon(db, { type: "percent", value: 50, usageLimit: 10 });
      await signInContext(page.context(), baseURL!, customer.id);

      await page.goto("/en/products/monthly-budget-planner");
      await tap(await hydrated(page.getByRole("button", { name: "Add to cart" })));
      await expect(page.getByText("Added to your cart.")).toBeVisible();
      await tap(page.getByRole("link", { name: "View cart" }));
      await expect(page).toHaveURL(/\/en\/cart$/);
      await tap(page.getByRole("main").getByRole("link", { name: "Checkout" }));
      await expect(page).toHaveURL(/\/en\/checkout$/);

      const code = page.getByLabel("Coupon code");
      await code.fill(coupon.code);
      await tap(page.getByRole("button", { name: "Apply" }));
      await expect(page.getByText("Coupon applied.")).toBeVisible();
      await tap(await hydrated(page.getByRole("button", { name: "Pay now" })));
      await expect(page).toHaveURL(/\/en\/checkout\/fake/);
      await tap(await hydrated(page.getByRole("button", { name: "Pay", exact: true })));
      await expect(page).toHaveURL(/\/en\/account\/library$/, { timeout: 25_000 });
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      await expect(page.getByRole("main")).toContainText("Monthly Budget Planner");
    });

    test("searching and paging work by touch", async ({ page }) => {
      await page.goto("/en/products");
      await tap(await hydrated(page.getByRole("link", { name: "Next", exact: true })));
      await expect(page).toHaveURL(/page=2/);
      await page.getByLabel("Search").fill("budget");
      await tap(page.getByRole("button", { name: "Apply" }));
      await expect(page).toHaveURL(/q=budget/);
      await expect(page.getByRole("main").getByRole("article")).toHaveCount(1);
    });
  });
}
