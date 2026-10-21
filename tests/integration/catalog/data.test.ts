import { beforeAll, describe, expect, it } from "vitest";
import { findCategories, findCategoryBySlug } from "@/features/categories/data";
import {
  findCategoryProducts,
  findFeaturedProducts,
  findNewestProducts,
  findProductBySlug,
  findPublishedProductSlugs,
  searchPublishedProducts,
} from "@/features/products/data";
import { parseProductSearch } from "@/features/products/search-params";
import { findPublicStoreSettings } from "@/features/settings/data";
import { getDb } from "@/lib/db";
import { seedDemoCatalog } from "@/scripts/lib/demo-catalog";
import { TEST_CATALOG_EXTRAS } from "../../support/catalog";

const db = getDb();
const search = (params: Record<string, unknown>) =>
  searchPublishedProducts(db, parseProductSearch(params));

beforeAll(async () => {
  await seedDemoCatalog(db, TEST_CATALOG_EXTRAS);
});

describe("storefront visibility", () => {
  it("never returns draft or archived products", async () => {
    const slugs = (await findPublishedProductSlugs(db, 1_000)).map((row) => row.slug);
    expect(slugs).toContain("monthly-budget-planner");
    expect(slugs).toContain("قالب-السيرة-الذاتية");
    expect(slugs).not.toContain("unreleased-course");
    expect(slugs).not.toContain("retired-template");

    expect(await findProductBySlug(db, "unreleased-course")).toBeNull();
    expect(await findProductBySlug(db, "retired-template")).toBeNull();
    expect(await findProductBySlug(db, "does-not-exist")).toBeNull();
  });
});

describe("home page lists", () => {
  it("returns featured products newest first", async () => {
    const featured = await findFeaturedProducts(db, 8);
    expect(featured.map((product) => product.slug)).toEqual([
      "monthly-budget-planner",
      "social-media-design-kit",
      "arabic-typography-guide",
    ]);
  });

  it("returns the newest products up to the limit, with their category", async () => {
    const newest = await findNewestProducts(db, 3);
    expect(newest).toHaveLength(3);
    expect(newest[0]).toMatchObject({
      slug: "monthly-budget-planner",
      priceUsdCents: 1_200,
      cover: null,
      category: { slug: "templates", nameAr: "قوالب", nameEn: "Templates" },
    });
  });
});

describe("product detail", () => {
  it("returns the bilingual detail, including Arabic slugs", async () => {
    const product = await findProductBySlug(db, "arabic-typography-guide");
    expect(product).toMatchObject({
      titleAr: "دليل الخط العربي 📘",
      fixedPriceSarHalalas: 7_400,
      gallery: [],
      cover: null,
    });
    expect(product?.descriptionEn).toContain("PDF");
    expect((await findProductBySlug(db, "قالب-السيرة-الذاتية"))?.titleEn).toBe("");
  });
});

describe("searchPublishedProducts", () => {
  it("paginates published products", async () => {
    const first = await search({});
    expect(first.total).toBe(18);
    expect(first.pageCount).toBe(2);
    expect(first.items).toHaveLength(12);

    const second = await search({ page: "2" });
    expect(second.items).toHaveLength(6);
    expect(second.items.map((item) => item.slug)).not.toContain(first.items[0]?.slug);
  });

  it("finds Arabic and English titles case-insensitively", async () => {
    expect((await search({ q: "BUDGET" })).items.map((item) => item.slug)).toEqual([
      "monthly-budget-planner",
    ]);
    expect((await search({ q: "الخط العربي" })).items.map((item) => item.slug)).toEqual([
      "arabic-typography-guide",
    ]);
    expect((await search({ q: "editable designs" })).total).toBe(1);
  });

  it("treats LIKE wildcards literally", async () => {
    expect((await search({ q: "%" })).total).toBe(0);
    expect((await search({ q: "_" })).total).toBe(0);
  });

  it("filters by category and sorts by price", async () => {
    const ebooks = await search({ category: "ebooks", sort: "price-asc" });
    expect(ebooks.total).toBe(13);
    const prices = ebooks.items.map((item) => item.priceUsdCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const expensive = await search({ sort: "price-desc" });
    expect(expensive.items[0]?.slug).toBe("nextjs-for-beginners");
  });

  it("returns an empty page for unknown categories and queries", async () => {
    expect((await search({ category: "nothing-here" })).total).toBe(0);
    const none = await search({ q: "zzzz-no-match" });
    expect(none).toMatchObject({ items: [], total: 0, pageCount: 1 });
  });
});

describe("categories", () => {
  it("lists categories in order with published product counts", async () => {
    const categories = await findCategories(db);
    const demo = categories.filter((category) =>
      ["templates", "ebooks", "courses", "audio"].includes(category.slug),
    );
    expect(demo.map(({ slug, productCount }) => [slug, productCount])).toEqual([
      ["templates", 4],
      ["ebooks", 13],
      ["courses", 1],
      ["audio", 0],
    ]);
  });

  it("finds a category and its products", async () => {
    const category = await findCategoryBySlug(db, "courses");
    expect(category?.nameAr).toBe("دورات");
    const products = await findCategoryProducts(db, category!.id, 48);
    expect(products.map((product) => product.slug)).toEqual(["nextjs-for-beginners"]);
  });
});

describe("store settings", () => {
  it("returns the exchange rate as an exact decimal string", async () => {
    const settings = await findPublicStoreSettings(db);
    expect(settings.usdToSarRate).toMatch(/^\d+\.\d{6}$/);
  });
});
