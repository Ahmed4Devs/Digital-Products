import { describe, expect, it } from "vitest";
import { renderRichTextHtml } from "@/lib/rich-text/render";
import { sanitizeRichText } from "@/lib/rich-text/sanitize";

describe("sanitizeRichText", () => {
  it("keeps the allowed formatting", () => {
    const html =
      '<h2>Title</h2><p dir="rtl">نص <strong>غامق</strong> و<em>مائل</em></p><ul><li>one</li></ul>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it.each([
    ["script tags and their content", "<p>ok</p><script>alert(1)</script>", "<p>ok</p>"],
    ["event handlers", '<p onclick="alert(1)">x</p>', "<p>x</p>"],
    [
      "javascript: URLs",
      '<a href="javascript:alert(1)">x</a>',
      '<a rel="noopener noreferrer nofollow" target="_blank">x</a>',
    ],
    [
      "data: URLs",
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      '<a rel="noopener noreferrer nofollow" target="_blank">x</a>',
    ],
    [
      "entity-encoded schemes",
      '<a href="jav&#x61;script:alert(1)">x</a>',
      '<a rel="noopener noreferrer nofollow" target="_blank">x</a>',
    ],
    [
      "images and iframes",
      '<img src=x onerror="alert(1)"><iframe src="https://evil.example"></iframe>',
      "",
    ],
    ["styles and classes", '<p style="color:red" class="x">x</p><style>p{}</style>', "<p>x</p>"],
    ["svg payloads", "<svg><script>alert(1)</script></svg>", ""],
  ])("removes %s", (_label, input, expected) => {
    expect(sanitizeRichText(input)).toBe(expected);
  });

  it("drops direction values outside ltr, rtl and auto", () => {
    const html = sanitizeRichText('<p dir="javascript:alert(1)">x</p><p dir="rtl">y</p>');
    expect(html).not.toContain("javascript");
    expect(html).toContain('<p dir="rtl">y</p>');
  });

  it("forces safe attributes on allowed links", () => {
    const html = sanitizeRichText(
      '<a href="https://example.com" target="_self" rel="opener">x</a>',
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("_self");
    expect(html).not.toContain('"opener"');
  });

  it("escapes text that looks like markup", () => {
    expect(sanitizeRichText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });
});

describe("renderRichTextHtml", () => {
  it("renders emoji as Twemoji images with the emoji as alt text", () => {
    const html = renderRichTextHtml("<p>✨ جاهز 🚀 now 👍🏽</p>");
    expect(html).toContain('src="/twemoji/2728.svg" alt="✨"');
    expect(html).toContain('src="/twemoji/1f680.svg" alt="🚀"');
    expect(html).toContain('src="/twemoji/1f44d-1f3fd.svg" alt="👍🏽"');
    expect(html).toContain(" جاهز ");
  });

  it("still sanitizes, and never turns escaped text into markup", () => {
    const html = renderRichTextHtml(
      '<p>&lt;img src=x onerror=alert(1)&gt; ✨</p><img src=x onerror="alert(1)">',
    );
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).not.toContain('onerror="');
  });
});
