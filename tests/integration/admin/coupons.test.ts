import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findAdminCoupon,
  findAdminCoupons,
  parseAdminCouponSearch,
} from "@/features/coupons/admin-data";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createCoupon } from "../../support/checkout";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner } from "../../support/users";

// Owner coupon management (spec §11): create, edit and (de)activate, each audited.

let requestCookies = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookies ? { cookie: requestCookies } : {}),
}));
vi.mock("next/cache", () => ({ updateTag: () => undefined }));

const actions = await import("@/features/coupons/actions");

const db = getDb();
const auth = getAuth();
const startedAt = new Date();
const IDLE = { status: "idle" } as const;
let ownerId = "";
let ownerCookie = "";
let customerCookie = "";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function uniqueCode() {
  return `ADM${Math.random().toString(36).slice(2, 10)}`;
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

beforeAll(async () => {
  const owner = await ensureOwner(db);
  ownerId = owner.id;
  ownerCookie = await sessionCookieFor(auth, owner.id);
  customerCookie = await sessionCookieFor(auth, (await createCustomer(db)).id);
});

beforeEach(() => {
  requestCookies = ownerCookie;
});

afterAll(async () => {
  await restoreCatalog(db, startedAt);
});

describe("owner-only enforcement", () => {
  it("rejects guests and customers on every coupon action", async () => {
    const coupon = await createCoupon(db);
    const before = { coupons: await db.coupon.count(), audits: await db.auditLog.count() };
    const attempts = [
      () =>
        actions.createCouponAction(
          IDLE,
          form({ code: uniqueCode(), type: "percent", value: "10" }),
        ),
      () => actions.updateCouponAction(coupon.id, IDLE, form({ type: "percent", value: "50" })),
      () => actions.setCouponActiveAction(coupon.id, false),
    ];
    for (const cookie of ["", customerCookie]) {
      requestCookies = cookie;
      for (const attempt of attempts) await expectNotFound(attempt());
    }
    expect(await db.coupon.count()).toBe(before.coupons);
    expect(await db.auditLog.count()).toBe(before.audits);
    expect(await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      value: 10,
      active: true,
    });
  });
});

describe("coupons", () => {
  it("creates, refuses duplicate codes in any case, edits and deactivates", async () => {
    const code = uniqueCode();
    const created = await actions.createCouponAction(
      IDLE,
      form({ code: code.toLowerCase(), type: "fixed", value: "5", usageLimit: "3", active: "on" }),
    );
    expect(created).toMatchObject({ status: "success", message: "couponCreated" });
    const id = created.id!;
    expect(await db.coupon.findUniqueOrThrow({ where: { id } })).toMatchObject({
      code: code.toUpperCase(),
      type: "fixed",
      value: 500,
      usageLimit: 3,
      active: true,
    });

    expect(
      await actions.createCouponAction(IDLE, form({ code, type: "percent", value: "10" })),
    ).toEqual({ status: "error", message: "invalid", fieldErrors: { code: "couponCodeTaken" } });

    expect(
      await actions.updateCouponAction(
        id,
        IDLE,
        form({ type: "percent", value: "20", endsAt: "2030-01-01T00:00" }),
      ),
    ).toEqual({ status: "success", message: "couponSaved" });
    const edited = await db.coupon.findUniqueOrThrow({ where: { id } });
    expect(edited).toMatchObject({ type: "percent", value: 20, usageLimit: null, active: true });
    expect(edited.endsAt?.toISOString()).toBe("2029-12-31T21:00:00.000Z");

    expect(await actions.setCouponActiveAction(id, false)).toEqual({
      status: "success",
      message: "couponDeactivated",
    });
    expect((await db.coupon.findUniqueOrThrow({ where: { id } })).active).toBe(false);

    const audits = await db.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => [row.action, row.actorId])).toEqual([
      ["coupon.create", ownerId],
      ["coupon.update", ownerId],
      ["coupon.deactivate", ownerId],
    ]);
    expect(audits[1]!.diff).toMatchObject({
      changes: { type: { from: "fixed", to: "percent" }, value: { from: 500, to: 20 } },
    });
  });

  it("reports validation errors and unknown coupons", async () => {
    expect(
      await actions.createCouponAction(IDLE, form({ code: "!!", type: "percent", value: "0" })),
    ).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: { code: "invalidCouponCode" },
    });
    const missing = "01900000-0000-7000-8000-000000000000";
    expect(
      await actions.updateCouponAction(missing, IDLE, form({ type: "percent", value: "5" })),
    ).toEqual({
      status: "error",
      message: "notFound",
    });
    expect(await actions.setCouponActiveAction("nope", true)).toEqual({
      status: "error",
      message: "invalid",
    });
  });

  it("lists coupons and shows their uses", async () => {
    const coupon = await createCoupon(db, { active: false });
    const list = await findAdminCoupons(
      db,
      parseAdminCouponSearch({ q: coupon.code.toLowerCase(), status: "inactive" }),
    );
    expect(list.coupons.map((row) => row.id)).toEqual([coupon.id]);
    expect(await findAdminCoupon(db, coupon.id)).toMatchObject({
      redemptions: [],
      paidOrders: 0,
      discountGivenUsdCents: 0,
    });
  });
});
