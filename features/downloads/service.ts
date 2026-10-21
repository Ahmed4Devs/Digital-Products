import type { PrismaClient } from "@/generated/prisma/client";
import { keyedHash } from "@/lib/security/keyed-hash";

// The secure download gateway (spec §5.1, §10.4): session → ownership → not revoked →
// current file of the owned product → per-minute limit computed from DownloadLog →
// log row → short-lived pre-signed URL (built by the route).

export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const WINDOW_MS = 60_000;

export type DownloadRequest = {
  userId: string;
  entitlementId: string;
  fileId: string;
  ip: string | null;
  userAgent: string | null;
  limitPerMinute: number;
  secret: string;
  now?: Date;
};

export type DownloadDecision =
  | { kind: "ok"; file: { storageKey: string; fileName: string; mimeType: string } }
  | { kind: "not_found" }
  | { kind: "rate_limited" };

export async function authorizeDownload(
  db: PrismaClient,
  request: DownloadRequest,
): Promise<DownloadDecision> {
  const now = request.now ?? new Date();
  return db.$transaction(async (tx) => {
    // One customer's downloads are counted one at a time, so parallel clicks cannot
    // slip past the limit.
    // (pg_advisory_xact_lock returns void, which Prisma cannot read: wrap it.)
    await tx.$queryRaw`
      SELECT 1 AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtext(${`download:${request.userId}`}))) AS "lock"`;

    const entitlement = await tx.entitlement.findFirst({
      where: { id: request.entitlementId, userId: request.userId, revokedAt: null },
      select: { id: true, productId: true },
    });
    if (!entitlement) return { kind: "not_found" } as const;

    // Buyers always get the latest version: superseded files are not downloadable.
    const file = await tx.productFile.findFirst({
      where: { id: request.fileId, productId: entitlement.productId, supersededAt: null },
      select: { id: true, storageKey: true, fileName: true, mimeType: true },
    });
    if (!file) return { kind: "not_found" } as const;

    const recent = await tx.downloadLog.count({
      where: {
        entitlement: { userId: request.userId },
        createdAt: { gt: new Date(now.getTime() - WINDOW_MS) },
      },
    });
    if (recent >= request.limitPerMinute) return { kind: "rate_limited" } as const;

    await tx.downloadLog.create({
      data: {
        entitlementId: entitlement.id,
        fileId: file.id,
        // Only a keyed hash of the IP is ever stored (spec §5.1).
        ipHash: request.ip ? keyedHash(request.secret, "download-ip", request.ip) : null,
        userAgent: request.userAgent?.slice(0, 256) ?? null,
        createdAt: now,
      },
    });
    await tx.entitlement.update({
      where: { id: entitlement.id },
      data: { downloadCount: { increment: 1 } },
    });
    return {
      kind: "ok",
      file: { storageKey: file.storageKey, fileName: file.fileName, mimeType: file.mimeType },
    } as const;
  });
}

/**
 * `Content-Disposition: attachment` with the display name: an ASCII fallback plus the
 * exact UTF-8 name (RFC 6266 / RFC 5987), so Arabic file names survive.
 */
export function attachmentDisposition(fileName: string): string {
  const fallback =
    fileName
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
