import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createCoupon } from "@/tests/support/checkout";
import { e2eDb } from "@/tests/support/e2e-db";
import { hydrated } from "@/tests/support/e2e-hydration";
import { ownerId, signInContext } from "@/tests/support/e2e-session";
import { createPaidOrder } from "@/tests/support/orders";
import { createCustomer } from "@/tests/support/users";

// The dashboard on phones and tablets, by touch. Named *admin.spec.ts to run after the
// storefront specs; the storefront's counterpart is responsive.spec.ts.

const SCREENS = [
  { name: "small phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet on its side", width: 1024, height: 768 },
];

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

async function paidOrder() {
  const db = e2eDb();
  const customer = await createCustomer(db, { preferredLocale: "en" });
  const product = await db.product.findUniqueOrThrow({ where: { slug: "monthly-budget-planner" } });
  const order = await createPaidOrder(db, { user: customer, products: [product] });
  return { customer, product, order };
}

test.beforeEach(async ({ context, baseURL }) => {
  await signInContext(context, baseURL!, await ownerId());
});

for (const { name, width, height } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    for (const locale of ["ar", "en"] as const) {
      test(`dashboard pages fit the screen · ${locale}`, async ({ page }) => {
        test.slow();
        const { customer, product, order } = await paidOrder();
        const coupon = await createCoupon(e2eDb());
        for (const path of [
          "/admin",
          "/admin/products",
          "/admin/products/new",
          `/admin/products/${product.id}`,
          `/admin/products/${product.id}/preview`,
          "/admin/categories",
          "/admin/orders",
          `/admin/orders/${order.id}`,
          "/admin/customers",
          `/admin/customers/${customer.id}`,
          "/admin/coupons",
          "/admin/coupons/new",
          `/admin/coupons/${coupon.id}`,
          "/admin/settings",
          "/admin/audit",
        ]) {
          await page.goto(`/${locale}${path}`);
          expect(await sideways(page), path).toBeLessThanOrEqual(0);
        }
      });
    }
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test("every section is reachable from the navigation", async ({ page }) => {
    await page.goto("/en/admin");
    const nav = page.getByRole("navigation", { name: "Dashboard sections" });
    await hydrated(nav.getByRole("link", { name: "Audit log" }));
    for (const [link, url] of [
      ["Audit log", /admin\/audit/],
      ["Settings", /admin\/settings$/],
      ["Orders", /admin\/orders$/],
    ] as const) {
      await tap(
        page
          .getByRole("navigation", { name: "Dashboard sections" })
          .getByRole("link", { name: link }),
      );
      await expect(page).toHaveURL(url);
    }
  });

  test("every legal page can be opened with a tap", async ({ page }) => {
    await page.goto("/en/admin/settings");
    const legal = page.getByRole("region", { name: "Legal pages" });
    await hydrated(legal.getByRole("tab").first());
    const tabs = await legal.getByRole("tab").all();
    expect(tabs.length).toBe(5);
    for (const tab of tabs) {
      await tap(tab);
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
  });

  test("the emoji picker stays on the screen", async ({ page }) => {
    await page.goto("/en/admin/products/new");
    const title = page.getByRole("tabpanel", { name: "Arabic" });
    await tap(await hydrated(title.getByRole("button", { name: "Insert emoji" }).first()));
    const picker = page.getByRole("dialog");
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });

  test("a confirmation fits the screen and keeps both of its buttons", async ({ page }) => {
    const { order } = await paidOrder();
    await page.goto(`/en/admin/orders/${order.id}`);
    await tap(await hydrated(page.getByRole("button", { name: "Refund" })));
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    for (const box of [
      await dialog.boundingBox(),
      ...(await Promise.all((await dialog.getByRole("button").all()).map((b) => b.boundingBox()))),
    ]) {
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
    }
  });
});

// The longest text the forms accept. Published products go here, not in responsive.spec.ts,
// because the storefront specs assert exact listings.
test.describe("long text", () => {
  const UNBROKEN = "Supercalifragilisticexpialidocious".repeat(4).slice(0, 120);
  const LONG_LINK = `https://example.com/${"a/very/long/unbroken/path/".repeat(8)}`;

  async function longProduct() {
    const suffix = randomUUID().slice(0, 8);
    return e2eDb().product.create({
      data: {
        slug: `long-text-${suffix}`,
        titleAr: UNBROKEN,
        titleEn: UNBROKEN,
        shortDescriptionEn: UNBROKEN,
        descriptionEn: `<p>${LONG_LINK}</p><pre>${"const line = true; ".repeat(30)}</pre>`,
        descriptionAr: `<p>${LONG_LINK}</p><pre>${"const line = true; ".repeat(30)}</pre>`,
        priceUsdCents: 2500,
        status: "published",
        publishedAt: new Date(),
      },
    });
  }

  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1180, height: 820 },
  ]) {
    for (const locale of ["ar", "en"] as const) {
      test(`stays inside the screen · ${width}px · ${locale}`, async ({ browser, baseURL }) => {
        test.slow();
        const db = e2eDb();
        const [inCart, bought] = [await longProduct(), await longProduct()];
        const customer = await createCustomer(db, {
          preferredLocale: locale,
          email: `a.very.long.customer.address.${randomUUID()}@a-rather-long-company-domain.example.com`,
        });
        await createPaidOrder(db, { user: customer, products: [bought] });

        const context = await browser.newContext({
          baseURL,
          viewport: { width, height },
          isMobile: true,
          hasTouch: true,
        });
        await signInContext(context, baseURL!, customer.id);
        const page = await context.newPage();
        await page.goto(`/${locale}/products/${inCart.slug}`);
        await tap(await hydrated(page.getByRole("button", { name: /Add to cart|أضف إلى السلة/ })));
        await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible();

        for (const path of [
          `/products/${inCart.slug}`,
          `/products?q=${inCart.slug.slice(-8)}`,
          "/cart",
          "/checkout",
          "/account",
          "/account/library",
          "/account/orders",
        ]) {
          await page.goto(`/${locale}${path}`);
          expect(await sideways(page), path).toBeLessThanOrEqual(0);
        }
        await context.close();
      });
    }
  }

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("a description's code block needs no sideways scrolling", async ({ page }) => {
      const product = await longProduct();
      await page.goto(`/en/products/${product.slug}`);
      await expect(page.locator("pre")).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(violations).toEqual([]);
    });

    test("the longest store name stays on one line in the header", async ({ page }) => {
      await page.goto("/ar");
      const name = page.getByRole("banner").getByRole("link").first().locator("span");
      await name.evaluate((el) => {
        el.textContent = "متجر المنتجات الرقمية الاحترافية الشاملة للكتب والقوالب والدور";
      });
      expect((await page.getByRole("banner").boundingBox())?.height).toBeLessThanOrEqual(66);
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      const box = await name.boundingBox();
      expect(box?.height).toBeLessThanOrEqual(30);
    });
  });
});
