import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pdfBytes, pngBytes } from "@/tests/support/files";
import { ownerId, signInContext } from "@/tests/support/e2e-session";

// The owner's product management (Phase 5). These specs run after the catalog specs
// (see playwright.config.ts) because publishing changes what the store lists.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ context, baseURL }) => {
  await signInContext(context, baseURL!, await ownerId());
});

const main = (page: Page) => page.getByRole("main");

test("create → upload → publish → visible in the store immediately", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const titleEn = `Owner Made Guide ${suffix} ✨`;
  const slug = `owner-made-guide-${suffix}`;

  await page.goto("/en/admin/products/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New product");

  // Arabic tab is first; English fields are mounted in the second tab.
  await page
    .getByRole("tabpanel", { name: "Arabic" })
    .getByLabel("Title", { exact: true })
    .fill(`دليل من المالك ${suffix}`);
  await page.getByRole("tab", { name: "English" }).click();
  const english = page.getByRole("tabpanel", { name: "English" });
  await english.getByLabel("Title", { exact: true }).fill(titleEn);
  await english.getByLabel("Short description").fill("Made from the dashboard.");
  const editor = english.getByRole("textbox", { name: "Description", exact: true });
  await editor.click();
  await editor.pressSequentially("Everything you need to start.");
  await page.getByLabel("Price (USD)", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Create product" }).click();

  await expect(page).toHaveURL(/\/en\/admin\/products\/[0-9a-f-]{36}\?created=1$/);
  await expect(
    page.getByText("Product created. Add images and files, then publish it."),
  ).toBeVisible();

  // Publishing without a file is refused with a clear message.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Add at least one file before publishing.")).toBeVisible();

  // The file goes straight to storage, then the server verifies and records it.
  await page.getByLabel("Add file").setInputFiles({
    name: "guide.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes("e2e"),
  });
  await expect(page.getByText("File added.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Files" })).toContainText("guide.pdf");

  // A disguised file is rejected by the server-side check.
  await page.getByLabel("Add file").setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("MZ not a pdf"),
  });
  await expect(page.getByText("The file's content does not match its type.")).toBeVisible();

  await page.getByLabel("Upload cover").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: pngBytes(480, 360),
  });
  await expect(page.getByText("Image added.")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Product published.")).toBeVisible();

  // The storefront shows it on the very next request (updateTag).
  const response = await page.goto(`/en/products/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Owner Made Guide ${suffix}`);
  await expect(main(page)).toContainText("15.00");
  await expect(main(page)).toContainText("56.25"); // 15 × 3.75 SAR
  await expect(main(page)).toContainText("Everything you need to start.");
  const cover = main(page)
    .getByRole("img", { name: `Owner Made Guide ${suffix} ✨` })
    .first();
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  await page.goto(`/en/products?q=${suffix}`);
  await expect(main(page).getByRole("article")).toHaveCount(1);

  // Archiving removes it from the store again.
  await page.goBack();
  await page.goto("/en/admin/products?q=" + suffix);
  await page.getByRole("link", { name: titleEn.replace(" ✨", "") }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Product archived.")).toBeVisible();
  expect((await page.request.get(`/en/products/${slug}`)).status()).toBe(404);
});

test("validation errors are shown next to their fields, in Arabic too", async ({ page }) => {
  await page.goto("/ar/admin/products/new");
  await page.getByLabel("السعر (دولار أمريكي)").fill("12.345");
  await page.getByRole("button", { name: "إنشاء المنتج" }).click();
  await expect(page.getByText("يرجى مراجعة الحقول المحددة.")).toBeVisible();
  await expect(page.getByText("أدخل عنوانًا بلغة واحدة على الأقل.")).toBeVisible();
  await expect(page.getByText("أدخل مبلغًا مثل 12.50.")).toBeVisible();
  // Typed values survive the failed submission.
  await expect(page.getByLabel("السعر (دولار أمريكي)")).toHaveValue("12.345");
});

test("categories can be added, reordered and are shown in the store", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.goto("/en/admin/categories");
  const add = page.getByRole("region", { name: "Add category" });
  await add.getByLabel("Name (Arabic)").fill(`فئة ${suffix}`);
  await add.getByLabel("Name (English)").fill(`Category ${suffix}`);
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Category added.")).toBeVisible();

  const list = page.getByRole("region", { name: "Categories in store order" });
  const items = list.getByRole("listitem");
  await expect(items.last()).toContainText(`Category ${suffix}`);
  await list.getByRole("button", { name: `Move Category ${suffix} up` }).click();
  await expect(page.getByText("Order updated.")).toBeVisible();
  await expect(items.nth((await items.count()) - 2)).toContainText(`Category ${suffix}`);

  const response = await page.goto(`/en/categories/category-${suffix}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Category ${suffix}`);
});

test("customers and guests never see the dashboard", async ({ browser, baseURL }) => {
  const guest = await browser.newContext({ baseURL });
  expect((await guest.request.get("/en/admin/products")).status()).toBe(404);
  expect((await guest.request.get("/en/admin/categories")).status()).toBe(404);
  await guest.close();
});

for (const locale of ["ar", "en"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`dashboard pages have no WCAG 2.2 AA violations · ${locale} · ${scheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of [
        "/admin/products",
        "/admin/products/new",
        "/admin/categories",
        "/admin/settings",
      ]) {
        await page.goto(`/${locale}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(results.violations, path).toEqual([]);
      }
    });
  }
}
