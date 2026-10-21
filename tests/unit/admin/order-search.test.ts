import { describe, expect, it } from "vitest";
import {
  adminOrderSearchQuery,
  parseAdminOrderSearch,
  riyadhDayStart,
} from "@/features/orders/admin-data";
import { storeDay } from "@/features/orders/metrics";

describe("store calendar day", () => {
  it("follows Riyadh time, not UTC", () => {
    expect(storeDay(new Date("2026-10-21T20:59:59Z"))).toBe("2026-10-21");
    expect(storeDay(new Date("2026-10-21T21:00:00Z"))).toBe("2026-10-22");
    expect(riyadhDayStart("2026-10-22").toISOString()).toBe("2026-10-21T21:00:00.000Z");
  });
});

describe("admin order search", () => {
  it("parses and serializes filters, dropping defaults", () => {
    const search = parseAdminOrderSearch({
      status: "paid",
      q: "  alice@example.test ",
      from: "2026-10-01",
      to: ["2026-10-21", "ignored"],
      overshoot: "1",
      page: "2",
    });
    expect(search).toEqual({
      status: "paid",
      q: "alice@example.test",
      from: "2026-10-01",
      to: "2026-10-21",
      overshoot: "1",
      page: 2,
    });
    expect(adminOrderSearchQuery(search)).toEqual({
      status: "paid",
      q: "alice@example.test",
      from: "2026-10-01",
      to: "2026-10-21",
      overshoot: "1",
      page: "2",
    });
    expect(adminOrderSearchQuery(parseAdminOrderSearch({}))).toEqual({});
  });
});
