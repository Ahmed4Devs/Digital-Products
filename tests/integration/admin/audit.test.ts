import { describe, expect, it } from "vitest";
import { findAuditLog, parseAuditSearch } from "@/features/audit/admin-data";
import { recordAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { ensureOwner } from "../../support/users";

// The audit log viewer's reads (spec §11): newest first, filtered by section and record.

const db = getDb();

describe("audit log", () => {
  it("lists entries newest first with the owner's username and filters by record", async () => {
    const owner = await ensureOwner(db);
    const entityId = crypto.randomUUID();
    await db.$transaction((tx) =>
      recordAudit(tx, {
        actorId: owner.id,
        action: "coupon.update",
        entity: "coupon",
        entityId,
        before: { value: 10 },
        after: { value: 20 },
      }),
    );
    await db.$transaction((tx) =>
      recordAudit(tx, {
        actorId: owner.id,
        action: "coupon.deactivate",
        entity: "coupon",
        entityId,
        before: { active: true },
        after: { active: false },
      }),
    );

    const { entries, total } = await findAuditLog(
      db,
      parseAuditSearch({ entity: "coupon", entityId }),
    );
    expect(total).toBe(2);
    expect(entries.map((entry) => entry.action)).toEqual(["coupon.deactivate", "coupon.update"]);
    expect(entries[1]).toMatchObject({
      actor: "owner",
      changes: [{ field: "value", from: 10, to: 20 }],
    });
    expect((await findAuditLog(db, parseAuditSearch({ entity: "product", entityId }))).total).toBe(
      0,
    );
  });
});
