import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findProductBySlug } from "@/features/products/data";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { sessionCookieFor } from "../../support/sessions";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createCustomer, ensureOwner } from "../../support/users";

// Owner Server Actions against the real database. Only the Next.js request scope is
// simulated: the cookie header, and updateTag(), which only runs inside Next.js.

let requestCookies = "";
const updatedTags: string[] = [];

vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookies ? { cookie: requestCookies } : {}),
}));
vi.mock("next/cache", () => ({
  updateTag: (tag: string) => updatedTags.push(tag),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const products = await import("@/features/products/actions");
const categories = await import("@/features/categories/actions");
const settings = await import("@/features/settings/actions");

const auth = getAuth();
const db = getDb();
let ownerId = "";
let ownerCookie = "";
let customerCookie = "";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const IDLE = { status: "idle" } as const;
let counter = 0;

function productFields(overrides: Record<string, string> = {}) {
  counter += 1;
  return {
    titleAr: `منتج اختبار ${counter}`,
    titleEn: `Admin Test Product ${counter}`,
    priceUsd: "12.50",
    ...overrides,
  };
}

async function createAsOwner(overrides: Record<string, string> = {}) {
  requestCookies = ownerCookie;
  const result = await products.createProductAction(IDLE, form(productFields(overrides)));
  expect(result).toMatchObject({ status: "success" });
  return result.id!;
}

async function auditRows(entityId: string) {
  return db.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } });
}

/** Next.js signals notFound() by throwing an error with this digest. */
async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

const startedAt = new Date();

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

beforeAll(async () => {
  const owner = await ensureOwner(db);
  ownerId = owner.id;
  ownerCookie = await sessionCookieFor(auth, owner.id);
  const customer = await createCustomer(db);
  customerCookie = await sessionCookieFor(auth, customer.id);
});

beforeEach(() => {
  requestCookies = "";
  updatedTags.length = 0;
});

describe("owner-only enforcement", () => {
  it("rejects guests and customers on every action before touching data", async () => {
    const productId = await createAsOwner();
    const category = await db.category.create({
      data: { slug: `guarded-${Date.now()}`, nameAr: "قسم", nameEn: "Section" },
    });
    const before = { products: await db.product.count(), audits: await db.auditLog.count() };
    updatedTags.length = 0;

    const attempts = [
      () => products.createProductAction(IDLE, form(productFields())),
      () => products.updateProductAction(productId, IDLE, form(productFields())),
      () => products.changeProductStatusAction(productId, "published"),
      () => products.deleteProductAction(productId),
      () =>
        products.requestUploadAction({
          productId,
          purpose: "file",
          fileName: "book.pdf",
          sizeBytes: 100,
        }),
      () => products.confirmUploadAction({ token: "forged" }),
      () => products.removeProductFileAction(productId, productId),
      () => products.removeProductImageAction(productId, productId),
      () => categories.createCategoryAction(IDLE, form({ nameAr: "جديد" })),
      () => categories.updateCategoryAction(category.id, IDLE, form({ nameAr: "تغيير" })),
      () => categories.deleteCategoryAction(category.id),
      () => categories.moveCategoryAction(category.id, "up"),
      () => settings.updateExchangeRateAction(IDLE, form({ usdToSarRate: "9.99" })),
    ];

    for (const cookie of ["", customerCookie]) {
      requestCookies = cookie;
      for (const attempt of attempts) await expectNotFound(attempt());
    }

    expect(await db.product.count()).toBe(before.products);
    expect(await db.auditLog.count()).toBe(before.audits);
    expect(updatedTags).toEqual([]);
  });

  it("rejects a revoked owner session immediately (no cookie-cache grace period)", async () => {
    const cookie = await sessionCookieFor(auth, ownerId);
    const token = decodeURIComponent(cookie.split("=")[1]!).split(".")[0]!;
    await db.session.deleteMany({ where: { token } });
    requestCookies = cookie;
    await expectNotFound(products.createProductAction(IDLE, form(productFields())));
  });
});

describe("products", () => {
  it("creates a draft with an audit row and refreshed catalog caches", async () => {
    requestCookies = ownerCookie;
    const result = await products.createProductAction(
      IDLE,
      form(
        productFields({
          titleEn: "Planner Pro ✨",
          slug: "",
          priceUsd: "١٢٫٥٠",
          fixedPriceSar: "45",
          compareAtPriceUsd: "20",
          featured: "on",
          descriptionEn:
            '<p onclick="steal()">Hello <a href="javascript:alert(1)">x</a></p><script>alert(1)</script>',
        }),
      ),
    );
    expect(result).toMatchObject({ status: "success", message: "productCreated" });

    const product = await db.product.findUniqueOrThrow({ where: { id: result.id } });
    expect(product).toMatchObject({
      slug: "planner-pro",
      status: "draft",
      priceUsdCents: 1250,
      fixedPriceSarHalalas: 4500,
      compareAtPriceUsdCents: 2000,
      featured: true,
      publishedAt: null,
    });
    // Sanitized on write: no handlers, no javascript: URL, no script.
    expect(product.descriptionEn).toBe(
      '<p>Hello <a rel="noopener noreferrer nofollow" target="_blank">x</a></p>',
    );

    const [audit] = await auditRows(product.id);
    expect(audit).toMatchObject({ actorId: ownerId, action: "product.create", entity: "product" });
    expect(audit!.diff).toMatchObject({
      changes: { slug: { from: null, to: "planner-pro" }, priceUsdCents: { from: null, to: 1250 } },
    });
    expect(updatedTags).toEqual(["products", "categories", `product:${product.id}`]);
  });

  it("returns translated field errors instead of saving invalid input", async () => {
    requestCookies = ownerCookie;
    const cases: [Record<string, string>, Record<string, string>][] = [
      [{ titleAr: "", titleEn: "", priceUsd: "5" }, { titleAr: "titleRequired" }],
      [{ titleEn: "X", priceUsd: "12.345" }, { priceUsd: "invalidAmount" }],
      [{ titleEn: "X", priceUsd: "-1" }, { priceUsd: "invalidAmount" }],
      [{ titleEn: "X", priceUsd: "1000000" }, { priceUsd: "amountTooHigh" }],
      [
        { titleEn: "X", priceUsd: "10", compareAtPriceUsd: "10" },
        { compareAtPriceUsd: "compareAtTooLow" },
      ],
      [{ titleEn: "x".repeat(121), priceUsd: "1" }, { titleEn: "tooLong" }],
      [{ titleEn: "✨", priceUsd: "1" }, { slug: "invalidSlug" }],
      [{ titleEn: "X", priceUsd: "1", categoryId: "not-a-uuid" }, { categoryId: "invalid" }],
      [{ titleEn: "X", priceUsd: "1", role: "owner" }, { form: "unrecognized_keys" }],
    ];
    const count = await db.product.count();
    for (const [fields, fieldErrors] of cases) {
      const result = await products.createProductAction(IDLE, form(fields));
      expect(result.status, JSON.stringify(fields)).toBe("error");
      for (const [field, key] of Object.entries(fieldErrors)) {
        if (field === "form") expect(result.fieldErrors?.form).toBeDefined();
        else expect(result.fieldErrors?.[field], JSON.stringify(fields)).toBe(key);
      }
    }
    expect(await db.product.count()).toBe(count);
  });

  it("refuses a duplicate slug and an unknown category", async () => {
    await createAsOwner({ slug: "unique-slug-check" });
    let result = await products.createProductAction(
      IDLE,
      form(productFields({ slug: "Unique Slug Check" })),
    );
    expect(result).toMatchObject({ status: "error", fieldErrors: { slug: "slugTaken" } });

    result = await products.createProductAction(
      IDLE,
      form(productFields({ categoryId: "0199c0de-0000-7000-8000-000000000000" })),
    );
    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { categoryId: "categoryNotFound" },
    });
  });

  it("audits only the fields an update changed", async () => {
    const id = await createAsOwner({ titleEn: "Before Update", slug: "audit-diff-product" });
    const result = await products.updateProductAction(
      id,
      IDLE,
      form({ titleAr: "", titleEn: "After Update", slug: "audit-diff-product", priceUsd: "12.50" }),
    );
    expect(result).toMatchObject({ status: "success" });
    const update = (await auditRows(id)).find((row) => row.action === "product.update");
    expect(update?.diff).toEqual({
      changes: {
        titleAr: { from: expect.any(String), to: "" },
        titleEn: { from: "Before Update", to: "After Update" },
      },
    });
  });

  it("publishes only with a file, and the store sees it right away", async () => {
    const id = await createAsOwner({ slug: "publish-flow-product" });
    expect(await products.changeProductStatusAction(id, "published")).toMatchObject({
      status: "error",
      message: "publishNeedsFile",
    });

    await db.productFile.create({
      data: {
        productId: id,
        storageKey: `products/${id}/files/test`,
        fileName: "book.pdf",
        sizeBytes: 10n,
        checksum: "abc",
        mimeType: "application/pdf",
      },
    });
    updatedTags.length = 0;
    expect(await products.changeProductStatusAction(id, "published")).toMatchObject({
      status: "success",
    });
    expect(updatedTags).toContain(`product:${id}`);

    const published = await db.product.findUniqueOrThrow({ where: { id } });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(await findProductBySlug(db, "publish-flow-product")).toMatchObject({ id });

    // Archive, then re-publish: the first publication date is kept.
    await products.changeProductStatusAction(id, "archived");
    expect(await findProductBySlug(db, "publish-flow-product")).toBeNull();
    await products.changeProductStatusAction(id, "published");
    const republished = await db.product.findUniqueOrThrow({ where: { id } });
    expect(republished.publishedAt).toEqual(published.publishedAt);

    const actions = (await auditRows(id)).map((row) => row.action);
    expect(actions).toEqual([
      "product.create",
      "product.publish",
      "product.archive",
      "product.publish",
    ]);
  });

  it("never moves a sold product back to draft or deletes it", async () => {
    const id = await createAsOwner({ slug: "sold-product" });
    const order = await db.order.create({
      data: {
        customerEmailSnapshot: "buyer@example.test",
        subtotalUsdCents: 1250,
        totalUsdCents: 1250,
        chargedCurrency: "USD",
        chargedAmountMinor: 1250,
        exchangeRateUsed: "3.75",
        locale: "en",
        provider: "fake",
        providerReference: `test-${id}`,
        items: {
          create: {
            productId: id,
            titleAr: "",
            titleEn: "Sold",
            unitPriceUsdCents: 1250,
            unitChargedMinor: 1250,
          },
        },
      },
    });
    expect(order.id).toBeDefined();
    await db.product.update({ where: { id }, data: { status: "archived" } });

    expect(await products.changeProductStatusAction(id, "draft")).toMatchObject({
      message: "hasSales",
    });
    await db.product.update({ where: { id }, data: { status: "draft" } });
    expect(await products.deleteProductAction(id)).toMatchObject({ message: "hasSales" });
    expect(await db.product.findUnique({ where: { id } })).not.toBeNull();
  });

  it("deletes an unsold draft but refuses published products", async () => {
    const id = await createAsOwner();
    await db.product.update({ where: { id }, data: { status: "published" } });
    expect(await products.deleteProductAction(id)).toMatchObject({ message: "deleteOnlyDrafts" });

    await db.product.update({ where: { id }, data: { status: "draft" } });
    expect(await products.deleteProductAction(id)).toMatchObject({ status: "success" });
    expect(await db.product.findUnique({ where: { id } })).toBeNull();
    const actions = (await auditRows(id)).map((row) => row.action);
    expect(actions).toEqual(["product.create", "product.delete"]);
  });

  it("rejects malformed ids without leaking errors", async () => {
    requestCookies = ownerCookie;
    expect(await products.changeProductStatusAction("../etc", "published")).toEqual({
      status: "error",
      message: "invalid",
    });
    const id = await createAsOwner();
    expect(await products.changeProductStatusAction(id, "deleted" as "draft")).toMatchObject({
      status: "error",
    });
  });
});

describe("uploads through Server Actions", () => {
  it("uploads, versions and removes files and images as the owner", async () => {
    const { pdfBytes, pngBytes, putUpload } = await import("../../support/files");
    const id = await createAsOwner();

    const requested = await products.requestUploadAction({
      productId: id,
      purpose: "file",
      fileName: "guide.pdf",
      sizeBytes: pdfBytes().length,
    });
    expect(requested).toMatchObject({ status: "success" });
    expect(await putUpload(requested.upload!.url, pdfBytes(), requested.upload!.contentType)).toBe(
      200,
    );
    updatedTags.length = 0;
    const confirmed = await products.confirmUploadAction({ token: requested.upload!.token });
    expect(confirmed).toMatchObject({ status: "success", message: "fileAdded" });
    expect(updatedTags).toContain(`product:${id}`);

    expect(
      await products.requestUploadAction({
        productId: id,
        purpose: "file",
        fileName: "x.exe",
        sizeBytes: 5,
      }),
    ).toEqual({ status: "error", message: "unsupportedType" });
    expect(
      await products.requestUploadAction({
        productId: "nope",
        purpose: "file",
        fileName: "x.pdf",
        sizeBytes: 5,
      }),
    ).toEqual({ status: "error", message: "invalid" });
    expect(await products.confirmUploadAction({ token: "forged" })).toEqual({
      status: "error",
      message: "uploadExpired",
    });

    const image = await products.requestUploadAction({
      productId: id,
      purpose: "cover",
      fileName: "cover.png",
      sizeBytes: pngBytes(200, 150).length,
    });
    await putUpload(image.upload!.url, pngBytes(200, 150), image.upload!.contentType);
    expect(
      await products.confirmUploadAction({ token: image.upload!.token, altEn: "Cover" }),
    ).toMatchObject({
      message: "imageAdded",
    });

    const cover = await db.productImage.findFirstOrThrow({ where: { productId: id } });
    expect(await products.removeProductImageAction(id, cover.id)).toMatchObject({
      message: "imageRemoved",
    });
    expect(await products.removeProductFileAction(id, confirmed.id!)).toMatchObject({
      message: "fileRemoved",
    });
    expect(await products.removeProductFileAction(id, confirmed.id!)).toMatchObject({
      message: "notFound",
    });
  });
});

describe("categories", () => {
  it("creates, renames, reorders and deletes with audit rows", async () => {
    requestCookies = ownerCookie;
    const first = await categories.createCategoryAction(
      IDLE,
      form({ nameAr: "رسومات", nameEn: "Graphics" }),
    );
    const second = await categories.createCategoryAction(
      IDLE,
      form({ nameAr: "خطوط", nameEn: "Fonts" }),
    );
    expect(first).toMatchObject({ status: "success" });
    expect(updatedTags).toContain("categories");

    const created = await db.category.findUniqueOrThrow({ where: { id: first.id } });
    expect(created.slug).toBe("graphics");

    expect(
      await categories.updateCategoryAction(
        first.id!,
        IDLE,
        form({ nameAr: "رسومات", nameEn: "Illustrations", slug: "graphics" }),
      ),
    ).toMatchObject({ status: "success" });
    expect(
      await categories.createCategoryAction(IDLE, form({ nameAr: "مكرر", slug: "graphics" })),
    ).toMatchObject({
      fieldErrors: { slug: "slugTaken" },
    });
    expect(await categories.createCategoryAction(IDLE, form({ nameAr: "" }))).toMatchObject({
      fieldErrors: { nameAr: "required" },
    });

    await categories.moveCategoryAction(second.id!, "up");
    const ordered = await db.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const ids = ordered.map((category) => category.id);
    expect(ids.indexOf(second.id!)).toBe(ids.indexOf(first.id!) - 1);
    // Renumbered without gaps.
    const orders = (await db.category.findMany({ select: { sortOrder: true } }))
      .map((c) => c.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, index) => index + 1));

    // A category with products cannot be deleted.
    await createAsOwner({ categoryId: first.id! });
    expect(await categories.deleteCategoryAction(first.id!)).toMatchObject({
      message: "categoryInUse",
    });
    expect(await categories.deleteCategoryAction(second.id!)).toMatchObject({ status: "success" });

    const actions = (
      await db.auditLog.findMany({
        where: { entity: "category", entityId: { in: [first.id!, second.id!] } },
      })
    ).map((row) => row.action);
    expect(actions.sort()).toEqual([
      "category.create",
      "category.create",
      "category.delete",
      "category.reorder",
      "category.update",
    ]);
  });
});

describe("exchange rate", () => {
  it("stores a normalized rate and refreshes prices", async () => {
    requestCookies = ownerCookie;
    expect(
      await settings.updateExchangeRateAction(IDLE, form({ usdToSarRate: "٣٫٧٦" })),
    ).toMatchObject({
      status: "success",
    });
    const stored = await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect(stored.usdToSarRate.toFixed(6)).toBe("3.760000");
    expect(updatedTags).toEqual(expect.arrayContaining(["settings", "products"]));

    for (const bad of ["0", "-1", "abc", "3.1234567", "1000"]) {
      expect(
        await settings.updateExchangeRateAction(IDLE, form({ usdToSarRate: bad })),
        bad,
      ).toMatchObject({
        fieldErrors: { usdToSarRate: "invalidRate" },
      });
    }

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "settings.update" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.diff).toMatchObject({ changes: { usdToSarRate: { to: "3.760000" } } });
    await settings.updateExchangeRateAction(IDLE, form({ usdToSarRate: "3.75" }));
  });
});
