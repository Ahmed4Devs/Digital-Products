import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publicConfig() caches its result, so each test loads a fresh module.
async function load() {
  vi.resetModules();
  return import("@/lib/env/public");
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://store.example.com");
  vi.stubEnv("S3_PUBLIC_BASE_URL", "https://cdn.example.com/media/");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public build-time config", () => {
  it("exposes the store URL", async () => {
    const { appUrl } = await load();
    expect(appUrl().toString()).toBe("https://store.example.com/");
  });

  it("builds image URLs from the public bucket, encoding each segment", async () => {
    const { publicImageUrl } = await load();
    expect(publicImageUrl("products/abc/cover image.png")).toBe(
      "https://cdn.example.com/media/products/abc/cover%20image.png",
    );
  });

  it("returns no image URL when no public bucket is configured", async () => {
    vi.stubEnv("S3_PUBLIC_BASE_URL", "");
    const { publicImageUrl } = await load();
    expect(publicImageUrl("products/abc/cover.png")).toBeNull();
  });

  it("rejects an invalid store URL", async () => {
    vi.stubEnv("APP_URL", "not a url");
    const { publicConfig } = await load();
    expect(() => publicConfig()).toThrow();
  });
});
