import { expect, test, type Locator, type Page } from "@playwright/test";
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
