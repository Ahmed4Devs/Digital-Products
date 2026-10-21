import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pngBytes } from "@/tests/support/files";
import { e2eDb } from "@/tests/support/e2e-db";
import { ownerId, signInContext } from "@/tests/support/e2e-session";
import { createPaidOrder } from "@/tests/support/orders";
import { createCustomer } from "@/tests/support/users";

// The rest of the owner dashboard (Phase 8): orders, customers, coupons, settings and
// the audit log. Runs with the owner specs, after the storefront specs.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const main = (page: Page) => page.getByRole("main");

test.beforeEach(async ({ context, baseURL }) => {
  await signInContext(context, baseURL!, await ownerId());
});

async function paidOrder() {
  const db = e2eDb();
  const customer = await createCustomer(db, { preferredLocale: "en" });
  const product = await db.product.findUniqueOrThrow({ where: { slug: "monthly-budget-planner" } });
  const order = await createPaidOrder(db, { user: customer, products: [product] });
  return { customer, product, order };
}

test("an order: revoke and grant access, resend the receipt, refund", async ({
  page,
  browser,
  baseURL,
}) => {
  const { customer, order } = await paidOrder();
  const shopper = await browser.newContext({ baseURL });
  await signInContext(shopper, baseURL!, customer.id);
  const library = await shopper.newPage();

  await page.goto("/en/admin/orders");
  await page.getByLabel("Search").fill(customer.email);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("status")).toHaveText("Results: 1");
  await page.getByRole("link", { name: `Order ${order.orderNumber}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Order ${order.orderNumber}`);
  await expect(main(page)).toContainText("Paid");

  await page.getByRole("button", { name: /^Revoke access to Monthly Budget Planner/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Access revoked.")).toBeVisible();
  await library.goto("/en/account/library");
  await expect(library.getByText("You have no purchases yet.")).toBeVisible();

  await page.getByRole("button", { name: /^Grant access to Monthly Budget Planner/ }).click();
  await expect(page.getByText("Access granted.")).toBeVisible();
  await library.reload();
  await expect(library.getByRole("heading", { name: /Monthly Budget Planner/ })).toBeVisible();

  await page.getByRole("button", { name: "Resend receipt" }).click();
  await expect(page.getByText("Receipt sent.")).toBeVisible();

  // The confirmation dialog is portaled outside main, so main holds only the trigger.
  await main(page).getByRole("button", { name: "Refund", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Refund" }).click();
  await expect(page.getByText("Order refunded. The customer no longer has access.")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Refund", exact: true })).toBeDisabled();
  await library.reload();
  await expect(library.getByText("You have no purchases yet.")).toBeVisible();
  await shopper.close();
});

test("a customer: ban signs them out, lift the ban, grant a product", async ({
  page,
  browser,
  baseURL,
}) => {
  const customer = await createCustomer(e2eDb(), { preferredLocale: "en" });
  const shopper = await browser.newContext({ baseURL });
  await signInContext(shopper, baseURL!, customer.id);
  const account = await shopper.newPage();

  await page.goto(`/en/admin/customers?q=${encodeURIComponent(customer.email)}`);
  await page.getByRole("link", { name: customer.email }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(customer.email);

  await page.getByRole("button", { name: "Ban account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ban" }).click();
  await expect(page.getByText("Account banned and signed out everywhere.")).toBeVisible();
  // The session this browser held no longer exists.
  await account.goto("/en/account/orders");
  await expect(account).toHaveURL(/\/en\/sign-in/);

  await page.getByRole("button", { name: "Lift ban" }).click();
  await expect(page.getByText("Ban lifted.")).toBeVisible();

  await page.getByLabel("Grant a product").selectOption({ label: "Social Media Design Kit 🎨" });
  await page.getByRole("button", { name: "Grant", exact: true }).click();
  await expect(page.getByText("Access granted.")).toBeVisible();
  await expect(main(page)).toContainText("Granted by you");
  await shopper.close();
});

test("coupons: create, edit, deactivate, all in the audit log", async ({ page }) => {
  const code = `E2E${Date.now().toString(36).toUpperCase()}`;
  await page.goto("/en/admin/coupons/new");
  await page.getByLabel("Code").fill(code.toLowerCase());
  await page.getByLabel("Percentage").fill("150");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByText("Enter a whole number from 1 to 100.")).toBeVisible();
  await page.getByLabel("Percentage").fill("20");
  await page.getByLabel("Total uses").fill("50");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/coupons\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(code);
  await expect(main(page)).toContainText("0 of 50");

  // Scoped to visible regions: the previous page can stay mounted, hidden, for back
  // navigation.
  const edit = page.getByRole("region", { name: "Edit coupon" });
  await edit.getByLabel("Discount type").selectOption("fixed");
  await edit.getByLabel("Amount (USD)").fill("5");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByText("Coupon saved.")).toBeVisible();

  await page
    .getByRole("region", { name: "Usage" })
    .getByRole("button", { name: "Deactivate" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Coupon deactivated.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).locator("..")).toContainText("Inactive");

  await page.goto("/en/admin/audit?entity=coupon");
  const rows = main(page).getByRole("row");
  await expect(rows.filter({ hasText: "Coupon deactivated" }).first()).toBeVisible();
  await expect(rows.filter({ hasText: "Coupon edited" }).first()).toContainText("percent");
  await expect(rows.filter({ hasText: "Coupon created" }).first()).toBeVisible();
});

test("settings: the store name and logo show on the storefront at once", async ({ page }) => {
  const db = e2eDb();
  const before = await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
  try {
    await page.goto("/en/admin/settings");
    const store = page.getByRole("region", { name: "Store", exact: true });
    await store.getByLabel("Store name (English)").fill("Owner Test Store");
    await store.getByRole("button", { name: "Save" }).click();
    await expect(store.getByText("Settings saved.")).toBeVisible();

    await page.goto("/en");
    await expect(page.getByRole("banner")).toContainText("Owner Test Store");
    await expect(page).toHaveTitle("Owner Test Store");

    await page.goto("/en/admin/settings");
    const logos = page.getByRole("region", { name: "Logos" });
    await logos
      .getByLabel("Upload logo")
      .first()
      .setInputFiles({
        name: "logo.png",
        mimeType: "image/png",
        buffer: pngBytes(160, 40),
      });
    await expect(logos.getByText("Logo saved.")).toBeVisible();
    await page.goto("/en");
    await expect(
      page.getByRole("banner").getByRole("img", { name: "Owner Test Store" }).first(),
    ).toBeVisible();

    await page.goto("/en/admin/settings");
    const legal = page.getByRole("region", { name: "Legal pages" });
    const logos2 = page.getByRole("region", { name: "Logos" });
    await legal.getByRole("tab", { name: "Privacy" }).click();
    const panel = legal.getByRole("tabpanel", { name: "Privacy" });
    const editor = panel.getByRole("textbox", { name: "Privacy (English)" });
    await editor.click();
    await editor.pressSequentially("We keep order records for accounting.");
    await panel.getByRole("button", { name: "Save page" }).click();
    await expect(panel.getByText("Settings saved.")).toBeVisible();

    // Put the store back through the dashboard, so the storefront caches refresh too.
    await logos2.getByRole("button", { name: "Remove logo" }).click();
    await expect(logos2.getByText("Logo removed.")).toBeVisible();
    await store.getByLabel("Store name (English)").fill(before.storeNameEn);
    await store.getByRole("button", { name: "Save" }).click();
    await expect(store.getByText("Settings saved.")).toBeVisible();
  } finally {
    const { id: _id, updatedAt: _updatedAt, ...restore } = before;
    await db.storeSetting.update({ where: { id: 1 }, data: restore });
  }
});

test("guests and customers never see the new dashboard pages", async ({ browser, baseURL }) => {
  const customer = await createCustomer(e2eDb());
  const guest = await browser.newContext({ baseURL });
  const signedIn = await browser.newContext({ baseURL });
  await signInContext(signedIn, baseURL!, customer.id);
  for (const path of [
    "/admin",
    "/admin/orders",
    "/admin/customers",
    "/admin/coupons",
    "/admin/audit",
  ]) {
    expect((await guest.request.get(`/en${path}`)).status(), path).toBe(404);
    expect((await signedIn.request.get(`/en${path}`)).status(), path).toBe(404);
  }
  await guest.close();
  await signedIn.close();
});

for (const locale of ["ar", "en"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`orders, customers, coupons and audit have no WCAG 2.2 AA violations · ${locale} · ${scheme}`, async ({
      page,
    }) => {
      const { customer, order } = await paidOrder();
      const coupon = await e2eDb().coupon.create({
        data: {
          code: `AXE${Date.now().toString(36)}${locale}${scheme}`.toUpperCase(),
          type: "percent",
          value: 10,
        },
      });
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of [
        "/admin",
        "/admin/orders",
        `/admin/orders/${order.id}`,
        "/admin/customers",
        `/admin/customers/${customer.id}`,
        "/admin/coupons",
        "/admin/coupons/new",
        `/admin/coupons/${coupon.id}`,
        "/admin/audit",
      ]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
}
