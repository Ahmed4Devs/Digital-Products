import "server-only";
import { imageSize } from "image-size";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import type { Storage } from "@/lib/storage/client";
import {
  checkUploadSize,
  isImagePurpose,
  matchesSignature,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  MIN_IMAGE_SIDE,
  newPendingKey,
  productFileKey,
  productImageKey,
  resolveUploadType,
  sanitizeFileName,
  SIGNATURE_BYTES,
  PRODUCT_UPLOAD_PURPOSES,
} from "@/lib/storage/policy";
import {
  signUploadTicket,
  UPLOAD_URL_TTL_SECONDS,
  verifyUploadTicket,
  type UploadTicket,
} from "@/lib/storage/upload-token";

// Owner uploads (spec §17.5 §8): the browser PUTs straight to storage under a
// server-generated `pending/` key; on confirmation the server reads the object's real
// size, type and checksum from storage, checks them, and only then moves it to its final
// key and records it.

export const MAX_GALLERY_IMAGES = 8;

export const uploadRequestSchema = z.strictObject({
  productId: z.uuid(),
  purpose: z.enum(PRODUCT_UPLOAD_PURPOSES),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int(),
  replacesFileId: z.uuid().nullable().default(null),
});

export type UploadRequest = z.input<typeof uploadRequestSchema>;

export type IssuedUpload = {
  url: string;
  token: string;
  /** Must be sent as the PUT's Content-Type: it is part of the signature. */
  contentType: string;
};

export async function requestUpload(
  db: PrismaClient,
  storage: Storage,
  secret: string,
  request: UploadRequest,
  now: Date = new Date(),
): Promise<IssuedUpload> {
  const input = uploadRequestSchema.parse(request);

  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: { id: true, _count: { select: { images: { where: { kind: "gallery" } } } } },
  });
  if (!product) throw new ActionError("notFound");
  if (input.purpose === "gallery" && product._count.images >= MAX_GALLERY_IMAGES) {
    throw new ActionError("galleryFull");
  }
  if (input.replacesFileId !== null) {
    if (input.purpose !== "file") throw new ActionError("invalid");
    const replaced = await db.productFile.findFirst({
      where: { id: input.replacesFileId, productId: input.productId, supersededAt: null },
      select: { id: true },
    });
    if (!replaced) throw new ActionError("notFound");
  }

  const type = resolveUploadType(input.purpose, input.fileName);
  if (!type) throw new ActionError("unsupportedType");
  const sizeProblem = checkUploadSize(input.purpose, input.sizeBytes);
  if (sizeProblem) throw new ActionError(sizeProblem);

  const ticket: UploadTicket = {
    key: newPendingKey(),
    productId: input.productId,
    purpose: input.purpose,
    mimeType: type.mimeType,
    fileName: sanitizeFileName(input.fileName),
    declaredBytes: input.sizeBytes,
    replacesFileId: input.replacesFileId,
    expiresAt: Math.floor(now.getTime() / 1000) + UPLOAD_URL_TTL_SECONDS,
  };
  const url = await storage.presignUpload({
    key: ticket.key,
    contentType: ticket.mimeType,
    contentLength: ticket.declaredBytes,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });
  return { url, token: signUploadTicket(secret, ticket), contentType: ticket.mimeType };
}

const IMAGE_SIZE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

/** Real dimensions of an uploaded image, or the reason it is refused. */
export function inspectImage(
  bytes: Uint8Array,
  expectedMimeType: string,
  limits: { minSide: number } = { minSide: MIN_IMAGE_SIDE },
): { width: number; height: number } {
  let size: ReturnType<typeof imageSize>;
  try {
    size = imageSize(bytes);
  } catch {
    throw new ActionError("invalidImage");
  }
  if (!size.type || IMAGE_SIZE_TYPES[size.type] !== expectedMimeType) {
    throw new ActionError("invalidImage");
  }
  // EXIF orientations 5–8 rotate the picture by 90°, swapping its displayed sides.
  const rotated = (size.orientation ?? 1) >= 5;
  const width = rotated ? size.height : size.width;
  const height = rotated ? size.width : size.height;
  const sides = [width, height];
  if (sides.some((side) => side < limits.minSide)) throw new ActionError("imageTooSmall");
  if (sides.some((side) => side > MAX_IMAGE_SIDE)) throw new ActionError("imageTooLarge");
  return { width, height };
}

export const confirmUploadSchema = z.strictObject({
  token: z.string().min(1).max(4_096),
  altAr: z.string().trim().max(200).default(""),
  altEn: z.string().trim().max(200).default(""),
});

type ProductTicket = UploadTicket & { productId: string };

export type ConfirmedUpload =
  | { kind: "image"; id: string; productId: string }
  | { kind: "file"; id: string; productId: string };

export async function confirmUpload(
  db: PrismaClient,
  storage: Storage,
  secret: string,
  actorId: string,
  confirmation: z.input<typeof confirmUploadSchema>,
  now: Date = new Date(),
): Promise<ConfirmedUpload> {
  const input = confirmUploadSchema.parse(confirmation);
  const verified = verifyUploadTicket(secret, input.token, now);
  if (!verified) throw new ActionError("uploadExpired");
  // Logo tickets are confirmed by features/settings/logos.ts, never here.
  if (verified.productId === null) throw new ActionError("invalid");
  const ticket: ProductTicket = { ...verified, productId: verified.productId };

  const stored = await storage.head("private", ticket.key);
  if (!stored) throw new ActionError("uploadMissing");

  const discardPending = () => storage.delete("private", ticket.key).catch(() => undefined);
  let finalKey: { bucket: "private" | "public"; key: string } | null = null;
  try {
    // Everything below is read from storage, never taken from the browser.
    const sizeProblem = checkUploadSize(ticket.purpose, stored.sizeBytes);
    if (sizeProblem) throw new ActionError(sizeProblem);
    if (stored.sizeBytes !== ticket.declaredBytes || stored.contentType !== ticket.mimeType) {
      throw new ActionError("uploadMismatch");
    }
    const type = resolveUploadType(ticket.purpose, ticket.fileName);
    if (!type || type.mimeType !== ticket.mimeType) throw new ActionError("unsupportedType");

    if (isImagePurpose(ticket.purpose)) {
      const bytes = await storage.readStart("private", ticket.key, MAX_IMAGE_BYTES);
      if (!matchesSignature(type.signature, bytes)) throw new ActionError("invalidImage");
      const { width, height } = inspectImage(bytes, type.mimeType);

      finalKey = { bucket: "public", key: productImageKey(ticket.productId, type.extension) };
      await storage.copy({
        from: { bucket: "private", key: ticket.key },
        to: finalKey,
        contentType: type.mimeType,
        // Keys are never reused, so images can be cached forever.
        cacheControl: "public, max-age=31536000, immutable",
      });
      const result = await saveImage(db, actorId, ticket, {
        storageKey: finalKey.key,
        width,
        height,
        altAr: input.altAr,
        altEn: input.altEn,
      });
      await discardPending();
      if (result.replacedKey)
        await storage.delete("public", result.replacedKey).catch(() => undefined);
      return { kind: "image", id: result.id, productId: ticket.productId };
    }

    const head = await storage.readStart("private", ticket.key, SIGNATURE_BYTES);
    if (!matchesSignature(type.signature, head)) throw new ActionError("signatureMismatch");

    finalKey = { bucket: "private", key: productFileKey(ticket.productId) };
    const copied = await storage.copy({
      from: { bucket: "private", key: ticket.key },
      to: finalKey,
      contentType: type.mimeType,
    });
    const id = await saveFile(db, actorId, ticket, {
      storageKey: finalKey.key,
      sizeBytes: copied.sizeBytes,
      checksum: copied.etag || stored.etag,
      mimeType: type.mimeType,
    });
    await discardPending();
    return { kind: "file", id, productId: ticket.productId };
  } catch (error) {
    await discardPending();
    if (finalKey) await storage.delete(finalKey.bucket, finalKey.key).catch(() => undefined);
    throw error;
  }
}

async function saveImage(
  db: PrismaClient,
  actorId: string,
  ticket: ProductTicket,
  image: { storageKey: string; width: number; height: number; altAr: string; altEn: string },
): Promise<{ id: string; replacedKey: string | null }> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: ticket.productId },
      select: { id: true },
    });
    if (!product) throw new ActionError("notFound");

    let replacedKey: string | null = null;
    let sortOrder = 0;
    if (ticket.purpose === "cover") {
      // One cover per product (partial unique index): the new one replaces the old.
      const previous = await tx.productImage.findFirst({
        where: { productId: ticket.productId, kind: "cover" },
        select: { id: true, storageKey: true },
      });
      if (previous) {
        await tx.productImage.delete({ where: { id: previous.id } });
        replacedKey = previous.storageKey;
      }
    } else {
      const gallery = await tx.productImage.aggregate({
        where: { productId: ticket.productId, kind: "gallery" },
        _count: true,
        _max: { sortOrder: true },
      });
      if (gallery._count >= MAX_GALLERY_IMAGES) throw new ActionError("galleryFull");
      sortOrder = (gallery._max.sortOrder ?? -1) + 1;
    }

    const created = await tx.productImage.create({
      data: {
        productId: ticket.productId,
        kind: ticket.purpose === "cover" ? "cover" : "gallery",
        sortOrder,
        ...image,
      },
      select: { id: true, kind: true, storageKey: true, width: true, height: true },
    });
    await recordAudit(tx, {
      actorId,
      action: "product_image.add",
      entity: "product",
      entityId: ticket.productId,
      after: { ...created, replacedKey },
    });
    return { id: created.id, replacedKey };
  });
}

async function saveFile(
  db: PrismaClient,
  actorId: string,
  ticket: ProductTicket,
  file: { storageKey: string; sizeBytes: number; checksum: string; mimeType: string },
): Promise<string> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: ticket.productId },
      select: { id: true },
    });
    if (!product) throw new ActionError("notFound");

    let version = 1;
    if (ticket.replacesFileId) {
      // Conditional update: only one confirmation can supersede a given version.
      const replaced = await tx.productFile.findFirst({
        where: { id: ticket.replacesFileId, productId: ticket.productId, supersededAt: null },
        select: { version: true },
      });
      const superseded = await tx.productFile.updateMany({
        where: { id: ticket.replacesFileId, productId: ticket.productId, supersededAt: null },
        data: { supersededAt: new Date() },
      });
      if (!replaced || superseded.count !== 1) throw new ActionError("notFound");
      version = replaced.version + 1;
    }

    const created = await tx.productFile.create({
      data: {
        productId: ticket.productId,
        storageKey: file.storageKey,
        fileName: ticket.fileName,
        sizeBytes: BigInt(file.sizeBytes),
        checksum: file.checksum,
        mimeType: file.mimeType,
        version,
      },
      select: {
        id: true,
        fileName: true,
        sizeBytes: true,
        checksum: true,
        mimeType: true,
        version: true,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: ticket.replacesFileId ? "product_file.replace" : "product_file.add",
      entity: "product",
      entityId: ticket.productId,
      after: { ...created, replacesFileId: ticket.replacesFileId },
    });
    return created.id;
  });
}

/**
 * Removes a file from sale. A file that has been downloaded is kept and only marked
 * superseded (spec §17.5 §8); one that never was is deleted with its object.
 */
export async function removeProductFile(
  db: PrismaClient,
  storage: Storage,
  actorId: string,
  productId: string,
  fileId: string,
): Promise<void> {
  const deletedKey = await db.$transaction(async (tx) => {
    const file = await tx.productFile.findFirst({
      where: { id: fileId, productId, supersededAt: null },
      select: { id: true, storageKey: true, fileName: true, version: true },
    });
    if (!file) throw new ActionError("notFound");

    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { status: true },
    });
    const remaining = await tx.productFile.count({
      where: { productId, supersededAt: null, id: { not: fileId } },
    });
    if (product.status === "published" && remaining === 0) throw new ActionError("lastFile");

    const downloads = await tx.downloadLog.count({ where: { fileId } });
    if (downloads > 0) {
      await tx.productFile.update({ where: { id: fileId }, data: { supersededAt: new Date() } });
    } else {
      await tx.productFile.delete({ where: { id: fileId } });
    }
    await recordAudit(tx, {
      actorId,
      action: downloads > 0 ? "product_file.retire" : "product_file.delete",
      entity: "product",
      entityId: productId,
      before: { fileId: file.id, fileName: file.fileName, version: file.version },
    });
    return downloads > 0 ? null : file.storageKey;
  });
  if (deletedKey) await storage.delete("private", deletedKey).catch(() => undefined);
}

export async function removeProductImage(
  db: PrismaClient,
  storage: Storage,
  actorId: string,
  productId: string,
  imageId: string,
): Promise<void> {
  const storageKey = await db.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true, kind: true, storageKey: true },
    });
    if (!image) throw new ActionError("notFound");
    await tx.productImage.delete({ where: { id: imageId } });
    await recordAudit(tx, {
      actorId,
      action: "product_image.delete",
      entity: "product",
      entityId: productId,
      before: image,
    });
    return image.storageKey;
  });
  await storage.delete("public", storageKey).catch(() => undefined);
}
