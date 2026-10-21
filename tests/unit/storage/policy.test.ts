import { describe, expect, it } from "vitest";
import {
  ACCEPTED_EXTENSIONS,
  checkUploadSize,
  isPendingKey,
  matchesSignature,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  newPendingKey,
  productFileKey,
  productImageKey,
  resolveUploadType,
  sanitizeFileName,
} from "@/lib/storage/policy";
import { pdfBytes, pngBytes } from "../../support/files";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string" ? Array.from(value, (c) => c.charCodeAt(0)) : [value],
    ),
  );

describe("resolveUploadType", () => {
  it("decides the type from the extension, case-insensitively", () => {
    expect(resolveUploadType("file", "Book.PDF")).toMatchObject({ mimeType: "application/pdf" });
    expect(resolveUploadType("file", "pack.zip")).toMatchObject({ mimeType: "application/zip" });
    expect(resolveUploadType("file", "notes.txt")).toMatchObject({ signature: null });
    expect(resolveUploadType("cover", "photo.jpeg")).toMatchObject({
      mimeType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("refuses scriptable, executable and unknown types", () => {
    for (const name of ["a.exe", "a.html", "a.svg", "a.js", "a", "a.pdf.exe", "pdf"]) {
      expect(resolveUploadType("file", name), name).toBeNull();
    }
    expect(resolveUploadType("cover", "logo.svg")).toBeNull();
    expect(resolveUploadType("gallery", "book.pdf")).toBeNull();
  });

  it("lists accepted extensions for the file picker", () => {
    expect(ACCEPTED_EXTENSIONS.cover).toEqual(["png", "jpg", "jpeg", "webp", "avif"]);
    expect(ACCEPTED_EXTENSIONS.file).toContain("pdf");
    expect(ACCEPTED_EXTENSIONS.file).not.toContain("svg");
  });
});

describe("checkUploadSize", () => {
  it("enforces per-purpose limits", () => {
    expect(checkUploadSize("file", 1)).toBeNull();
    expect(checkUploadSize("file", MAX_FILE_BYTES)).toBeNull();
    expect(checkUploadSize("file", MAX_FILE_BYTES + 1)).toBe("tooLarge");
    expect(checkUploadSize("cover", MAX_IMAGE_BYTES + 1)).toBe("tooLarge");
    expect(checkUploadSize("gallery", 0)).toBe("empty");
    expect(checkUploadSize("file", -5)).toBe("empty");
    expect(checkUploadSize("file", 1.5)).toBe("empty");
  });
});

describe("matchesSignature", () => {
  it("recognizes each supported format", () => {
    expect(matchesSignature("pdf", pdfBytes())).toBe(true);
    expect(matchesSignature("png", pngBytes(120, 120))).toBe(true);
    expect(matchesSignature("zip", bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true);
    expect(matchesSignature("zip", bytes(0x50, 0x4b, 0x05, 0x06))).toBe(true);
    expect(matchesSignature("7z", bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c))).toBe(true);
    expect(matchesSignature("rar", bytes("Rar!", 0x1a, 0x07, 0x01))).toBe(true);
    expect(matchesSignature("mp3", bytes("ID3", 4))).toBe(true);
    expect(matchesSignature("mp3", bytes(0xff, 0xfb, 0x90))).toBe(true);
    expect(matchesSignature("mp4", bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe(true);
    expect(matchesSignature("avif", bytes(0, 0, 0, 0x1c, "ftypavif"))).toBe(true);
    expect(matchesSignature("avif", bytes(0, 0, 0, 0x1c, "ftypmp42"))).toBe(false);
    expect(matchesSignature("wav", bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe(true);
    expect(matchesSignature("webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(matchesSignature("webp", bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe(false);
    expect(matchesSignature("jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesSignature("psd", bytes("8BPS"))).toBe(true);
    expect(matchesSignature("ttf", bytes(0, 1, 0, 0))).toBe(true);
    expect(matchesSignature("otf", bytes("OTTO"))).toBe(true);
    expect(matchesSignature("woff2", bytes("wOF2"))).toBe(true);
    expect(matchesSignature(null, bytes("anything"))).toBe(true);
  });

  it("rejects disguised content", () => {
    expect(matchesSignature("pdf", bytes("MZ", 0x90))).toBe(false);
    expect(matchesSignature("png", pdfBytes())).toBe(false);
    expect(matchesSignature("zip", bytes())).toBe(false);
    expect(matchesSignature("mp3", bytes(0xff, 0x10))).toBe(false);
  });
});

describe("storage keys", () => {
  it("are generated, never derived from names", () => {
    const pending = newPendingKey();
    expect(isPendingKey(pending)).toBe(true);
    expect(newPendingKey()).not.toBe(pending);
    for (const key of [
      "pending/../products/x",
      "products/x",
      "pending/x",
      `${pending}/x`,
      ` ${pending}`,
    ]) {
      expect(isPendingKey(key), key).toBe(false);
    }
    const productId = "0199c0de-0000-7000-8000-000000000001";
    expect(productFileKey(productId)).toMatch(
      new RegExp(`^products/${productId}/files/[0-9a-f-]{36}$`),
    );
    expect(productImageKey(productId, "webp")).toMatch(/\/images\/[0-9a-f-]{36}\.webp$/);
  });
});

describe("sanitizeFileName", () => {
  it("removes path separators, control and bidi characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeFileName("C:\\Users\\a\\book.pdf")).toBe("CUsersabook.pdf");
    expect(sanitizeFileName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(sanitizeFileName('a<b>c:"d|e?*.pdf')).toBe("abcde.pdf");
    expect(sanitizeFileName("line\nbreak\t.pdf")).toBe("linebreak.pdf");
    expect(sanitizeFileName("  spaced   out  .pdf ")).toBe("spaced out .pdf");
  });

  it("keeps Arabic names and emoji", () => {
    expect(sanitizeFileName("دليل الخط ✨.pdf")).toBe("دليل الخط ✨.pdf");
  });

  it("falls back to a neutral name and keeps the extension when shortening", () => {
    expect(sanitizeFileName("...")).toBe("file");
    expect(sanitizeFileName("\u202E.pdf")).toBe("pdf");
    const long = sanitizeFileName(`${"ك".repeat(300)}.pdf`);
    expect(Array.from(long)).toHaveLength(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});
