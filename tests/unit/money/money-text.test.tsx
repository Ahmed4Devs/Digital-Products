import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MoneyText } from "@/components/shared/money-text";

describe("MoneyText", () => {
  it("isolates the currency symbol in Arabic and keeps Latin digits", () => {
    const html = renderToStaticMarkup(<MoneyText locale="ar" amountMinor={2_900} currency="USD" />);
    expect(html).toContain("<bdi>US$</bdi>");
    expect(html).toContain("29.00");
    expect(html).not.toMatch(/[٠-٩]/);
  });

  it("keeps the Arabic riyal symbol in its own right-to-left run", () => {
    const html = renderToStaticMarkup(
      <MoneyText locale="ar" amountMinor={10_875} currency="SAR" />,
    );
    expect(html).toContain("<bdi>ر.س.");
    expect(html).toContain("108.75");
  });

  it("formats SAR from halalas", () => {
    const html = renderToStaticMarkup(
      <MoneyText locale="en" amountMinor={10_875} currency="SAR" />,
    );
    // Intl separates the code with a no-break space.
    expect(html).toBe("<span><bdi>SAR</bdi>\u00a0108.75</span>");
  });
});
