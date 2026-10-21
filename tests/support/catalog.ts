import type { DemoProduct } from "@/scripts/lib/demo-catalog";

/** Extra published e-books (older than the demo products) so listings have two pages. */
export const FILLER_PRODUCTS: DemoProduct[] = Array.from({ length: 10 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    slug: `filler-ebook-${number}`,
    categorySlug: "ebooks",
    titleAr: `كتاب تجريبي ${number}`,
    titleEn: `Filler E-book ${number}`,
    shortDescriptionAr: "كتاب لاختبار التصفح.",
    shortDescriptionEn: "A book for testing pagination.",
    priceUsdCents: 100 + index,
    status: "published",
    publishedAt: new Date(Date.UTC(2026, 0, 1 + index)),
  };
});

/**
 * Proves the render-side sanitizer: the stored description holds markup an attacker
 * might slip past the editor. None of it may execute.
 */
export const XSS_PROBE_PRODUCT: DemoProduct = {
  slug: "sanitizer-probe",
  categorySlug: "ebooks",
  titleAr: "منتج فحص التعقيم",
  titleEn: "Sanitizer Probe",
  shortDescriptionAr: "اختبار.",
  shortDescriptionEn: "Test.",
  descriptionAr: "<p>نص آمن</p><script>window.__xss = 1</script>",
  descriptionEn:
    '<p>Safe text ✨</p><script>window.__xss = 1</script><img src="x" onerror="window.__xss = 2"><a href="javascript:window.__xss = 3">link</a><p onclick="window.__xss = 4">click</p>',
  priceUsdCents: 300,
  status: "published",
  publishedAt: new Date(Date.UTC(2025, 0, 1)),
};

export const TEST_CATALOG_EXTRAS = [...FILLER_PRODUCTS, XSS_PROBE_PRODUCT];
