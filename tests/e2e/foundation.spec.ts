import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LOCALES = [
  { locale: "ar", dir: "rtl", themeLabel: "تغيير المظهر", darkLabel: "داكن" },
  { locale: "en", dir: "ltr", themeLabel: "Change theme", darkLabel: "Dark" },
] as const;
const SCHEMES = ["light", "dark"] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Collects console errors and uncaught exceptions (hydration mismatches surface here). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function waitForAssets(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
}

for (const { locale, dir } of LOCALES) {
  for (const scheme of SCHEMES) {
    test.describe(`${locale.toUpperCase()} · ${dir} · ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      test("renders the base layout", async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto(`/${locale}`);

        const html = page.locator("html");
        await expect(html).toHaveAttribute("lang", locale);
        await expect(html).toHaveAttribute("dir", dir);
        await expect(html).toHaveClass(new RegExp(`\\b${scheme}\\b`));
        const colorScheme = await page.evaluate(
          () => getComputedStyle(document.documentElement).colorScheme,
        );
        expect(colorScheme).toBe(scheme);

        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("contentinfo")).toBeVisible();

        const sparkle = page.getByRole("heading", { level: 1 }).getByRole("img", { name: "✨" });
        await expect(sparkle).toHaveAttribute("src", "/twemoji/2728.svg");

        await waitForAssets(page);
        // A broken image reports naturalWidth 0.
        expect(
          await sparkle.evaluate((image: HTMLImageElement) => image.naturalWidth),
        ).toBeGreaterThan(0);
        await expect(page).toHaveScreenshot(`home-${locale}-${scheme}.png`, { fullPage: true });
        expect(errors).toEqual([]);
      });

      test("has no WCAG 2.2 AA violations", async ({ page }) => {
        await page.goto(`/${locale}`);
        await waitForAssets(page);
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations).toEqual([]);
      });
    });
  }
}

test.describe("locale negotiation for /", () => {
  test("falls back to Arabic", async ({ request }) => {
    const response = await request.get("/", {
      maxRedirects: 0,
      headers: { "accept-language": "fr-FR,fr;q=0.9" },
    });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/ar$/);
  });

  test("follows Accept-Language", async ({ request }) => {
    const response = await request.get("/", {
      maxRedirects: 0,
      headers: { "accept-language": "en-GB,en;q=0.9" },
    });
    expect(response.headers().location).toMatch(/\/en$/);
  });

  test("prefers the locale cookie over Accept-Language", async ({ request }) => {
    const response = await request.get("/", {
      maxRedirects: 0,
      headers: { "accept-language": "en-US", cookie: "NEXT_LOCALE=ar" },
    });
    expect(response.headers().location).toMatch(/\/ar$/);
  });
});

test.describe("language switcher", () => {
  test.use({ locale: "ar-SA" });

  test("keeps the page and query, and remembers the choice", async ({ page, context }) => {
    await page.goto("/ar?ref=campaign");
    await page.getByRole("link", { name: "English" }).click();

    await expect(page).toHaveURL(/\/en\?ref=campaign$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    const cookie = (await context.cookies()).find(({ name }) => name === "NEXT_LOCALE");
    expect(cookie?.value).toBe("en");

    // The browser still prefers Arabic, but the explicit choice wins on the next visit.
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);

    await page.getByRole("link", { name: "العربية" }).click();
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("theme toggle", () => {
  test.use({ colorScheme: "light" });

  for (const { locale, themeLabel, darkLabel } of LOCALES) {
    test(`switches and persists the theme by keyboard (${locale})`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveClass(/\blight\b/);

      const trigger = page.getByRole("button", { name: themeLabel });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dark = page.getByRole("menuitemradio", { name: darkLabel });
      await expect(dark).toBeVisible();
      await dark.focus();
      await page.keyboard.press("Enter");

      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await page.reload();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    });
  }
});

test("skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/en");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
