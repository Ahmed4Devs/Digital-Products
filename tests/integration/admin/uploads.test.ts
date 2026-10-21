import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  confirmUpload,
  inspectImage,
  removeProductFile,
  removeProductImage,
  requestUpload,
} from "@/features/products/uploads";
import { ActionError } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { publicImageUrl } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import { getStorage } from "@/lib/storage";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "@/lib/storage/policy";
import { signUploadTicket, verifyUploadTicket } from "@/lib/storage/upload-token";
import { pdfBytes, pngBytes, putUpload } from "../../support/files";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { ensureOwner } from "../../support/users";

// Pre-signed uploads against real object storage (MinIO): the server must believe only
// what storage reports (spec §17.5 §8).

const db = getDb();
const storage = getStorage();
const secret = serverEnv().BETTER_AUTH_SECRET;
let ownerId = "";

async function newProduct() {
  const product = await db.product.create({
    data: { slug: `upload-${crypto.randomUUID()}`, titleEn: "Upload test", priceUsdCents: 500 },
  });
  return product.id;
}

async function upload(
  productId: string,
  purpose: "file" | "cover" | "gallery",
  fileName: string,
  body: Buffer,
  options: { replacesFileId?: string; putBody?: Buffer } = {},
) {
  const issued = await requestUpload(db, storage, secret, {
    productId,
    purpose,
    fileName,
    sizeBytes: body.length,
    replacesFileId: options.replacesFileId ?? null,
  });
  const status = await putUpload(issued.url, options.putBody ?? body, issued.contentType);
  return { issued, status };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ActionError) return error.messageKey;
    throw error;
  }
  throw new Error("expected a rejection");
}

function ticketOf(token: string) {
  const ticket = verifyUploadTicket(secret, token);
  if (!ticket) throw new Error("invalid test token");
  return ticket;
}

const startedAt = new Date();

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

beforeAll(async () => {
  ownerId = (await ensureOwner(db)).id;
});

describe("requesting an upload", () => {
  it("issues a server-generated pending key and a type chosen from the extension", async () => {
    const productId = await newProduct();
    const { issued } = await upload(productId, "file", "../../etc/My Book.PDF", pdfBytes());
    const ticket = ticketOf(issued.token);
    expect(ticket.key).toMatch(/^pending\/[0-9a-f-]{36}$/);
    expect(issued.contentType).toBe("application/pdf");
    expect(ticket.fileName).toBe("etcMy Book.PDF");
    expect(issued.url).toContain(serverEnv().S3_BUCKET_PRIVATE);
  });

  it("refuses unsupported types, empty and oversized files", async () => {
    const productId = await newProduct();
    const request = (fileName: string, sizeBytes: number, purpose: "file" | "cover" = "file") =>
      rejection(requestUpload(db, storage, secret, { productId, purpose, fileName, sizeBytes }));

    expect(await request("setup.exe", 100)).toBe("unsupportedType");
    expect(await request("page.html", 100)).toBe("unsupportedType");
    expect(await request("logo.svg", 100, "cover")).toBe("unsupportedType");
    expect(await request("book.pdf", 100, "cover")).toBe("unsupportedType");
    expect(await request("book.pdf", 0)).toBe("empty");
    expect(await request("book.pdf", MAX_FILE_BYTES + 1)).toBe("tooLarge");
    expect(await request("cover.png", MAX_IMAGE_BYTES + 1, "cover")).toBe("tooLarge");
    expect(
      await rejection(
        requestUpload(db, storage, secret, {
          productId: crypto.randomUUID(),
          purpose: "file",
          fileName: "book.pdf",
          sizeBytes: 10,
        }),
      ),
    ).toBe("notFound");
  });

  it("lets storage refuse a body that differs from what was signed", async () => {
    const productId = await newProduct();
    const body = pdfBytes();
    const { status } = await upload(productId, "file", "book.pdf", body, {
      putBody: Buffer.concat([body, Buffer.from("extra")]),
    });
    expect(status).toBe(403);

    const issued = await requestUpload(db, storage, secret, {
      productId,
      purpose: "file",
      fileName: "book.pdf",
      sizeBytes: body.length,
    });
    expect(await putUpload(issued.url, body, "text/html")).toBe(403);
  });
});

describe("confirming a file upload", () => {
  it("records the size and checksum reported by storage and moves the object", async () => {
    const productId = await newProduct();
    const body = pdfBytes("confirmed");
    const { issued, status } = await upload(productId, "file", "Guide.pdf", body);
    expect(status).toBe(200);

    const result = await confirmUpload(db, storage, secret, ownerId, { token: issued.token });
    expect(result.kind).toBe("file");

    const file = await db.productFile.findUniqueOrThrow({ where: { id: result.id } });
    expect(file).toMatchObject({
      productId,
      fileName: "Guide.pdf",
      sizeBytes: BigInt(body.length),
      checksum: createHash("md5").update(body).digest("hex"),
      mimeType: "application/pdf",
      version: 1,
      supersededAt: null,
    });
    expect(file.storageKey).toMatch(new RegExp(`^products/${productId}/files/[0-9a-f-]{36}$`));
    expect(await storage.head("private", file.storageKey)).toMatchObject({
      sizeBytes: body.length,
    });
    expect(await storage.head("private", ticketOf(issued.token).key)).toBeNull();

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: productId, action: "product_file.add" },
    });
    expect(audit.actorId).toBe(ownerId);

    // A token works once: the pending object is gone.
    expect(
      await rejection(confirmUpload(db, storage, secret, ownerId, { token: issued.token })),
    ).toBe("uploadMissing");
  });

  it("refuses content that does not match its extension and deletes it", async () => {
    const productId = await newProduct();
    const { issued } = await upload(productId, "file", "book.pdf", Buffer.from("MZ executable"));
    expect(
      await rejection(confirmUpload(db, storage, secret, ownerId, { token: issued.token })),
    ).toBe("signatureMismatch");
    expect(await storage.head("private", ticketOf(issued.token).key)).toBeNull();
    expect(await db.productFile.count({ where: { productId } })).toBe(0);
  });

  it("refuses forged, tampered, expired and unknown tokens", async () => {
    const productId = await newProduct();
    const otherProductId = await newProduct();
    const { issued } = await upload(productId, "file", "book.pdf", pdfBytes());
    const ticket = ticketOf(issued.token);
    const confirm = (token: string) =>
      rejection(confirmUpload(db, storage, secret, ownerId, { token }));

    expect(await confirm("not-a-token")).toBe("uploadExpired");
    // Payload swapped to another product, signature kept.
    const [, mac] = issued.token.split(".");
    const tampered = Buffer.from(JSON.stringify({ ...ticket, productId: otherProductId })).toString(
      "base64url",
    );
    expect(await confirm(`${tampered}.${mac}`)).toBe("uploadExpired");
    // Signed with another secret.
    expect(await confirm(signUploadTicket("another-secret-that-is-long-enough!!", ticket))).toBe(
      "uploadExpired",
    );
    // A key outside pending/ is refused even with a valid signature.
    expect(
      await confirm(signUploadTicket(secret, { ...ticket, key: `products/${productId}/files/x` })),
    ).toBe("uploadExpired");
    // Expired.
    expect(
      await rejection(
        confirmUpload(
          db,
          storage,
          secret,
          ownerId,
          { token: issued.token },
          new Date(Date.now() + 3_600_000),
        ),
      ),
    ).toBe("uploadExpired");
    // Never uploaded.
    const unused = await requestUpload(db, storage, secret, {
      productId,
      purpose: "file",
      fileName: "book.pdf",
      sizeBytes: 10,
    });
    expect(await confirm(unused.token)).toBe("uploadMissing");
  });

  it("supersedes the previous version and keeps downloaded files", async () => {
    const productId = await newProduct();
    const first = await upload(productId, "file", "book.pdf", pdfBytes("v1"));
    const v1 = await confirmUpload(db, storage, secret, ownerId, { token: first.issued.token });

    const second = await upload(productId, "file", "book-v2.pdf", pdfBytes("v2"), {
      replacesFileId: v1.id,
    });
    const v2 = await confirmUpload(db, storage, secret, ownerId, { token: second.issued.token });

    const files = await db.productFile.findMany({
      where: { productId },
      orderBy: { version: "asc" },
    });
    expect(files.map((file) => [file.version, file.supersededAt !== null])).toEqual([
      [1, true],
      [2, false],
    ]);
    // The superseded version stays in storage for buyers' history.
    expect(await storage.head("private", files[0]!.storageKey)).not.toBeNull();

    // Replacing an already superseded version is refused.
    expect(
      await rejection(
        requestUpload(db, storage, secret, {
          productId,
          purpose: "file",
          fileName: "book.pdf",
          sizeBytes: 10,
          replacesFileId: v1.id,
        }),
      ),
    ).toBe("notFound");

    // Downloaded → retired, not deleted.
    const customer = await db.user.create({
      data: { email: `${crypto.randomUUID()}@example.test`, name: "Buyer" },
    });
    const entitlement = await db.entitlement.create({ data: { userId: customer.id, productId } });
    await db.downloadLog.create({ data: { entitlementId: entitlement.id, fileId: v2.id } });
    await removeProductFile(db, storage, ownerId, productId, v2.id);
    const retired = await db.productFile.findUniqueOrThrow({ where: { id: v2.id } });
    expect(retired.supersededAt).not.toBeNull();
    expect(await storage.head("private", retired.storageKey)).not.toBeNull();

    // Never downloaded → deleted with its object.
    const third = await upload(productId, "file", "extra.pdf", pdfBytes("extra"));
    const extra = await confirmUpload(db, storage, secret, ownerId, { token: third.issued.token });
    const extraKey = (await db.productFile.findUniqueOrThrow({ where: { id: extra.id } }))
      .storageKey;
    await removeProductFile(db, storage, ownerId, productId, extra.id);
    expect(await db.productFile.findUnique({ where: { id: extra.id } })).toBeNull();
    expect(await storage.head("private", extraKey)).toBeNull();
  });

  it("keeps the last file of a published product", async () => {
    const productId = await newProduct();
    const { issued } = await upload(productId, "file", "only.pdf", pdfBytes());
    const file = await confirmUpload(db, storage, secret, ownerId, { token: issued.token });
    await db.product.update({ where: { id: productId }, data: { status: "published" } });
    expect(await rejection(removeProductFile(db, storage, ownerId, productId, file.id))).toBe(
      "lastFile",
    );
  });
});

describe("confirming an image upload", () => {
  it("reads real dimensions, publishes the image and replaces the old cover", async () => {
    const productId = await newProduct();
    const first = await upload(productId, "cover", "cover.png", pngBytes(320, 200));
    await confirmUpload(db, storage, secret, ownerId, {
      token: first.issued.token,
      altAr: "غلاف",
      altEn: "Cover",
    });
    const cover = await db.productImage.findFirstOrThrow({ where: { productId, kind: "cover" } });
    expect(cover).toMatchObject({ width: 320, height: 200, altAr: "غلاف", altEn: "Cover" });
    expect(cover.storageKey).toMatch(
      new RegExp(`^products/${productId}/images/[0-9a-f-]{36}\\.png$`),
    );

    const publicUrl = publicImageUrl(cover.storageKey);
    const response = await fetch(publicUrl!);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const second = await upload(productId, "cover", "new-cover.png", pngBytes(400, 300));
    await confirmUpload(db, storage, secret, ownerId, { token: second.issued.token });
    const covers = await db.productImage.findMany({ where: { productId, kind: "cover" } });
    expect(covers).toHaveLength(1);
    expect(covers[0]).toMatchObject({ width: 400, height: 300 });
    expect(await storage.head("public", cover.storageKey)).toBeNull();

    await removeProductImage(db, storage, ownerId, productId, covers[0]!.id);
    expect(await db.productImage.count({ where: { productId } })).toBe(0);
    expect(await storage.head("public", covers[0]!.storageKey)).toBeNull();
  });

  it("refuses files that are not real images of an acceptable size", async () => {
    const productId = await newProduct();
    const cases: [string, Buffer, string][] = [
      ["fake.png", pdfBytes(), "invalidImage"],
      ["tiny.png", pngBytes(20, 20), "imageTooSmall"],
      ["photo.jpg", pngBytes(200, 200), "invalidImage"],
    ];
    for (const [fileName, body, expected] of cases) {
      const { issued } = await upload(productId, "gallery", fileName, body);
      expect(
        await rejection(confirmUpload(db, storage, secret, ownerId, { token: issued.token })),
        fileName,
      ).toBe(expected);
      expect(await storage.head("private", ticketOf(issued.token).key)).toBeNull();
    }
    expect(await db.productImage.count({ where: { productId } })).toBe(0);
  });

  it("orders gallery images and caps their number", async () => {
    const productId = await newProduct();
    for (let index = 0; index < 8; index += 1) {
      const { issued } = await upload(productId, "gallery", `g${index}.png`, pngBytes(120, 120));
      await confirmUpload(db, storage, secret, ownerId, { token: issued.token });
    }
    const gallery = await db.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" },
    });
    expect(gallery.map((image) => image.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(
      await rejection(
        requestUpload(db, storage, secret, {
          productId,
          purpose: "gallery",
          fileName: "g9.png",
          sizeBytes: 100,
        }),
      ),
    ).toBe("galleryFull");
  });

  it("swaps dimensions for rotated photos", () => {
    expect(() => inspectImage(pngBytes(150, 150), "image/jpeg")).toThrow(ActionError);
    expect(inspectImage(pngBytes(150, 120), "image/png")).toEqual({ width: 150, height: 120 });
  });
});
