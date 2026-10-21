import { randomUUID } from "node:crypto";

// What the owner may upload and where it is stored (spec §5.1, §10.6, §17.5 §8). Pure
// functions, so the rules are unit-tested without a storage server.

export type UploadPurpose = "file" | "cover" | "gallery";

export const UPLOAD_PURPOSES = ["file", "cover", "gallery"] as const satisfies UploadPurpose[];

/** Product images (cover and gallery): small enough to optimize on the fly. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Product files: one PUT request; S3-compatible stores accept up to 5 GiB. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 100;
export const MAX_IMAGE_SIDE = 10_000;

/** Unconfirmed uploads older than this are deleted by the maintenance task. */
export const PENDING_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PENDING_PREFIX = "pending/";

type Signature =
  | "pdf"
  | "zip"
  | "mp3"
  | "mp4"
  | "wav"
  | "png"
  | "jpeg"
  | "webp"
  | "avif"
  | "ttf"
  | "otf"
  | "woff2"
  | "psd"
  | "7z"
  | "rar";

type FileType = { mimeType: string; signature: Signature | null };

/**
 * Product file types by extension. The browser's own MIME guess is ignored (it is often
 * empty or wrong); the type comes from this list and the file's first bytes must match
 * its signature when the format has one. Files are always served as attachments.
 */
const FILE_TYPES: Record<string, FileType> = {
  pdf: { mimeType: "application/pdf", signature: "pdf" },
  zip: { mimeType: "application/zip", signature: "zip" },
  epub: { mimeType: "application/epub+zip", signature: "zip" },
  docx: {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: "zip",
  },
  xlsx: {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    signature: "zip",
  },
  pptx: {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    signature: "zip",
  },
  "7z": { mimeType: "application/x-7z-compressed", signature: "7z" },
  rar: { mimeType: "application/vnd.rar", signature: "rar" },
  mp3: { mimeType: "audio/mpeg", signature: "mp3" },
  m4a: { mimeType: "audio/mp4", signature: "mp4" },
  wav: { mimeType: "audio/wav", signature: "wav" },
  mp4: { mimeType: "video/mp4", signature: "mp4" },
  png: { mimeType: "image/png", signature: "png" },
  jpg: { mimeType: "image/jpeg", signature: "jpeg" },
  jpeg: { mimeType: "image/jpeg", signature: "jpeg" },
  psd: { mimeType: "image/vnd.adobe.photoshop", signature: "psd" },
  ttf: { mimeType: "font/ttf", signature: "ttf" },
  otf: { mimeType: "font/otf", signature: "otf" },
  woff2: { mimeType: "font/woff2", signature: "woff2" },
  txt: { mimeType: "text/plain", signature: null },
  csv: { mimeType: "text/csv", signature: null },
};

/** Images the storefront shows. SVG is excluded: it can carry scripts. */
const IMAGE_TYPES: Record<string, FileType & { extension: string }> = {
  png: { mimeType: "image/png", signature: "png", extension: "png" },
  jpg: { mimeType: "image/jpeg", signature: "jpeg", extension: "jpg" },
  jpeg: { mimeType: "image/jpeg", signature: "jpeg", extension: "jpg" },
  webp: { mimeType: "image/webp", signature: "webp", extension: "webp" },
  avif: { mimeType: "image/avif", signature: "avif", extension: "avif" },
};

/** Extensions accepted per purpose, for the file picker's `accept` attribute. */
export const ACCEPTED_EXTENSIONS: Record<UploadPurpose, string[]> = {
  file: Object.keys(FILE_TYPES),
  cover: Object.keys(IMAGE_TYPES),
  gallery: Object.keys(IMAGE_TYPES),
};

export function isImagePurpose(purpose: UploadPurpose): boolean {
  return purpose !== "file";
}

export function maxBytesFor(purpose: UploadPurpose): number {
  return isImagePurpose(purpose) ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
}

function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

export type UploadRejection = "unsupportedType" | "tooLarge" | "empty";

export type ResolvedUploadType = {
  mimeType: string;
  signature: Signature | null;
  extension: string;
};

/** The stored type for an upload, decided by the server from the file name's extension. */
export function resolveUploadType(
  purpose: UploadPurpose,
  fileName: string,
): ResolvedUploadType | null {
  const extension = extensionOf(fileName);
  if (isImagePurpose(purpose)) {
    const type = IMAGE_TYPES[extension];
    return type
      ? { mimeType: type.mimeType, signature: type.signature, extension: type.extension }
      : null;
  }
  const type = FILE_TYPES[extension];
  return type ? { ...type, extension } : null;
}

export function checkUploadSize(purpose: UploadPurpose, sizeBytes: number): UploadRejection | null {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return "empty";
  if (sizeBytes > maxBytesFor(purpose)) return "tooLarge";
  return null;
}

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((value, index) => bytes[offset + index] === value);
}

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

/** Number of leading bytes the signature check needs. */
export const SIGNATURE_BYTES = 64;

/** True when the file's first bytes match the format its extension claims. */
export function matchesSignature(signature: Signature | null, bytes: Uint8Array): boolean {
  switch (signature) {
    case null:
      return true;
    case "pdf":
      return startsWith(bytes, ascii("%PDF-"));
    case "zip":
      return (
        startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
      );
    case "7z":
      return startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    case "rar":
      return startsWith(bytes, ascii("Rar!\x1a\x07"));
    case "mp3":
      // An ID3 tag, or an MPEG audio frame sync.
      return (
        startsWith(bytes, ascii("ID3")) || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
      );
    case "mp4":
      return startsWith(bytes, ascii("ftyp"), 4);
    case "avif":
      return (
        startsWith(bytes, ascii("ftyp"), 4) &&
        /^avi[fs]$/.test(String.fromCharCode(...bytes.slice(8, 12)))
      );
    case "wav":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WAVE"), 8);
    case "webp":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "psd":
      return startsWith(bytes, ascii("8BPS"));
    case "ttf":
      return startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || startsWith(bytes, ascii("true"));
    case "otf":
      return startsWith(bytes, ascii("OTTO"));
    case "woff2":
      return startsWith(bytes, ascii("wOF2"));
  }
}

// ── Storage keys: always generated here, never derived from file names ─────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PENDING_KEY = new RegExp(`^pending/${UUID}$`);

export function newPendingKey(): string {
  return `${PENDING_PREFIX}${randomUUID()}`;
}

export function isPendingKey(key: string): boolean {
  return PENDING_KEY.test(key);
}

/** Final key of a product file in the private bucket. */
export function productFileKey(productId: string): string {
  return `products/${productId}/files/${randomUUID()}`;
}

/** Final key of a product image in the public bucket. */
export function productImageKey(productId: string, extension: string): string {
  return `products/${productId}/images/${randomUUID()}.${extension}`;
}

// ── Display file names ──────────────────────────────────────────────────────────────

const MAX_FILE_NAME_LENGTH = 120;
// Control characters, path separators, characters Windows forbids, and bidirectional
// controls that could make "exe.pdf" look like "fdp.exe" in RTL text.
const UNSAFE_FILE_NAME_CHARACTERS = /[\u0000-\u001f\u007f-\u009f/\\:*?"<>|؜‎‏‪-‮⁦-⁩]/g;

/**
 * File name shown to the owner and buyers and used in the download's
 * Content-Disposition. Only for display: storage keys never come from it.
 */
export function sanitizeFileName(fileName: string): string {
  const extension = extensionOf(fileName);
  const cleaned = fileName
    .normalize("NFC")
    .replace(UNSAFE_FILE_NAME_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");

  const characters = Array.from(cleaned);
  if (characters.length <= MAX_FILE_NAME_LENGTH)
    return cleaned || (extension ? `file.${extension}` : "file");

  // Keep the extension when shortening a long name.
  const suffix = extension ? `.${extension}` : "";
  const stem = characters
    .slice(0, MAX_FILE_NAME_LENGTH - suffix.length)
    .join("")
    .trimEnd();
  return `${stem}${suffix}`;
}
