import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createCoupon } from "@/tests/support/checkout";
import { e2eDb } from "@/tests/support/e2e-db";
import { signInContext } from "@/tests/support/e2e-session";
import { createCustomer } from "@/tests/support/users";

// Cart → checkout → (fake) payment → webhook → My Purchases, in a production build.
// The fake gateway (TEST_DOUBLES) plays the provider's hosted page and sends signed
// webhooks to the real endpoint, so the order becomes paid exactly as in production.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const main = (page: Page) => page.getByRole("main");

async function signedInCustomer(page: Page, baseURL: string) {
  const customer = await createCustomer(e2eDb());
  await signInContext(page.context(), baseURL, customer.id);
  return customer;
}

test("cart → coupon → fake payment → webhook → My Purchases", async ({ page, baseURL }) => {
  const customer = await signedInCustomer(page, baseURL!);
  const coupon = await createCoupon(e2eDb(), { type: "percent", value: 50, usageLimit: 10 });

  await page.goto("/en/products/monthly-budget-planner");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Cart\s*items: 1$/ })).toBeVisible();

  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(main(page).getByRole("list", { name: "Items in your cart" })).toContainText(
    "Monthly Budget Planner",
  );
  await expect(main(page)).toContainText("Subtotal: $12.00");

  await main(page).getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/en\/checkout$/);
  await expect(page.getByRole("radio", { name: /Test payment/ })).toBeChecked();
  await page.getByLabel("Coupon code").fill(coupon.code.toLowerCase());
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Coupon applied.")).toBeVisible();
  await expect(
    main(page)
      .getByRole("definition")
      .filter({ hasText: /^\$6\.00$/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page).toHaveURL(/\/en\/checkout\/fake\?reference=fake_/);
  await expect(main(page)).toContainText("Amount: $6.00");
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  // The result page polls until the webhook has marked the order paid.
  await expect(page).toHaveURL(/\/en\/account\/library$/, { timeout: 20_000 });
  await expect(main(page)).toContainText("Monthly Budget Planner");
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toBeVisible();

  const order = await e2eDb().order.findFirstOrThrow({
    where: { userId: customer.id },
    include: { paymentEvents: true },
  });
  expect(order).toMatchObject({
    status: "paid",
    provider: "fake",
    discountUsdCents: 600,
    totalUsdCents: 600,
  });
  expect(order.paymentEvents.map((event) => event.outcome)).toEqual(["fulfilled"]);

  // Bought products cannot be bought again.
  await page.goto("/en/products/monthly-budget-planner");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  await page.goto("/en/checkout");
  await expect(main(page)).toContainText("Your cart is empty.");
});

test("guests are sent to sign in and come back to checkout", async ({ page }) => {
  await page.goto("/ar/checkout");
  await expect(page).toHaveURL(/\/ar\/sign-in\?next=%2Fcheckout$/);
});

test("free products are claimed without a gateway", async ({ page, baseURL }) => {
  await page.goto("/en/products/free-wallpapers");
  await page.getByRole("button", { name: "Get it free" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fproducts%2Ffree-wallpapers$/);

  await signedInCustomer(page, baseURL!);
  await page.goto("/en/products/free-wallpapers");
  await page.getByRole("button", { name: "Get it free" }).click();
  await expect(page).toHaveURL(/\/en\/account\/library$/, { timeout: 20_000 });
  await expect(main(page)).toContainText("Free Wallpapers");
});

test("a declined payment leaves the order unpaid", async ({ page, baseURL }) => {
  const customer = await signedInCustomer(page, baseURL!);
  await page.goto("/ar/products/social-media-design-kit");
  await page.getByRole("button", { name: "أضف إلى السلة" }).click();
  await expect(page.getByText("أُضيف إلى سلتك.")).toBeVisible();
  await page.goto("/ar/checkout");
  await page.getByRole("button", { name: "ادفع الآن" }).click();
  await page.getByRole("button", { name: "ارفض" }).click();
  await expect(main(page).getByRole("alert")).toContainText("لم تتم عملية الدفع", {
    timeout: 20_000,
  });
  const order = await e2eDb().order.findFirstOrThrow({ where: { userId: customer.id } });
  expect(order.status).toBe("failed");
  expect(await e2eDb().entitlement.count({ where: { userId: customer.id } })).toBe(0);
});

test("the order status endpoint answers only the order's owner", async ({
  page,
  baseURL,
  request,
}) => {
  const customer = await signedInCustomer(page, baseURL!);
  await page.goto("/en/products/pricing-freelance-work");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();
  await page.goto("/en/checkout");
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page).toHaveURL(/checkout\/fake/);
  const order = await e2eDb().order.findFirstOrThrow({ where: { userId: customer.id } });

  expect((await page.request.get(`/api/orders/${order.id}/status`)).status()).toBe(200);
  expect((await request.get(`/api/orders/${order.id}/status`)).status()).toBe(404);
  // A forged webhook is refused.
  const forged = await request.post("/api/webhooks/fake", {
    data: { id: "evt_forged", type: "payment.paid", payment: "fakepay_x.y" },
  });
  expect(forged.status()).toBe(401);
  expect((await e2eDb().order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "pending",
  );
});

for (const locale of ["ar", "en"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`cart and checkout have no WCAG 2.2 AA violations · ${locale} · ${scheme}`, async ({
      page,
      baseURL,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signedInCustomer(page, baseURL!);
      await page.goto(`/${locale}/products/arabic-typography-guide`);
      await page
        .getByRole("button", { name: locale === "ar" ? "أضف إلى السلة" : "Add to cart" })
        .click();
      await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible();
      for (const path of ["/cart", "/checkout"]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
}
