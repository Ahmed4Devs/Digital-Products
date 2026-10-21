import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// A small bilingual catalog for local development (`pnpm db:seed:demo`) and automated
// tests. It covers the cases the storefront must handle: emoji in titles, an
// Arabic-only product (English falls back), a fixed SAR price, a compare-at price, a
// free product, an empty category, and draft and archived products that must never
// appear in the store.

export type DemoCategory = { slug: string; nameAr: string; nameEn: string; sortOrder: number };

export type DemoProduct = Omit<Prisma.ProductUncheckedCreateInput, "categoryId" | "id"> & {
  slug: string;
  categorySlug: string;
};

export const DEMO_CATEGORIES: DemoCategory[] = [
  { slug: "templates", nameAr: "قوالب", nameEn: "Templates", sortOrder: 1 },
  { slug: "ebooks", nameAr: "كتب إلكترونية", nameEn: "E-books", sortOrder: 2 },
  { slug: "courses", nameAr: "دورات", nameEn: "Courses", sortOrder: 3 },
  { slug: "audio", nameAr: "ملفات صوتية", nameEn: "Audio", sortOrder: 4 },
];

/** Fixed dates keep "newest first" deterministic. */
function daysAgo(days: number): Date {
  return new Date(Date.UTC(2026, 9, 1) - days * 24 * 60 * 60 * 1000);
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "monthly-budget-planner",
    categorySlug: "templates",
    titleAr: "مخطط الميزانية الشهرية ✨",
    titleEn: "Monthly Budget Planner ✨",
    shortDescriptionAr: "قالب جاهز لتتبّع دخلك ومصاريفك كل شهر.",
    shortDescriptionEn: "A ready-made template to track your income and spending every month.",
    descriptionAr:
      "<h2>ماذا ستحصل؟</h2><ul><li>جداول شهرية وسنوية</li><li>رسوم بيانية تلقائية 📊</li></ul><p>يعمل مع <strong>Google Sheets</strong> و Excel.</p>",
    descriptionEn:
      "<h2>What you get</h2><ul><li>Monthly and yearly sheets</li><li>Automatic charts 📊</li></ul><p>Works with <strong>Google Sheets</strong> and Excel.</p>",
    priceUsdCents: 1_200,
    featured: true,
    status: "published",
    publishedAt: daysAgo(0),
  },
  {
    slug: "social-media-design-kit",
    categorySlug: "templates",
    titleAr: "حزمة تصاميم التواصل الاجتماعي 🎨",
    titleEn: "Social Media Design Kit 🎨",
    shortDescriptionAr: "أكثر من 120 تصميمًا قابلًا للتعديل لمنشوراتك.",
    shortDescriptionEn: "More than 120 editable designs for your posts.",
    descriptionAr: "<p>تصاميم بمقاسات إنستغرام وX ولينكدإن.</p>",
    descriptionEn: "<p>Designs sized for Instagram, X and LinkedIn.</p>",
    priceUsdCents: 2_900,
    compareAtPriceUsdCents: 3_900,
    featured: true,
    status: "published",
    publishedAt: daysAgo(1),
  },
  {
    slug: "arabic-typography-guide",
    categorySlug: "ebooks",
    titleAr: "دليل الخط العربي 📘",
    titleEn: "Arabic Typography Guide 📘",
    shortDescriptionAr: "أساسيات اختيار الخطوط العربية وتنسيقها للشاشات.",
    shortDescriptionEn: "Choosing and setting Arabic typefaces for screens.",
    descriptionAr: "<p>كتاب إلكتروني بصيغة PDF من 140 صفحة.</p>",
    descriptionEn: "<p>A 140-page PDF e-book.</p>",
    priceUsdCents: 1_999,
    // Owner-set SAR price instead of the converted 74.96.
    fixedPriceSarHalalas: 7_400,
    featured: true,
    status: "published",
    publishedAt: daysAgo(2),
  },
  {
    slug: "pricing-freelance-work",
    categorySlug: "ebooks",
    titleAr: "تسعير العمل الحر",
    titleEn: "Pricing Your Freelance Work",
    shortDescriptionAr: "طريقة عملية لتسعير مشاريعك بثقة.",
    shortDescriptionEn: "A practical method to price your projects with confidence.",
    descriptionAr: "<p>يتضمن جدول حساب جاهزًا.</p>",
    descriptionEn: "<p>Includes a ready-made calculator sheet.</p>",
    priceUsdCents: 950,
    status: "published",
    publishedAt: daysAgo(3),
  },
  {
    slug: "nextjs-for-beginners",
    categorySlug: "courses",
    titleAr: "دورة Next.js للمبتدئين 🚀",
    titleEn: "Next.js for Beginners 🚀",
    shortDescriptionAr: "ابنِ أول موقع لك خطوة بخطوة.",
    shortDescriptionEn: "Build your first site step by step.",
    descriptionAr: "<p>12 درسًا بالفيديو مع ملفات المشروع.</p>",
    descriptionEn: "<p>12 video lessons with project files.</p>",
    priceUsdCents: 4_900,
    status: "published",
    publishedAt: daysAgo(4),
  },
  {
    slug: "قالب-السيرة-الذاتية",
    categorySlug: "templates",
    titleAr: "قالب السيرة الذاتية",
    // No English text: English pages fall back to Arabic (spec §7.1).
    titleEn: "",
    shortDescriptionAr: "سيرة ذاتية أنيقة بصيغة Word.",
    shortDescriptionEn: "",
    descriptionAr: "<p>سهل التعديل ومتوافق مع أنظمة التوظيف.</p>",
    descriptionEn: "",
    priceUsdCents: 500,
    status: "published",
    publishedAt: daysAgo(5),
  },
  {
    slug: "free-wallpapers",
    categorySlug: "templates",
    titleAr: "خلفيات مجانية",
    titleEn: "Free Wallpapers",
    shortDescriptionAr: "مجموعة خلفيات للهاتف وسطح المكتب.",
    shortDescriptionEn: "Wallpapers for phone and desktop.",
    descriptionAr: "<p>هدية لزوار المتجر.</p>",
    descriptionEn: "<p>A gift for our visitors.</p>",
    priceUsdCents: 0,
    status: "published",
    publishedAt: daysAgo(6),
  },
  {
    slug: "unreleased-course",
    categorySlug: "courses",
    titleAr: "دورة قيد الإعداد",
    titleEn: "Unreleased Course",
    priceUsdCents: 9_900,
    status: "draft",
  },
  {
    slug: "retired-template",
    categorySlug: "templates",
    titleAr: "قالب مؤرشف",
    titleEn: "Retired Template",
    priceUsdCents: 700,
    status: "archived",
    publishedAt: daysAgo(30),
  },
];

/** Creates or updates the demo catalog by slug. Safe to run repeatedly. */
export async function seedDemoCatalog(
  db: PrismaClient,
  extraProducts: DemoProduct[] = [],
): Promise<{ categories: number; products: number }> {
  const categoryIds = new Map<string, string>();
  for (const category of DEMO_CATEGORIES) {
    const { id } = await db.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
      select: { id: true },
    });
    categoryIds.set(category.slug, id);
  }

  const products = [...DEMO_PRODUCTS, ...extraProducts];
  for (const { categorySlug, ...product } of products) {
    const data = { ...product, categoryId: categoryIds.get(categorySlug) ?? null };
    await db.product.upsert({ where: { slug: product.slug }, update: data, create: data });
  }
  return { categories: DEMO_CATEGORIES.length, products: products.length };
}
