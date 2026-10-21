import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Storage } from "@/lib/storage/client";
import { productFileKey } from "@/lib/storage/policy";
import { putUpload } from "./files";

/** Stores a product file in the private bucket the way a confirmed upload ends up. */
export async function storeProductFile(
  db: PrismaClient,
  storage: Storage,
  productId: string,
  options: { fileName?: string; body?: Buffer; version?: number; supersede?: string } = {},
) {
  const body = options.body ?? Buffer.from(`%PDF-1.4 ${randomUUID()}`);
  const key = productFileKey(productId);
  // A pre-signed PUT straight to the final key: tests have no confirmation step.
  const url = await storage.presignUpload({
    key,
    contentType: "application/pdf",
    contentLength: body.length,
    expiresInSeconds: 60,
  });
  const status = await putUpload(url, body, "application/pdf");
  if (status !== 200) throw new Error(`upload failed (${status})`);
  if (options.supersede) {
    await db.productFile.update({
      where: { id: options.supersede },
      data: { supersededAt: new Date() },
    });
  }
  return db.productFile.create({
    data: {
      productId,
      storageKey: key,
      fileName: options.fileName ?? "guide.pdf",
      sizeBytes: BigInt(body.length),
      checksum: "test",
      mimeType: "application/pdf",
      version: options.version ?? 1,
    },
  });
}

/** An active entitlement as a paid order would grant it. */
export async function grant(db: PrismaClient, userId: string, productId: string) {
  return db.entitlement.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: { revokedAt: null },
  });
}
