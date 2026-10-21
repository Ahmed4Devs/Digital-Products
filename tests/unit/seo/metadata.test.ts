import { describe, expect, it } from "vitest";
import { languageAlternates, localizedPath, pageMetadata } from "@/lib/seo/metadata";
import { decodeSlugParam } from "@/lib/seo/params";

describe("localizedPath", () => {
  it("prefixes the locale", () => {
    expect(localizedPath("ar", "/")).toBe("/ar");
    expect(localizedPath("en", "/products/kit")).toBe("/en/products/kit");
  });
});

describe("languageAlternates", () => {
  it("lists every locale plus an unprefixed x-default", () => {
    expect(languageAlternates("/products")).toEqual({
      ar: "/ar/products",
      en: "/en/products",
      "x-default": "/products",
    });
    expect(languageAlternates("/")["x-default"]).toBe("/");
  });
});

describe("pageMetadata", () => {
  it("builds canonical, alternates and Open Graph data for the locale", () => {
    const metadata = pageMetadata({
      locale: "ar",
      path: "/products/kit",
      title: "حزمة",
      description: "وصف",
      siteName: "المتجر الرقمي",
    });

    expect(metadata.alternates).toEqual({
      canonical: "/ar/products/kit",
      languages: { ar: "/ar/products/kit", en: "/en/products/kit", "x-default": "/products/kit" },
    });
    expect(metadata.openGraph).toMatchObject({
      title: "حزمة",
      url: "/ar/products/kit",
      locale: "ar_SA",
      alternateLocale: ["en_US"],
      siteName: "المتجر الرقمي",
    });
    expect(metadata.twitter).toEqual({ card: "summary" });
  });

  it("uses a large card when there is an image", () => {
    const metadata = pageMetadata({
      locale: "en",
      path: "/",
      title: { absolute: "Store" },
      description: "Digital products",
      openGraphTitle: "Welcome",
      images: [{ url: "https://cdn.example.com/a.png", width: 1200, height: 630, alt: "A" }],
    });
    expect(metadata.openGraph).toMatchObject({ title: "Welcome", locale: "en_US" });
    expect(metadata.twitter).toEqual({ card: "summary_large_image" });
  });
});

describe("decodeSlugParam", () => {
  it("decodes percent-encoded Arabic slugs once", () => {
    expect(decodeSlugParam(encodeURIComponent("قالب-السيرة"))).toBe("قالب-السيرة");
    expect(decodeSlugParam("plain-slug")).toBe("plain-slug");
  });

  it("returns malformed input unchanged", () => {
    expect(decodeSlugParam("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
