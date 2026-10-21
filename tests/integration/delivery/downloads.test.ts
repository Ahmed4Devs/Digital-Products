import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeDownload } from "@/features/downloads/service";
import { findLibrary } from "@/features/library/data";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { getStorage } from "@/lib/storage";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createProduct } from "../../support/checkout";
import { grant, storeProductFile } from "../../support/delivery";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer } from "../../support/users";

// The download gateway against the database and real MinIO (spec §5.1, §10.4).

let requestHeaders: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(requestHeaders) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const route = await import("@/app/api/downloads/[entitlementId]/[fileId]/route");

const db = getDb();
const storage = getStorage();
const auth = getAuth();
const secret = serverEnv().BETTER_AUTH_SECRET;
const startedAt = new Date();

const request = (
  overrides: Partial<Parameters<typeof authorizeDownload>[1]> & {
    userId: string;
    entitlementId: string;
    fileId: string;
  },
) =>
  authorizeDownload(db, {
    ip: "203.0.113.9",
    userAgent: "vitest",
    limitPerMinute: 5,
    secret,
    ...overrides,
  });

function download(
  entitlementId: string,
  fileId: string,
  headers: Record<string, string> = {},
  locale = "en",
) {
  return route.GET(
    new Request(`http://localhost:3000/api/downloads/${entitlementId}/${fileId}?locale=${locale}`, {
      headers,
    }),
    { params: Promise.resolve({ entitlementId, fileId }) },
  );
}

async function owned() {
  const customer = await createCustomer(db);
  const product = await createProduct(db, { priceUsdCents: 1000 });
  const file = await storeProductFile(db, storage, product.id, { fileName: "دليل الميزانية.pdf" });
  const entitlement = await grant(db, customer.id, product.id);
  return { customer, product, file, entitlement };
}

beforeEach(() => {
  requestHeaders = {};
});

beforeAll(async () => {
  await db.storeSetting.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: { downloadsPerMinute: 5 },
  });
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

describe("authorizeDownload", () => {
  it("logs the download with a hashed IP and counts it", async () => {
    const { customer, file, entitlement } = await owned();
    const decision = await request({
      userId: customer.id,
      entitlementId: entitlement.id,
      fileId: file.id,
    });
    expect(decision).toEqual({
      kind: "ok",
      file: {
        storageKey: file.storageKey,
        fileName: "دليل الميزانية.pdf",
        mimeType: "application/pdf",
      },
    });
    const [log] = await db.downloadLog.findMany({ where: { entitlementId: entitlement.id } });
    expect(log).toMatchObject({ fileId: file.id, userAgent: "vitest" });
    expect(log!.ipHash).toBeTruthy();
    expect(log!.ipHash).not.toContain("203.0.113.9");
    expect(
      (await db.entitlement.findUniqueOrThrow({ where: { id: entitlement.id } })).downloadCount,
    ).toBe(1);
  });

  it("refuses other customers, revoked access, old versions and other products' files", async () => {
    const { customer, file, entitlement, product } = await owned();
    const stranger = await createCustomer(db);
    expect(
      await request({ userId: stranger.id, entitlementId: entitlement.id, fileId: file.id }),
    ).toEqual({ kind: "not_found" });

    const other = await owned();
    expect(
      await request({ userId: customer.id, entitlementId: entitlement.id, fileId: other.file.id }),
    ).toEqual({ kind: "not_found" });

    const v2 = await storeProductFile(db, storage, product.id, { version: 2, supersede: file.id });
    expect(
      await request({ userId: customer.id, entitlementId: entitlement.id, fileId: file.id }),
    ).toEqual({ kind: "not_found" });
    expect(
      (await request({ userId: customer.id, entitlementId: entitlement.id, fileId: v2.id })).kind,
    ).toBe("ok");

    await db.entitlement.update({ where: { id: entitlement.id }, data: { revokedAt: new Date() } });
    expect(
      await request({ userId: customer.id, entitlementId: entitlement.id, fileId: v2.id }),
    ).toEqual({ kind: "not_found" });
    // Downloads do not depend on the product still being on sale.
    await db.entitlement.update({ where: { id: entitlement.id }, data: { revokedAt: null } });
    await db.product.update({ where: { id: product.id }, data: { status: "archived" } });
    expect(
      (await request({ userId: customer.id, entitlementId: entitlement.id, fileId: v2.id })).kind,
    ).toBe("ok");
  });

  it("allows the configured number of downloads per minute, across all products", async () => {
    const first = await owned();
    const product = await createProduct(db, { priceUsdCents: 500 });
    const secondFile = await storeProductFile(db, storage, product.id);
    const second = await grant(db, first.customer.id, product.id);
    const now = new Date();
    const at = (entitlementId: string, fileId: string, when = now) =>
      request({ userId: first.customer.id, entitlementId, fileId, now: when });

    for (let index = 0; index < 3; index += 1)
      expect((await at(first.entitlement.id, first.file.id)).kind).toBe("ok");
    for (let index = 0; index < 2; index += 1)
      expect((await at(second.id, secondFile.id)).kind).toBe("ok");
    expect(await at(first.entitlement.id, first.file.id)).toEqual({ kind: "rate_limited" });
    expect(await at(second.id, secondFile.id)).toEqual({ kind: "rate_limited" });
    // A minute later the window is free again.
    expect(
      (await at(first.entitlement.id, first.file.id, new Date(now.getTime() + 61_000))).kind,
    ).toBe("ok");
  });

  it("never lets parallel clicks pass the limit", async () => {
    const { customer, file, entitlement } = await owned();
    const results = await Promise.all(
      Array.from({ length: 9 }, () =>
        request({ userId: customer.id, entitlementId: entitlement.id, fileId: file.id }),
      ),
    );
    expect(results.filter((result) => result.kind === "ok")).toHaveLength(5);
    expect(await db.downloadLog.count({ where: { entitlementId: entitlement.id } })).toBe(5);
  });
});

describe("download route", () => {
  it("redirects the owner to a short-lived attachment URL", async () => {
    const { customer, file, entitlement } = await owned();
    requestHeaders = { cookie: await sessionCookieFor(auth, customer.id) };
    const response = await download(entitlement.id, file.id);
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toContain(file.storageKey);
    expect(Number(location.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(300);

    const fetched = await fetch(location);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-disposition")).toBe(
      `attachment; filename="____ _________.pdf"; filename*=UTF-8''${encodeURIComponent("دليل الميزانية.pdf")}`,
    );
    expect(await fetched.text()).toMatch(/^%PDF-1\.4/);
  });

  it("sends everyone else back to My Purchases or sign-in, with a notice", async () => {
    const { customer, file, entitlement } = await owned();
    let response = await download(entitlement.id, file.id, {}, "ar");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/ar/sign-in?next=%2Faccount%2Flibrary",
    );

    requestHeaders = { cookie: await sessionCookieFor(auth, customer.id) };
    response = await download(entitlement.id, "not-a-uuid");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en/account/library?notice=unavailable",
    );

    response = await download(entitlement.id, file.id, { "sec-fetch-site": "cross-site" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/en/account/library");
    expect(await db.downloadLog.count({ where: { entitlementId: entitlement.id } })).toBe(0);

    await db.storeSetting.update({ where: { id: 1 }, data: { downloadsPerMinute: 1 } });
    try {
      expect((await download(entitlement.id, file.id)).status).toBe(302);
      response = await download(entitlement.id, file.id);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/en/account/library?notice=rateLimited",
      );
    } finally {
      await db.storeSetting.update({ where: { id: 1 }, data: { downloadsPerMinute: 5 } });
    }
  });
});

describe("My Purchases", () => {
  it("lists current files and flags versions published after the purchase", async () => {
    const { customer, product, file, entitlement } = await owned();
    let [entry] = (await findLibrary(db, customer.id)).filter((item) => item.id === entitlement.id);
    expect(entry!.files).toEqual([
      expect.objectContaining({ id: file.id, version: 1, updated: false }),
    ]);

    await request({ userId: customer.id, entitlementId: entitlement.id, fileId: file.id });
    const v2 = await storeProductFile(db, storage, product.id, { version: 2, supersede: file.id });
    [entry] = (await findLibrary(db, customer.id)).filter((item) => item.id === entitlement.id);
    expect(entry!.files).toEqual([
      expect.objectContaining({ id: v2.id, version: 2, updated: true }),
    ]);

    await request({ userId: customer.id, entitlementId: entitlement.id, fileId: v2.id });
    [entry] = (await findLibrary(db, customer.id)).filter((item) => item.id === entitlement.id);
    expect(entry!.files[0]!.updated).toBe(false);

    // Someone who buys after the update gets no "Updated" badge.
    const later = await createCustomer(db);
    await grant(db, later.id, product.id);
    const [fresh] = await findLibrary(db, later.id);
    expect(fresh!.files[0]).toMatchObject({ id: v2.id, updated: false });
  });

  it("hides revoked products", async () => {
    const { customer, entitlement } = await owned();
    await db.entitlement.update({ where: { id: entitlement.id }, data: { revokedAt: new Date() } });
    expect(await findLibrary(db, customer.id)).toEqual([]);
  });
});
