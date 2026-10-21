import { expect, type Page } from "@playwright/test";

/** Buys one product through the fake gateway and waits for My Purchases. */
export async function buyWithFakeGateway(page: Page, slug: string, locale: "ar" | "en" = "en") {
  const text =
    locale === "en"
      ? { add: "Add to cart", added: "Added to your cart.", pay: "Pay now", confirm: "Pay" }
      : { add: "أضف إلى السلة", added: "أُضيف إلى سلتك.", pay: "ادفع الآن", confirm: "ادفع" };
  await page.goto(`/${locale}/products/${slug}`);
  await page.getByRole("button", { name: text.add }).click();
  await expect(page.getByText(text.added)).toBeVisible();
  await page.goto(`/${locale}/checkout`);
  await page.getByRole("button", { name: text.pay }).click();
  await expect(page).toHaveURL(/\/checkout\/fake\?reference=/);
  await page.getByRole("button", { name: text.confirm, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account/library$`), { timeout: 20_000 });
}
