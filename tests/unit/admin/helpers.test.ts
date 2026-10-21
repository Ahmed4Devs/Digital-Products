import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ActionError, actionFailure, fieldErrorsFrom, formDataObject } from "@/lib/actions";
import { auditDiff, auditValue } from "@/lib/audit";
import { Prisma } from "@/generated/prisma/client";

describe("auditValue", () => {
  it("turns column values into JSON-safe values", () => {
    expect(auditValue(undefined)).toBeNull();
    expect(auditValue(null)).toBeNull();
    expect(auditValue("x")).toBe("x");
    expect(auditValue(5)).toBe(5);
    expect(auditValue(false)).toBe(false);
    expect(auditValue(12n)).toBe("12");
    expect(auditValue(new Date("2026-10-21T00:00:00Z"))).toBe("2026-10-21T00:00:00.000Z");
    expect(auditValue(new Prisma.Decimal("3.75"))).toBe("3.75");
    expect(auditValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe("auditDiff", () => {
  it("lists only changed fields and ignores timestamps", () => {
    expect(
      auditDiff(
        { title: "a", price: 1, same: true, updatedAt: new Date(1) },
        { title: "b", price: 1, same: true, updatedAt: new Date(2), added: "x" },
      ),
    ).toEqual({ added: { from: null, to: "x" }, title: { from: "a", to: "b" } });
  });

  it("diffs creations and deletions against nothing", () => {
    expect(auditDiff(null, { slug: "s" })).toEqual({ slug: { from: null, to: "s" } });
    expect(auditDiff({ slug: "s" }, null)).toEqual({ slug: { from: "s", to: null } });
    expect(auditDiff(null, null)).toEqual({});
  });
});

describe("action helpers", () => {
  it("maps expected errors to message keys and hides the rest", () => {
    expect(actionFailure(new ActionError("slugTaken", "slug"))).toEqual({
      status: "error",
      message: "invalid",
      fieldErrors: { slug: "slugTaken" },
    });
    expect(actionFailure(new ActionError("hasSales"))).toEqual({
      status: "error",
      message: "hasSales",
    });
    expect(actionFailure(z.uuid().safeParse("x").error)).toEqual({
      status: "error",
      message: "invalid",
    });

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(actionFailure(new Error("connection string postgres://secret"))).toEqual({
      status: "error",
      message: "unexpected",
    });
    expect(log).toHaveBeenCalledOnce();
  });

  it("keeps the first error per field", () => {
    expect(
      fieldErrorsFrom([
        { path: ["title"], message: "tooLong" },
        { path: ["title"], message: "required" },
        { path: [], message: "unrecognized" },
      ]),
    ).toEqual({ title: "tooLong", form: "unrecognized" });
  });

  it("reads FormData without files or framework fields", () => {
    const data = new FormData();
    data.append("title", "a");
    data.append("tag", "x");
    data.append("tag", "y");
    data.append("tag", "z");
    data.append("$ACTION_ID_abc", "");
    data.append("upload", new Blob(["x"]), "x.txt");
    expect(formDataObject(data)).toEqual({ title: "a", tag: ["x", "y", "z"] });
  });
});
