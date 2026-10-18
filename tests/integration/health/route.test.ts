import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { getDb } from "@/lib/db";

// `connection()` needs a live Next.js request scope; the E2E smoke test covers that path.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

describe("GET /api/health (real test database)", () => {
  it("is connected to the separate test database", async () => {
    const [row] = await getDb().$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(row?.name).toMatch(/_test$/);
  });

  it("reports the database as healthy", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" },
    });
  });

  it("runs on PostgreSQL 18 with native uuidv7()", async () => {
    const [row] = await getDb().$queryRaw<{ major: number; id: string }[]>`
      SELECT current_setting('server_version_num')::int / 10000 AS major, uuidv7()::text AS id
    `;
    expect(row?.major).toBe(18);
    // Version nibble 7 in the third group identifies a UUIDv7.
    expect(row?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("connects as a non-superuser role", async () => {
    const [row] = await getDb().$queryRaw<{ superuser: boolean }[]>`
      SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user
    `;
    expect(row?.superuser).toBe(false);
  });
});
