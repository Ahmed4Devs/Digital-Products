import { beforeEach, describe, expect, it, vi } from "vitest";

const rootLocale = vi.fn<() => Promise<string>>();

// getRequestConfig is an identity wrapper outside a Next.js request; the real function is
// what we test. notFound throws like Next.js does.
vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock("next/root-params", () => ({ locale: () => rootLocale() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: requestConfig } = (await import("@/i18n/request")) as unknown as {
  default: (params: { locale?: string }) => Promise<Record<string, unknown>>;
};
const { formats, TIME_ZONE } = await import("@/i18n/formats");
const { messagesByLocale } = await import("@/messages");

describe("i18n request config", () => {
  beforeEach(() => rootLocale.mockReset());

  it("reads the locale from the [locale] root param", async () => {
    rootLocale.mockResolvedValue("en");
    const config = await requestConfig({});
    expect(config).toEqual({
      locale: "en",
      messages: messagesByLocale.en,
      formats,
      timeZone: TIME_ZONE,
    });
  });

  it("prefers an explicitly requested locale", async () => {
    const config = await requestConfig({ locale: "ar" });
    expect(config.locale).toBe("ar");
    expect(rootLocale).not.toHaveBeenCalled();
  });

  it("responds 404 for unsupported locales", async () => {
    rootLocale.mockResolvedValue("fr");
    await expect(requestConfig({})).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requestConfig({ locale: "de" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
