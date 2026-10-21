import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fakePaymentToken, FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@/lib/payments/fake";
import { e2eDb } from "@/tests/support/e2e-db";
import { buyWithFakeGateway } from "@/tests/support/e2e-checkout";
import { signInContext } from "@/tests/support/e2e-session";
import { waitForMessage } from "@/tests/support/mailpit";
import { createCustomer } from "@/tests/support/users";

// Delivery (Phase 7): purchase → download → exceed the per-minute limit → refund
// removes access → buying again restores it.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const main = (page: Page) => page.getByRole("main");

async function signedInCustomer(page: Page, baseURL: string) {
  const customer = await createCustomer(e2eDb());
  await signInContext(page.context(), baseURL, customer.id);
  return customer;
}

test("purchase → download → per-minute limit → refund → buy again", async ({ page, baseURL }) => {
  const customer = await signedInCustomer(page, baseURL!);
  await buyWithFakeGateway(page, "monthly-budget-planner");

  const link = main(page).getByRole("link", { name: "Download budget-planner.pdf" });
  await expect(link).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("budget-planner.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString()).toContain("Monthly Budget Planner (E2E)");

  // Four more fit in the minute (default limit 5)…
  for (let index = 0; index < 4; index += 1) {
    await Promise.all([page.waitForEvent("download"), link.click()]);
  }
  // …the sixth is refused with a translated message.
  await link.click();
  await expect(page).toHaveURL(/\/en\/account\/library\?notice=rateLimited$/);
  await expect(main(page).getByRole("alert")).toHaveText("Please try again in a minute.");
  const href = await link.getAttribute("href");

  // The receipt arrived, with a link to My Purchases and no file link.
  const receipt = await waitForMessage(customer.email);
  expect(receipt.Subject).toContain("Your receipt for order");
  expect(receipt.HTML).not.toContain("/api/downloads");

  // A refund (here the fake provider's refund webhook) removes access.
  const order = await e2eDb().order.findFirstOrThrow({
    where: { userId: customer.id, status: "paid" },
  });
  const secret = process.env.BETTER_AUTH_SECRET!;
  const body = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: "payment.refunded",
    payment: fakePaymentToken(secret, order.providerReference!, "refunded"),
  });
  const refund = await page.request.post("/api/webhooks/fake", {
    data: body,
    headers: {
      "content-type": "application/json",
      [FAKE_SIGNATURE_HEADER]: signFakeWebhook(secret, body),
    },
  });
  expect(await refund.json()).toEqual({ received: true, outcome: "refunded" });

  await page.goto("/en/account/library");
  await expect(main(page)).toContainText("You have no purchases yet.");
  await page.goto(href!);
  await expect(page).toHaveURL(/notice=unavailable$/);
  await expect(main(page).getByRole("alert")).toHaveText("This download is no longer available.");

  await page.goto("/en/account/orders");
  await expect(main(page).getByRole("article").first()).toContainText("Refunded");

  // Buying it again restores access (entitlement upsert, spec §17.5 §4).
  await buyWithFakeGateway(page, "monthly-budget-planner");
  await expect(main(page).getByRole("link", { name: "Download budget-planner.pdf" })).toBeVisible();
  expect(await e2eDb().entitlement.count({ where: { userId: customer.id } })).toBe(1);
});

test("downloads need the owner's session", async ({ page, baseURL, request }) => {
  const customer = await signedInCustomer(page, baseURL!);
  await buyWithFakeGateway(page, "monthly-budget-planner", "ar");
  const href = await main(page)
    .getByRole("link", { name: "تنزيل budget-planner.pdf" })
    .getAttribute("href");
  expect(href).toMatch(/^\/api\/downloads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\?locale=ar$/);

  const guest = await request.get(href!, { maxRedirects: 0 });
  expect(guest.status()).toBe(303);
  expect(guest.headers().location).toContain("/ar/sign-in");

  // Another customer is sent back to their own library.
  await signedInCustomer(page, baseURL!);
  await page.goto(href!);
  await expect(page).toHaveURL(/\/ar\/account\/library\?notice=unavailable$/);
  expect(customer.email).toBeTruthy();
});

for (const locale of ["ar", "en"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`My Purchases and orders have no WCAG 2.2 AA violations · ${locale} · ${scheme}`, async ({
      page,
      baseURL,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signedInCustomer(page, baseURL!);
      await buyWithFakeGateway(page, "monthly-budget-planner", locale);
      for (const path of ["/account/library", "/account/orders", "/account"]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
}
