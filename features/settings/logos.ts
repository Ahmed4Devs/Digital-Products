import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inspectImage } from "@/features/products/uploads";
import { ActionError } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import type { Storage } from "@/lib/storage/client";
import {
  checkUploadSize,
  isLogoPurpose,
  logoKey,
  matchesSignature,
  MAX_IMAGE_BYTES,
  newPendingKey,
  resolveUploadType,
  sanitizeFileName,
} from "@/lib/storage/policy";
import {
  signUploadTicket,
  UPLOAD_URL_TTL_SECONDS,
  verifyUploadTicket,
} from "@/lib/storage/upload-token";

// Store logos (light and dark, spec §11 settings) go through the same verified upload
// pipeline as product images: pre-signed PUT to pending/, then storage-side checks.

export const LOGO_MIN_SIDE = 16;

const variants = { light: "logoLight", dark: "logoDark" } as const;
const columns = { logoLight: "logoLightKey", logoDark: "logoDarkKey" } as const;

export const logoRequestSchema = z.strictObject({
  variant: z.enum(["light", "dark"]),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int(),
});

export async function requestLogoUpload(
  storage: Storage,
  secret: string,
  request: z.input<typeof logoRequestSchema>,
  now: Date = new Date(),
) {
  const input = logoRequestSchema.parse(request);
  const purpose = variants[input.variant];
  const type = resolveUploadType(purpose, input.fileName);
  if (!type) throw new ActionError("unsupportedType");
  const sizeProblem = checkUploadSize(purpose, input.sizeBytes);
  if (sizeProblem) throw new ActionError(sizeProblem);

  const ticket = {
    key: newPendingKey(),
    productId: null,
    purpose,
    mimeType: type.mimeType,
    fileName: sanitizeFileName(input.fileName),
    declaredBytes: input.sizeBytes,
    replacesFileId: null,
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

export async function confirmLogoUpload(
  db: PrismaClient,
  storage: Storage,
  secret: string,
  actorId: string,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  const ticket = verifyUploadTicket(secret, token, now);
  if (!ticket) throw new ActionError("uploadExpired");
  if (!isLogoPurpose(ticket.purpose)) throw new ActionError("invalid");
  const purpose = ticket.purpose;

  const stored = await storage.head("private", ticket.key);
  if (!stored) throw new ActionError("uploadMissing");
  const discardPending = () => storage.delete("private", ticket.key).catch(() => undefined);

  let finalKey: string | null = null;
  try {
    const sizeProblem = checkUploadSize(purpose, stored.sizeBytes);
    if (sizeProblem) throw new ActionError(sizeProblem);
    if (stored.sizeBytes !== ticket.declaredBytes || stored.contentType !== ticket.mimeType) {
      throw new ActionError("uploadMismatch");
    }
    const type = resolveUploadType(purpose, ticket.fileName);
    if (!type || type.mimeType !== ticket.mimeType) throw new ActionError("unsupportedType");
    const bytes = await storage.readStart("private", ticket.key, MAX_IMAGE_BYTES);
    if (!matchesSignature(type.signature, bytes)) throw new ActionError("invalidImage");
    inspectImage(bytes, type.mimeType, { minSide: LOGO_MIN_SIDE });

    finalKey = logoKey(type.extension);
    await storage.copy({
      from: { bucket: "private", key: ticket.key },
      to: { bucket: "public", key: finalKey },
      contentType: type.mimeType,
      cacheControl: "public, max-age=31536000, immutable",
    });
    const column = columns[purpose];
    const previous = await db.$transaction(async (tx) => {
      const before = await tx.storeSetting.findUnique({
        where: { id: 1 },
        select: { [column]: true },
      });
      await tx.storeSetting.upsert({
        where: { id: 1 },
        update: { [column]: finalKey },
        create: { id: 1, [column]: finalKey },
      });
      await recordAudit(tx, {
        actorId,
        action: "settings.update",
        entity: "settings",
        entityId: "1",
        before: { [column]: before?.[column] ?? null },
        after: { [column]: finalKey },
      });
      return (before?.[column] as string | null | undefined) ?? null;
    });
    await discardPending();
    if (previous) await storage.delete("public", previous).catch(() => undefined);
  } catch (error) {
    await discardPending();
    if (finalKey) await storage.delete("public", finalKey).catch(() => undefined);
    throw error;
  }
}

export async function removeLogo(
  db: PrismaClient,
  storage: Storage,
  actorId: string,
  variant: "light" | "dark",
): Promise<void> {
  const column = columns[variants[variant]];
  const previous = await db.$transaction(async (tx) => {
    const before = await tx.storeSetting.findUnique({
      where: { id: 1 },
      select: { [column]: true },
    });
    const key = (before?.[column] as string | null | undefined) ?? null;
    if (!key) return null;
    await tx.storeSetting.update({ where: { id: 1 }, data: { [column]: null } });
    await recordAudit(tx, {
      actorId,
      action: "settings.update",
      entity: "settings",
      entityId: "1",
      before: { [column]: key },
      after: { [column]: null },
    });
    return key;
  });
  if (previous) await storage.delete("public", previous).catch(() => undefined);
}
