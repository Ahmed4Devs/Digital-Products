import { describe, expect, it } from "vitest";
import { lookUpOwnerSession } from "@/lib/proxy/create-proxy";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { sessionCookieFor } from "../../support/sessions";
import { createCustomer, ensureOwner } from "../../support/users";

// The proxy's session lookup, which gives non-owners a genuine 404 status on /admin.

const db = getDb();
const auth = getAuth();

function tokenOf(cookie: string): string {
  return decodeURIComponent(cookie.split("=")[1]!).split(".")[0]!;
}

describe("owner session lookup", () => {
  it("is true only for a live session of the owner", async () => {
    const owner = await ensureOwner(db);
    const customer = await createCustomer(db);
    const ownerToken = tokenOf(await sessionCookieFor(auth, owner.id));
    const customerToken = tokenOf(await sessionCookieFor(auth, customer.id));

    expect(await lookUpOwnerSession(ownerToken)).toBe(true);
    expect(await lookUpOwnerSession(customerToken)).toBe(false);
    expect(await lookUpOwnerSession("no-such-token")).toBe(false);

    await db.session.update({ where: { token: ownerToken }, data: { expiresAt: new Date(0) } });
    expect(await lookUpOwnerSession(ownerToken)).toBe(false);
  });
});
