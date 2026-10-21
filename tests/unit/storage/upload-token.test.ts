import { describe, expect, it } from "vitest";
import { keyedHash } from "@/lib/security/keyed-hash";
import {
  signUploadTicket,
  UPLOAD_URL_TTL_SECONDS,
  verifyUploadTicket,
  type UploadTicket,
} from "@/lib/storage/upload-token";

const SECRET = "unit-test-secret-that-is-long-enough!";
const now = new Date("2026-10-21T12:00:00Z");
const ticket: UploadTicket = {
  key: "pending/0199c0de-0000-7000-8000-000000000001",
  productId: "0199c0de-0000-7000-8000-000000000002",
  purpose: "file",
  mimeType: "application/pdf",
  fileName: "book.pdf",
  declaredBytes: 1234,
  replacesFileId: null,
  expiresAt: Math.floor(now.getTime() / 1000) + UPLOAD_URL_TTL_SECONDS,
};

describe("upload tickets", () => {
  it("round-trips a signed ticket", () => {
    expect(verifyUploadTicket(SECRET, signUploadTicket(SECRET, ticket), now)).toEqual(ticket);
  });

  it("rejects tampering, other secrets and malformed tokens", () => {
    const token = signUploadTicket(SECRET, ticket);
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...ticket, declaredBytes: 1 })).toString(
      "base64url",
    );
    for (const candidate of [
      `${forged}.${mac}`,
      `${payload}.${mac}x`,
      `${payload}`,
      `${payload}.${mac}.extra`,
      "",
      "...",
      signUploadTicket("a-different-secret-that-is-long-enough", ticket),
    ]) {
      expect(verifyUploadTicket(SECRET, candidate, now), candidate).toBeNull();
    }
  });

  it("rejects expired tickets and invalid contents even when signed", () => {
    const token = signUploadTicket(SECRET, ticket);
    expect(verifyUploadTicket(SECRET, token, new Date((ticket.expiresAt + 1) * 1000))).toBeNull();
    for (const bad of [
      { ...ticket, key: "products/x/files/y" },
      { ...ticket, purpose: "avatar" },
      { ...ticket, extra: true },
    ]) {
      expect(
        verifyUploadTicket(SECRET, signUploadTicket(SECRET, bad as UploadTicket), now),
      ).toBeNull();
    }
    // A correctly signed payload that is not JSON.
    const notJson = Buffer.from("{oops").toString("base64url");
    expect(
      verifyUploadTicket(SECRET, `${notJson}.${keyedHash(SECRET, "upload-token", notJson)}`, now),
    ).toBeNull();
  });
});
