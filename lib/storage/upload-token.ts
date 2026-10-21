import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { keyedHash } from "@/lib/security/keyed-hash";
import { isPendingKey, UPLOAD_PURPOSES } from "./policy";

// A signed receipt for a pre-signed upload. The server hands it out with the upload URL
// and accepts only it when the owner confirms, so a confirmation can never point at a
// storage key, product, type or slot the server did not issue (spec §17.5 §8).

const TOKEN_PURPOSE = "upload-token";
/** Pre-signed PUT URLs and their tokens expire together. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

const uploadTicketSchema = z.strictObject({
  key: z.string().refine(isPendingKey),
  productId: z.uuid(),
  purpose: z.enum(UPLOAD_PURPOSES),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  /** Size declared by the browser; storage reports the real one on confirmation. */
  declaredBytes: z.number().int().positive(),
  /** The file this upload replaces with a new version, if any. */
  replacesFileId: z.uuid().nullable(),
  expiresAt: z.number().int(),
});

export type UploadTicket = z.infer<typeof uploadTicketSchema>;

function signature(secret: string, payload: string): string {
  return keyedHash(secret, TOKEN_PURPOSE, payload);
}

export function signUploadTicket(secret: string, ticket: UploadTicket): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(secret, payload)}`;
}

/** The ticket inside a valid, unexpired token; null for anything else. */
export function verifyUploadTicket(
  secret: string,
  token: string,
  now: Date = new Date(),
): UploadTicket | null {
  const [payload, mac, ...rest] = token.split(".");
  if (!payload || !mac || rest.length > 0) return null;

  const expected = Buffer.from(signature(secret, payload));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const ticket = uploadTicketSchema.safeParse(decoded);
  if (!ticket.success || ticket.data.expiresAt * 1000 <= now.getTime()) return null;
  return ticket.data;
}
