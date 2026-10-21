import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eDb } from "../support/e2e-db";
import { extractLink, waitForMessage } from "../support/mailpit";
import { createCustomer, OWNER, TEST_PASSWORD, uniqueEmail, uniqueIp } from "../support/users";

// Customer and owner authentication end to end (spec §5.3): real pages, the real Better
// Auth handler, email read back from Mailpit.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Each test is its own client IP, so the per-IP sign-in limits never interfere.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp() });
});

async function signIn(page: Page, email: string, password: string, submit: string | RegExp) {
  await page.locator("#sign-in-email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: submit, exact: true }).click();
}

test("a customer signs up, confirms the email, signs in and out (Arabic)", async ({ page }) => {
  const email = uniqueEmail("e2e-signup");
  await page.goto("/ar/sign-up");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "تحقّق من بريدك الإلكتروني",
  );
  await expect(page.getByRole("main").getByRole("status")).toContainText(email);

  const message = await waitForMessage(email);
  expect(message.Subject).toContain("أكِّد بريدك الإلكتروني");
  await page.goto(extractLink(message, "/api/auth/verify-email"));
  await expect(page).toHaveURL(/\/ar\/verify-email\?status=verified/);
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "تم تأكيد بريدك الإلكتروني",
  );

  await page.getByRole("link", { name: "تسجيل الدخول" }).last().click();
  await expect(page).toHaveURL(/\/ar\/sign-in\?notice=verified/);
  await signIn(page, email, TEST_PASSWORD, "تسجيل الدخول");
  await expect(page).toHaveURL(/\/ar\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("حسابي");
  await expect(page.getByRole("main")).toContainText(email);
  await expect(page.getByRole("banner").getByRole("link", { name: "حسابي" })).toBeVisible();

  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/ar$/);
  await page.goto("/ar/account");
  await expect(page).toHaveURL(/\/ar\/sign-in\?next=%2Faccount$/);
});

test("an unverified customer is told to confirm the email first", async ({ page }) => {
  const customer = await createCustomer(e2eDb(), { verified: false });
  await page.goto("/en/sign-in");
  await signIn(page, customer.email, TEST_PASSWORD, "Sign in");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Your email isn't confirmed yet. We've sent you a new confirmation link.",
  );
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("a customer signs in with a magic link and returns to the requested page", async ({
  page,
}) => {
  // Emails use the language stored on the account, not the page's.
  const customer = await createCustomer(e2eDb(), { preferredLocale: "en" });
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Faccount$/);

  await page.locator("#magic-link-email").fill(customer.email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "we've sent it a sign-in link",
  );

  const message = await waitForMessage(customer.email);
  expect(message.Subject).toBe("Your sign-in link for Digital Store");
  await page.goto(extractLink(message, "/api/auth/magic-link/verify"));
  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(page.getByRole("main")).toContainText(customer.email);
});

test("a customer resets a forgotten password", async ({ page }) => {
  const customer = await createCustomer(e2eDb());
  await page.goto("/en/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/en\/forgot-password$/);
  await page.locator("#forgot-password-email").fill(customer.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("password reset link");

  const message = await waitForMessage(customer.email);
  await page.goto(extractLink(message, "/api/auth/reset-password/"));
  await expect(page).toHaveURL(/\/en\/reset-password\?token=/);
  const newPassword = "an entirely new passphrase";
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();

  await expect(page).toHaveURL(/\/en\/sign-in\?notice=password-reset$/);
  await signIn(page, customer.email, TEST_PASSWORD, "Sign in");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The details you entered are incorrect.",
  );
  await signIn(page, customer.email, newPassword, "Sign in");
  await expect(page).toHaveURL(/\/en\/account$/);
});

test.describe("owner", () => {
  test("signs in with username and password at the hidden admin sign-in", async ({ page }) => {
    await page.goto("/ar/admin/sign-in");
    await page.getByLabel("اسم المستخدم").fill(OWNER.username);
    await page.getByLabel("كلمة المرور").fill(OWNER.password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();

    await expect(page).toHaveURL(/\/ar\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحة التحكم");
    await expect(page.getByRole("main")).toContainText("مرحبًا Store");
  });

  test("cannot use the customer sign-in, and gets the generic error", async ({ page }) => {
    await page.goto("/en/sign-in");
    await signIn(page, OWNER.email, OWNER.password, "Sign in");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "The details you entered are incorrect.",
    );
  });
});

test.describe("the admin area answers 404 to everyone but the owner", () => {
  test("guests", async ({ request }) => {
    for (const path of ["/ar/admin", "/en/admin"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });

  test("signed-in customers", async ({ page }) => {
    const customer = await createCustomer(e2eDb());
    await page.goto("/en/sign-in");
    await signIn(page, customer.email, TEST_PASSWORD, "Sign in");
    await expect(page).toHaveURL(/\/en\/account$/);

    const response = await page.goto("/en/admin");
    expect(response?.status()).toBe(404);
  });

  test("a customer cannot sign in at the owner page", async ({ page }) => {
    const customer = await createCustomer(e2eDb());
    await page.goto("/en/admin/sign-in");
    await page.getByLabel("Username").fill(customer.email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "The details you entered are incorrect.",
    );
  });
});

for (const { locale, dir } of [
  { locale: "ar", dir: "rtl" },
  { locale: "en", dir: "ltr" },
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`auth pages · ${locale} · ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      for (const path of ["sign-in", "sign-up", "forgot-password"] as const) {
        test(`${path} is accessible and keeps inputs left-to-right`, async ({ page }) => {
          await page.goto(`/${locale}/${path}`);
          await expect(page.locator("html")).toHaveAttribute("dir", dir);
          const email = page.locator('input[type="email"]').first();
          await expect(email).toHaveAttribute("dir", "ltr");
          await page.evaluate(() => document.fonts.ready);

          const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
          expect(results.violations).toEqual([]);
        });
      }

      test("sign-in matches its visual snapshot", async ({ page }) => {
        await page.goto(`/${locale}/sign-in`);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`sign-in-${locale}-${scheme}.png`, { fullPage: true });
      });
    });
  }
}
