import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "@/features/downloads/service";

describe("attachmentDisposition", () => {
  it("always says attachment and keeps the exact UTF-8 name", () => {
    expect(attachmentDisposition("guide.pdf")).toBe(
      `attachment; filename="guide.pdf"; filename*=UTF-8''guide.pdf`,
    );
    expect(attachmentDisposition("دليل.pdf")).toBe(
      `attachment; filename="____.pdf"; filename*=UTF-8''%D8%AF%D9%84%D9%8A%D9%84.pdf`,
    );
  });

  it("cannot be broken out of with quotes or header characters", () => {
    const header = attachmentDisposition('evil"; filename="x.html\\.pdf');
    expect(header.startsWith('attachment; filename="evil_; filename=_x.html_.pdf"; ')).toBe(true);
    expect(header).toContain("filename*=UTF-8''evil%22%3B%20filename%3D%22x.html%5C.pdf");
    expect(attachmentDisposition("a'(b)*.pdf")).toContain("a%27%28b%29%2A.pdf");
    expect(attachmentDisposition("ملف")).toContain('filename="___"');
  });
});
