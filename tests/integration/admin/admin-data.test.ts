import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_PAGE_SIZE,
  findAdminCategories,
  findAdminProducts,
  findCategoryOptions,
  findProductForEdit,
  parseAdminProductSearch,
} from "@/features/products/admin-data";
import { findProductPreview } from "@/features/products/data";
import { getDb } from "@/lib/db";
import { restoreCatalog } from "../../support/catalog-cleanup";

// Owner reads: every status is visible, unlike the storefront reads.

const db = getDb();
const startedAt = new Date();
const marker = `adm${Date.now().toString(36)}`;
let categoryId = "";
const ids: Record<string, string> = {};

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `${marker}-cat`, nameAr: "قسم المالك", nameEn: "Owner Section", sortOrder: 999 },
  });
  categoryId = category.id;
  for (const [key, data] of Object.entries({
    draft: {
      titleEn: `${marker} Alpha draft`,
      titleAr: "ب",
      priceUsdCents: 300,
      status: "draft" as const,
    },
    published: {
      titleEn: `${marker} Beta live`,
      titleAr: "أ",
      priceUsdCents: 100,
      status: "published" as const,
    },
    archived: {
      titleEn: `${marker} Gamma old`,
      titleAr: "ج",
      priceUsdCents: 200,
      status: "archived" as const,
    },
  })) {
    const product = await db.product.create({
      data: {
        ...data,
        slug: `${marker}-${key}`,
        categoryId: key === "published" ? categoryId : null,
      },
    });
    ids[key] = product.id;
  }
  await db.productFile.create({
    data: {
      productId: ids.published!,
      storageKey: `products/${ids.published}/files/${marker}`,
      fileName: "a.pdf",
      sizeBytes: 5n,
      checksum: "x",
      mimeType: "application/pdf",
    },
  });
});

afterAll(async () => {
  await db.productFile.deleteMany({ where: { productId: { in: Object.values(ids) } } });
  await restoreCatalog(db, startedAt);
});

const search = (params: Record<string, string>) =>
  parseAdminProductSearch({ q: marker, ...params });

describe("findAdminProducts", () => {
  it("lists every status, filters and searches", async () => {
    expect((await findAdminProducts(db, search({}), "en")).total).toBe(3);
    const drafts = await findAdminProducts(db, search({ status: "draft" }), "en");
    expect(drafts.rows.map((row) => row.id)).toEqual([ids.draft]);
    const bySlug = await findAdminProducts(db, search({ q: `${marker}-archived` }), "en");
    expect(bySlug.rows.map((row) => row.id)).toEqual([ids.archived]);
    // LIKE wildcards in the search are literal.
    expect((await findAdminProducts(db, search({ q: "%" }), "en")).rows).toEqual([]);
  });

  it("sorts by title in the visitor's language, price and dates", async () => {
    const titles = await findAdminProducts(db, search({ sort: "title", dir: "asc" }), "en");
    expect(titles.rows.map((row) => row.titleEn)).toEqual([
      `${marker} Alpha draft`,
      `${marker} Beta live`,
      `${marker} Gamma old`,
    ]);
    const arabic = await findAdminProducts(db, search({ sort: "title", dir: "asc" }), "ar");
    expect(arabic.rows.map((row) => row.titleAr)).toEqual(["أ", "ب", "ج"]);
    const prices = await findAdminProducts(db, search({ sort: "price", dir: "desc" }), "en");
    expect(prices.rows.map((row) => row.priceUsdCents)).toEqual([300, 200, 100]);
    const created = await findAdminProducts(db, search({ sort: "created", dir: "asc" }), "en");
    expect(created.rows[0]?.id).toBe(ids.draft);
  });

  it("returns categories and current file counts per row", async () => {
    const { rows } = await findAdminProducts(db, search({ status: "published" }), "en");
    expect(rows[0]).toMatchObject({ categoryNameEn: "Owner Section", fileCount: 1 });
  });

  it("paginates", async () => {
    const page = await findAdminProducts(db, parseAdminProductSearch({ page: "999" }), "en");
    expect(page.rows).toEqual([]);
    expect(page.pageCount).toBe(Math.max(1, Math.ceil(page.total / ADMIN_PAGE_SIZE)));
  });
});

describe("edit and preview reads", () => {
  it("loads a product in any status with files and sales", async () => {
    const product = await findProductForEdit(db, ids.published!);
    expect(product).toMatchObject({ salesCount: 0, cover: null, gallery: [] });
    expect(product?.files[0]).toMatchObject({ fileName: "a.pdf", sizeBytes: 5, downloadCount: 0 });
    expect(await findProductForEdit(db, crypto.randomUUID())).toBeNull();
    expect(await findProductPreview(db, ids.draft!)).toMatchObject({ slug: `${marker}-draft` });
  });

  it("lists categories with all their products", async () => {
    const options = await findCategoryOptions(db);
    expect(options.some((option) => option.id === categoryId)).toBe(true);
    const categories = await findAdminCategories(db);
    expect(categories.find((category) => category.id === categoryId)?.productCount).toBe(1);
  });
});
