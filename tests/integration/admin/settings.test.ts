import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmLogoUpload, requestLogoUpload } from "@/features/settings/logos";
import { findAdminSettings, findPublicStoreSettings } from "@/features/settings/data";
import { ActionError } from "@/lib/actions";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { getStorage } from "@/lib/storage";
import { pdfBytes, pngBytes, putUpload } from "../../support/files";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner } from "../../support/users";

// Owner store settings (spec §11): details, tax, limits, logos and legal page content.

let requestCookies = "";
const updatedTags: string[] = [];
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookies ? { cookie: requestCookies } : {}),
}));
vi.mock("next/cache", () => ({ updateTag: (tag: string) => updatedTags.push(tag) }));

const actions = await import("@/features/settings/actions");

const db = getDb();
const auth = getAuth();
const storage = getStorage();
const secret = serverEnv().BETTER_AUTH_SECRET;
const IDLE = { status: "idle" } as const;
let ownerId = "";
let ownerCookie = "";
let customerCookie = "";
let original: Awaited<ReturnType<typeof db.storeSetting.findUnique>> = null;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
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

const STORE_FIELDS = {
  storeNameAr: "متجري",
  storeNameEn: "My Store",
  supportEmail: "help@example.test",
  taxEnabled: "on",
  taxRate: "15",
  vatNumber: "300000000000003",
  downloadsPerMinute: "7",
  pendingOrderTtlMinutes: "90",
};

beforeAll(async () => {
  const owner = await ensureOwner(db);
  ownerId = owner.id;
  ownerCookie = await sessionCookieFor(auth, owner.id);
  customerCookie = await sessionCookieFor(auth, (await createCustomer(db)).id);
  original = await db.storeSetting.findUnique({ where: { id: 1 } });
});

beforeEach(() => {
  requestCookies = ownerCookie;
  updatedTags.length = 0;
});

afterAll(async () => {
  // Other suites rely on the seeded settings (tax off, default limits, no logos).
  if (original) {
    const { id: _id, updatedAt: _updatedAt, ...restore } = original;
    await db.storeSetting.update({ where: { id: 1 }, data: restore });
  }
});

describe("owner-only enforcement", () => {
  it("rejects guests and customers on every settings action", async () => {
    const before = { settings: await findAdminSettings(db), audits: await db.auditLog.count() };
    const attempts = [
      () => actions.updateStoreSettingsAction(IDLE, form(STORE_FIELDS)),
      () => actions.updateGatewaysAction(IDLE, form({ moyasarEnabled: "on" })),
      () => actions.updateLegalPageAction(IDLE, form({ page: "terms", contentAr: "<p>x</p>" })),
      () =>
        actions.requestLogoUploadAction({ variant: "light", fileName: "logo.png", sizeBytes: 100 }),
      () => actions.confirmLogoUploadAction({ token: "forged" }),
      () => actions.removeLogoAction("light"),
    ];
    for (const cookie of ["", customerCookie]) {
      requestCookies = cookie;
      for (const attempt of attempts) await expectNotFound(attempt());
    }
    expect(await findAdminSettings(db)).toEqual(before.settings);
    expect(await db.auditLog.count()).toBe(before.audits);
    expect(updatedTags).toEqual([]);
  });
});

describe("store details", () => {
  it("saves details, tax and limits, audits the diff and refreshes the store", async () => {
    expect(await actions.updateStoreSettingsAction(IDLE, form(STORE_FIELDS))).toEqual({
      status: "success",
      message: "settingsSaved",
    });
    expect(await findAdminSettings(db)).toMatchObject({
      storeNameAr: "متجري",
      storeNameEn: "My Store",
      supportEmail: "help@example.test",
      taxEnabled: true,
      taxRate: "15",
      vatNumber: "300000000000003",
      downloadsPerMinute: "7",
      pendingOrderTtlMinutes: "90",
    });
    expect(updatedTags).toEqual(["settings"]);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "settings.update", actorId: ownerId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.diff).toMatchObject({ changes: { taxRateBasisPoints: { to: 1500 } } });

    // 7.5 % with Arabic-Indic digits, tax off (an unchecked box is not sent), optional
    // fields cleared.
    const { taxEnabled: _taxEnabled, ...withoutTax } = STORE_FIELDS;
    expect(
      await actions.updateStoreSettingsAction(
        IDLE,
        form({ ...withoutTax, taxRate: "٧٫٥", supportEmail: "", vatNumber: "" }),
      ),
    ).toMatchObject({ status: "success" });
    const settings = await db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings).toMatchObject({
      taxEnabled: false,
      taxRateBasisPoints: 750,
      supportEmail: null,
      vatNumber: null,
    });
  });

  it("explains invalid values", async () => {
    const result = await actions.updateStoreSettingsAction(
      IDLE,
      form({
        ...STORE_FIELDS,
        supportEmail: "not-an-email",
        taxRate: "0",
        downloadsPerMinute: "0",
        pendingOrderTtlMinutes: "99999",
        storeNameEn: "x".repeat(61),
      }),
    );
    expect(result).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: {
        supportEmail: "invalidEmail",
        downloadsPerMinute: "outOfRange",
        pendingOrderTtlMinutes: "outOfRange",
        storeNameEn: "tooLong",
      },
    });
    const taxOnly = await actions.updateStoreSettingsAction(
      IDLE,
      form({ ...STORE_FIELDS, taxRate: "0" }),
    );
    expect(taxOnly.fieldErrors).toEqual({ taxRate: "taxRateRequired" });
    const percent = await actions.updateStoreSettingsAction(
      IDLE,
      form({ ...STORE_FIELDS, taxRate: "150" }),
    );
    expect(percent.fieldErrors).toEqual({ taxRate: "invalidPercent" });
  });
});

describe("legal pages", () => {
  it("saves one page at a time, sanitized, without touching the others", async () => {
    await actions.updateLegalPageAction(
      IDLE,
      form({ page: "privacy", contentAr: "<p>خصوصية</p>", contentEn: "<p>Privacy</p>" }),
    );
    expect(
      await actions.updateLegalPageAction(
        IDLE,
        form({
          page: "terms",
          contentAr: '<p onclick="x()">شروط<script>alert(1)</script></p>',
          contentEn: "<p>   </p>",
        }),
      ),
    ).toEqual({ status: "success", message: "settingsSaved" });
    const { legal } = await findAdminSettings(db);
    expect(legal.terms).toEqual({ ar: "<p>شروط</p>", en: "" });
    expect(legal.privacy).toEqual({ ar: "<p>خصوصية</p>", en: "<p>Privacy</p>" });
    expect(updatedTags).toContain("settings");

    expect(
      await actions.updateLegalPageAction(IDLE, form({ page: "cookies", contentAr: "" })),
    ).toMatchObject({
      status: "error",
      message: "invalid",
    });
  });
});

describe("logos", () => {
  async function uploadLogo(variant: "light" | "dark", fileName: string, body: Buffer) {
    const issued = await requestLogoUpload(storage, secret, {
      variant,
      fileName,
      sizeBytes: body.length,
    });
    expect(await putUpload(issued.url, body, issued.contentType)).toBe(200);
    return issued.token;
  }

  it("verifies the image, publishes it and replaces the previous logo", async () => {
    await confirmLogoUpload(
      db,
      storage,
      secret,
      ownerId,
      await uploadLogo("light", "logo.png", pngBytes(120, 40)),
    );
    const first = (await findPublicStoreSettings(db)).logoLightKey!;
    expect(first).toMatch(/^branding\/[0-9a-f-]{36}\.png$/);
    expect(await storage.head("public", first)).not.toBeNull();

    await confirmLogoUpload(
      db,
      storage,
      secret,
      ownerId,
      await uploadLogo("light", "logo2.png", pngBytes(64, 64)),
    );
    const second = (await findPublicStoreSettings(db)).logoLightKey!;
    expect(second).not.toBe(first);
    expect(await storage.head("public", first)).toBeNull();

    requestCookies = ownerCookie;
    expect(await actions.removeLogoAction("light")).toEqual({
      status: "success",
      message: "logoRemoved",
    });
    expect((await findPublicStoreSettings(db)).logoLightKey).toBeNull();
    expect(await storage.head("public", second)).toBeNull();
  });

  it("rejects files that are not images or are too small", async () => {
    expect(
      await rejection(
        requestLogoUpload(storage, secret, {
          variant: "dark",
          fileName: "logo.svg",
          sizeBytes: 100,
        }),
      ),
    ).toBe("unsupportedType");
    const fake = await uploadLogo("dark", "logo.png", pdfBytes());
    expect(await rejection(confirmLogoUpload(db, storage, secret, ownerId, fake))).toBe(
      "invalidImage",
    );
    const tiny = await uploadLogo("dark", "logo.png", pngBytes(8, 8));
    expect(await rejection(confirmLogoUpload(db, storage, secret, ownerId, tiny))).toBe(
      "imageTooSmall",
    );
    expect((await findPublicStoreSettings(db)).logoDarkKey).toBeNull();
  });

  it("refuses product upload tickets", async () => {
    const product = await db.product.create({
      data: { slug: `logo-ticket-${crypto.randomUUID()}`, titleEn: "Ticket", priceUsdCents: 100 },
    });
    const { requestUpload } = await import("@/features/products/uploads");
    const body = pngBytes(200, 200);
    const issued = await requestUpload(db, storage, secret, {
      productId: product.id,
      purpose: "cover",
      fileName: "cover.png",
      sizeBytes: body.length,
      replacesFileId: null,
    });
    await putUpload(issued.url, body, issued.contentType);
    expect(await rejection(confirmLogoUpload(db, storage, secret, ownerId, issued.token))).toBe(
      "invalid",
    );
    await db.product.delete({ where: { id: product.id } });
  });
});
