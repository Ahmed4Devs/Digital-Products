import { describe, expect, it } from "vitest";
import { categoryFormSchema } from "@/features/categories/schemas";
import { adminProductSearchQuery, parseAdminProductSearch } from "@/features/products/admin-data";
import { productFormSchema } from "@/features/products/schemas";
import { exchangeRateSchema } from "@/features/settings/schemas";

const issueKeys = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );

describe("productFormSchema", () => {
  it("parses a complete form into minor units and nulls", () => {
    const parsed = productFormSchema.parse({
      titleAr: "  دليل الخط  ",
      titleEn: "",
      priceUsd: "19.99",
      fixedPriceSar: "",
      compareAtPriceUsd: "",
      categoryId: "",
    });
    expect(parsed).toMatchObject({
      slug: "دليل-الخط",
      titleAr: "دليل الخط",
      priceUsd: 1999,
      fixedPriceSar: null,
      compareAtPriceUsd: null,
      categoryId: null,
      featured: false,
    });
  });

  it("prefers an explicit slug, then the English title", () => {
    expect(
      productFormSchema.parse({ titleAr: "أ", titleEn: "Hello World", priceUsd: "1" }).slug,
    ).toBe("hello-world");
    expect(
      productFormSchema.parse({ titleEn: "Hello", slug: "My Custom Slug!", priceUsd: "1" }).slug,
    ).toBe("my-custom-slug");
  });

  it("counts emoji as one character", () => {
    const title = `${"👨‍👩‍👧‍👦".repeat(120)}`;
    expect(productFormSchema.safeParse({ titleAr: title, slug: "x", priceUsd: "1" }).success).toBe(
      true,
    );
    expect(
      issueKeys(productFormSchema.safeParse({ titleAr: `${title}x`, slug: "x", priceUsd: "1" })),
    ).toEqual({
      titleAr: "tooLong",
    });
  });

  it("reports cross-field problems together with field problems", () => {
    expect(
      issueKeys(productFormSchema.safeParse({ titleAr: "", titleEn: "", priceUsd: "1.234" })),
    ).toEqual({
      priceUsd: "invalidAmount",
      titleAr: "titleRequired",
    });
    expect(
      issueKeys(
        productFormSchema.safeParse({
          titleEn: "",
          priceUsd: "5",
          compareAtPriceUsd: "4",
          fixedPriceSar: "x",
        }),
      ),
    ).toEqual({
      fixedPriceSar: "invalidAmount",
      titleAr: "titleRequired",
      compareAtPriceUsd: "compareAtTooLow",
    });
  });

  it("rejects missing prices and unknown fields", () => {
    expect(issueKeys(productFormSchema.safeParse({ titleEn: "A" }))).toEqual({
      priceUsd: "required",
    });
    expect(
      productFormSchema.safeParse({ titleEn: "A", priceUsd: "1", status: "published" }).success,
    ).toBe(false);
  });
});

describe("categoryFormSchema", () => {
  it("requires an Arabic name and derives the slug", () => {
    expect(categoryFormSchema.parse({ nameAr: "قوالب", nameEn: "Templates" }).slug).toBe(
      "templates",
    );
    expect(categoryFormSchema.parse({ nameAr: "قوالب" }).slug).toBe("قوالب");
    expect(issueKeys(categoryFormSchema.safeParse({ nameAr: " ", nameEn: "X" }))).toEqual({
      nameAr: "required",
    });
    expect(issueKeys(categoryFormSchema.safeParse({ nameAr: "🎨" }))).toEqual({
      slug: "invalidSlug",
    });
  });
});

describe("exchangeRateSchema", () => {
  it("normalizes valid rates and rejects the rest", () => {
    expect(exchangeRateSchema.parse({ usdToSarRate: "3.75" })).toEqual({
      usdToSarRate: "3.750000",
    });
    for (const bad of ["0", "101", "x", "3.1234567"]) {
      expect(exchangeRateSchema.safeParse({ usdToSarRate: bad }).success, bad).toBe(false);
    }
  });
});

describe("admin product search", () => {
  it("falls back to defaults for invalid values", () => {
    expect(
      parseAdminProductSearch({
        status: "deleted",
        sort: "evil",
        dir: "up",
        page: "-1",
        q: ["  a  b ", "c"],
      }),
    ).toEqual({
      status: "all",
      sort: "updated",
      dir: "desc",
      page: 1,
      q: "a b",
    });
  });

  it("leaves defaults out of links", () => {
    expect(adminProductSearchQuery(parseAdminProductSearch({}))).toEqual({});
    expect(
      adminProductSearchQuery({ status: "draft", sort: "price", dir: "asc", page: 3, q: "x" }),
    ).toEqual({
      status: "draft",
      sort: "price",
      dir: "asc",
      page: "3",
      q: "x",
    });
  });
});
