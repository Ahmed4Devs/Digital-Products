import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findAdminCustomer,
  findAdminCustomers,
  findGrantableProducts,
  parseAdminCustomerSearch,
} from "@/features/customers/admin-data";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { restoreCatalog } from "../../support/catalog-cleanup";
import { createProduct } from "../../support/checkout";
import { createPaidOrder } from "../../support/orders";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner } from "../../support/users";

// Owner customer management (spec §11): ban with immediate sign-out, and grant or revoke
// products outside any order. The owner account can never be targeted.

let requestCookies = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestCookies ? { cookie: requestCookies } : {}),
}));
vi.mock("next/cache", () => ({ updateTag: () => undefined }));

const actions = await import("@/features/customers/actions");

const db = getDb();
const auth = getAuth();
const startedAt = new Date();
let ownerId = "";
let ownerCookie = "";
let customerCookie = "";

const IDLE = { status: "idle" } as const;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
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
  it("rejects guests and customers on every customer action", async () => {
    const target = await createCustomer(db);
    const product = await createProduct(db, { priceUsdCents: 900 });
    const entitlement = await db.entitlement.create({
      data: { userId: target.id, productId: product.id },
    });
    const audits = await db.auditLog.count();
    const attempts = [
      () => actions.setCustomerBannedAction(target.id, true),
      () => actions.grantProductAction(target.id, IDLE, form({ productId: product.id })),
      () => actions.revokeEntitlementAction(target.id, entitlement.id),
    ];
    for (const cookie of ["", customerCookie]) {
      requestCookies = cookie;
      for (const attempt of attempts) await expectNotFound(attempt());
    }
    expect(await db.auditLog.count()).toBe(audits);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).banned).toBe(false);
  });

  it("never bans or grants to the owner account", async () => {
    const product = await createProduct(db, { priceUsdCents: 900 });
    expect(await actions.setCustomerBannedAction(ownerId, true)).toEqual({
      status: "error",
      message: "notFound",
    });
    expect(
      await actions.grantProductAction(ownerId, IDLE, form({ productId: product.id })),
    ).toEqual({ status: "error", message: "notFound" });
    expect((await db.user.findUniqueOrThrow({ where: { id: ownerId } })).banned).toBe(false);
  });
});

describe("bans", () => {
  it("bans with immediate sign-out, then lifts the ban; both audited", async () => {
    const target = await createCustomer(db);
    const cookie = await sessionCookieFor(auth, target.id);
    expect(await db.session.count({ where: { userId: target.id } })).toBe(1);

    expect(await actions.setCustomerBannedAction(target.id, true)).toEqual({
      status: "success",
      message: "customerBanned",
    });
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true },
    });
    expect(session).toBeNull();

    expect(await actions.setCustomerBannedAction(target.id, false)).toMatchObject({
      status: "success",
      message: "customerUnbanned",
    });
    const audits = await db.auditLog.findMany({
      where: { entityId: target.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => [row.action, row.actorId])).toEqual([
      ["user.ban", ownerId],
      ["user.unban", ownerId],
    ]);
    // Repeating the current state writes nothing.
    await actions.setCustomerBannedAction(target.id, false);
    expect(await db.auditLog.count({ where: { entityId: target.id } })).toBe(2);
  });
});

describe("granting products", () => {
  it("grants, refuses duplicates and drafts, revokes and grants again", async () => {
    const target = await createCustomer(db);
    const product = await createProduct(db, { priceUsdCents: 900 });
    const draft = await db.product.create({
      data: { slug: `draft-${Date.now()}`, titleEn: "Draft", priceUsdCents: 100 },
    });

    expect(
      await actions.grantProductAction(target.id, IDLE, form({ productId: product.id })),
    ).toEqual({ status: "success", message: "accessGranted" });
    expect(
      await actions.grantProductAction(target.id, IDLE, form({ productId: product.id })),
    ).toEqual({ status: "error", message: "invalid", fieldErrors: { productId: "alreadyOwned" } });
    expect(
      await actions.grantProductAction(target.id, IDLE, form({ productId: draft.id })),
    ).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: { productId: "productUnavailable" },
    });
    expect(await actions.grantProductAction(target.id, IDLE, form({}))).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: { productId: "required" },
    });

    const entitlement = await db.entitlement.findUniqueOrThrow({
      where: { userId_productId: { userId: target.id, productId: product.id } },
    });
    expect(entitlement.orderItemId).toBeNull();
    expect(await findGrantableProducts(db, target.id)).not.toContainEqual(
      expect.objectContaining({ id: product.id }),
    );

    expect(await actions.revokeEntitlementAction(target.id, entitlement.id)).toEqual({
      status: "success",
      message: "accessRevoked",
    });
    // Another customer's id with this entitlement is refused.
    const other = await createCustomer(db);
    expect(await actions.revokeEntitlementAction(other.id, entitlement.id)).toEqual({
      status: "error",
      message: "notFound",
    });
    expect(
      await actions.grantProductAction(target.id, IDLE, form({ productId: product.id })),
    ).toEqual({ status: "success", message: "accessGranted" });
    const audits = await db.auditLog.findMany({
      where: { entityId: entitlement.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => row.action)).toEqual([
      "entitlement.grant",
      "entitlement.revoke",
      "entitlement.grant",
    ]);
  });
});

describe("reads", () => {
  it("lists customers with filters and never lists the owner", async () => {
    const banned = await createCustomer(db, { banned: true });
    const unverified = await createCustomer(db, { verified: false });
    const search = (params: Record<string, string>) =>
      findAdminCustomers(db, parseAdminCustomerSearch(params));

    expect((await search({ q: banned.email, status: "banned" })).customers).toHaveLength(1);
    expect((await search({ q: banned.email, status: "active" })).customers).toHaveLength(0);
    expect((await search({ q: unverified.email, status: "unverified" })).total).toBe(1);
    expect((await search({ q: "owner@example.test" })).total).toBe(0);
  });

  it("shows a customer's products, orders and total paid", async () => {
    const target = await createCustomer(db);
    const product = await createProduct(db, { priceUsdCents: 1250 });
    const order = await createPaidOrder(db, { user: target, products: [product] });
    const detail = await findAdminCustomer(db, target.id);
    expect(detail).toMatchObject({
      spentUsdCents: 1250,
      orders: [expect.objectContaining({ id: order.id })],
      entitlements: [
        expect.objectContaining({
          orderItem: { order: { id: order.id, orderNumber: order.orderNumber } },
        }),
      ],
    });
    expect(await findAdminCustomer(db, ownerId)).toBeNull();
  });
});
