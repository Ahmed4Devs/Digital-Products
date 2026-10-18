import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmojiText } from "@/components/shared/emoji-text";

describe("<EmojiText>", () => {
  it("renders plain text without images", () => {
    expect(renderToStaticMarkup(<EmojiText text="منتجات رقمية" />)).toBe("منتجات رقمية");
  });

  it("replaces emoji with lazy, inline Twemoji images that keep the emoji as alt text", () => {
    const html = renderToStaticMarkup(<EmojiText text="Hello 👋 world" />);

    expect(html).toMatch(/^Hello <img /);
    expect(html).toMatch(/ world$/);
    expect(html).toContain('src="/twemoji/1f44b.svg"');
    expect(html).toContain('alt="👋"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("size-[1em]");
  });

  it("escapes surrounding text instead of injecting HTML", () => {
    const html = renderToStaticMarkup(<EmojiText text={'<b onclick="x">✨</b>'} />);
    expect(html).not.toContain("<b");
    expect(html).toContain("&lt;b onclick=&quot;x&quot;&gt;");
  });
});
