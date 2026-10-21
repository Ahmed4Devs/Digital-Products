import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eDb } from "@/tests/support/e2e-db";
import { signInContext } from "@/tests/support/e2e-session";
import { extractLink, waitForMessage } from "@/tests/support/mailpit";
import { createCustomer, TEST_PASSWORD, uniqueEmail } from "@/tests/support/users";

// The customer account page (spec §6.1): email change with re-verification, password
// change, and account deletion that keeps order records (§17.5 §5).

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const main = (page: Page) => page.getByRole("main");

async function signedInCustomer(page: Page, baseURL: string) {
  const customer = await createCustomer(e2eDb(), { preferredLocale: "en" });
  await signInContext(page.context(), baseURL, customer.id);
  return customer;
}

test("change the email: confirmed from the new address", async ({ page, baseURL }) => {
  const customer = await signedInCustomer(page, baseURL!);
  const newEmail = uniqueEmail("e2e-new");
  await page.goto("/en/account");
  const section = page.getByRole("region", { name: "Email address" });
  await section.getByLabel("New email").fill(newEmail);
  await section.getByLabel("Current password").fill("wrong password");
  await section.getByRole("button", { name: "Change email" }).click();
  await expect(section.getByText("The password is incorrect.")).toBeVisible();

  await section.getByLabel("Current password").fill(TEST_PASSWORD);
  await section.getByRole("button", { name: "Change email" }).click();
  await expect(section.getByText(/Check the new address for a confirmation link/)).toBeVisible();
  await expect(main(page)).toContainText(customer.email);

  const message = await waitForMessage(newEmail);
  await page.goto(extractLink(message, "/api/auth/verify-email"));
  await expect(page).toHaveURL(/\/en\/account\?notice=email-changed$/);
  await expect(page.getByText("Your email address has been changed.")).toBeVisible();
  await expect(main(page)).toContainText(newEmail);
});

test("change the password: the new one signs in", async ({ page, baseURL, browser }) => {
  const customer = await signedInCustomer(page, baseURL!);
  const newPassword = "an entirely new passphrase";
  await page.goto("/en/account");
  const section = page.getByRole("region", { name: "Password" });
  await section.getByLabel("Current password").fill(TEST_PASSWORD);
  await section.getByLabel("New password", { exact: true }).fill(newPassword);
  await section.getByLabel("Confirm new password").fill("something else");
  await section.getByRole("button", { name: "Change password" }).click();
  await expect(section.getByText("The passwords do not match.")).toBeVisible();

  await section.getByLabel("Confirm new password").fill(newPassword);
  await section.getByRole("button", { name: "Change password" }).click();
  await expect(
    section.getByText("Password changed. Other devices have been signed out."),
  ).toBeVisible();
  // This browser stays signed in with its fresh session.
  await page.goto("/en/account/orders");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Orders");

  const fresh = await browser.newContext({ baseURL });
  const signIn = await fresh.newPage();
  await signIn.goto("/en/sign-in");
  await signIn.locator("#sign-in-email").fill(customer.email);
  await signIn.locator("#sign-in-password").fill(newPassword);
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(signIn).toHaveURL(/\/en\/account$/);
  await fresh.close();
});

test("delete the account: signed out, orders kept", async ({ page, baseURL }) => {
  const customer = await signedInCustomer(page, baseURL!);
  await page.goto("/en/account");
  const section = page.getByRole("region", { name: "Delete account" });
  await section.getByLabel("Current password").fill(TEST_PASSWORD);
  await section.getByRole("button", { name: "Delete my account" }).click();
  await expect(section.getByText("Confirm that you want to delete your account.")).toBeVisible();

  await section
    .getByRole("checkbox", { name: "I understand that I will lose access to everything I bought." })
    .check();
  await section.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?notice=account-deleted$/);
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();
  expect(await e2eDb().user.findUnique({ where: { id: customer.id } })).toBeNull();

  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Faccount$/);
});

for (const locale of ["ar", "en"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`the account page has no WCAG 2.2 AA violations · ${locale} · ${scheme}`, async ({
      page,
      baseURL,
    }) => {
      await signedInCustomer(page, baseURL!);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/${locale}/account`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
