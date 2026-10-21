import type { Page } from "@playwright/test";

/**
 * The store font uses `display: optional` (see components/layout/root-document.tsx): a
 * first view keeps the fallback if a font file takes longer than 100 ms. Screenshots
 * load the page once to cache the fonts, then reload, so they always show the real font.
 */
export async function withCachedFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
}
