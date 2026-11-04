import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { describe, expect, it } from "vitest";
import {
  BLOCKING_RENDER_MARKER,
  HTML_LIMITED_BOTS,
  markUserAgent,
} from "@/lib/proxy/blocking-render";

describe("htmlLimitedBots", () => {
  it("is Next.js' default list plus the marker", () => {
    // Fails when a Next.js upgrade changes its list: copy the new one into blocking-render.ts.
    expect(HTML_LIMITED_BOTS.source).toBe(
      `${HTML_LIMITED_BOT_UA_RE.source}|${BLOCKING_RENDER_MARKER}`,
    );
  });

  it("matches marked page loads and the usual bots, never a plain browser", () => {
    const browser =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
    expect(HTML_LIMITED_BOTS.test(browser)).toBe(false);
    expect(HTML_LIMITED_BOTS.test(markUserAgent(browser))).toBe(true);
    expect(HTML_LIMITED_BOTS.test(markUserAgent(null))).toBe(true);
    expect(HTML_LIMITED_BOTS.test("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
  });
});
