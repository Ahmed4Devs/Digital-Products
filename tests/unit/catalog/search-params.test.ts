import { describe, expect, it } from "vitest";
import { parseProductSearch, productSearchQuery } from "@/features/products/search-params";

describe("parseProductSearch", () => {
  it("applies defaults", () => {
    expect(parseProductSearch({})).toEqual({ q: "", category: "", sort: "newest", page: 1 });
  });

  it("normalizes the query and keeps valid values", () => {
    expect(
      parseProductSearch({
        q: "  budget   planner ",
        category: "Templates",
        sort: "price-asc",
        page: "3",
      }),
    ).toEqual({ q: "budget planner", category: "templates", sort: "price-asc", page: 3 });
    expect(parseProductSearch({ category: "قوالب" }).category).toBe("قوالب");
  });

  it("falls back to defaults for invalid values instead of failing", () => {
    expect(
      parseProductSearch({ sort: "drop table", page: "-4", category: "../etc", q: 42 }),
    ).toEqual({ q: "", category: "", sort: "newest", page: 1 });
    expect(parseProductSearch({ page: "99999" }).page).toBe(1);
    expect(parseProductSearch({ page: "2.5" }).page).toBe(1);
  });

  it("takes the first value of repeated parameters and caps the query length", () => {
    expect(parseProductSearch({ sort: ["price-desc", "newest"] }).sort).toBe("price-desc");
    expect(parseProductSearch({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("ignores unknown parameters", () => {
    expect(parseProductSearch({ utm_source: "newsletter" })).toEqual(parseProductSearch({}));
  });
});

describe("productSearchQuery", () => {
  it("omits defaults so URLs stay canonical", () => {
    expect(productSearchQuery({ q: "", category: "", sort: "newest", page: 1 })).toEqual({});
    expect(productSearchQuery({ q: "kit", sort: "price-desc", page: 2 })).toEqual({
      q: "kit",
      sort: "price-desc",
      page: "2",
    });
  });
});
