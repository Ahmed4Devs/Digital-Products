import { describe, expect, it } from "vitest";
import {
  AUDIT_VALUE_PREVIEW,
  auditRows,
  auditSearchQuery,
  parseAuditSearch,
} from "@/features/audit/admin-data";

describe("audit rows", () => {
  it("turns stored diffs into display rows and shortens long values", () => {
    const long = "<p>".padEnd(500, "x");
    expect(
      auditRows({
        changes: {
          title: { from: "Old", to: "New" },
          terms: { from: null, to: long },
          featured: { from: false, to: true },
        },
        details: { orderId: "o-1", ids: ["a", "b"] },
      }),
    ).toEqual({
      changes: [
        { field: "title", from: "Old", to: "New" },
        { field: "terms", from: null, to: `${long.slice(0, AUDIT_VALUE_PREVIEW)}…` },
        { field: "featured", from: false, to: true },
      ],
      details: [
        { field: "orderId", value: "o-1" },
        { field: "ids", value: '["a","b"]' },
      ],
    });
  });

  it("shows malformed diffs as empty", () => {
    expect(auditRows(null)).toEqual({ changes: [], details: [] });
    expect(auditRows({ changes: "nope" })).toEqual({ changes: [], details: [] });
  });

  it("parses filters", () => {
    expect(parseAuditSearch({ entity: "coupon", entityId: " abc ", page: "3" })).toEqual({
      entity: "coupon",
      entityId: "abc",
      page: 3,
    });
    expect(auditSearchQuery(parseAuditSearch({ entity: "bogus" }))).toEqual({});
  });
});
